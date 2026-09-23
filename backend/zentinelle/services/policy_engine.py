"""
Policy Engine - Evaluates policies for agents with inheritance support.
"""
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from django.core.cache import cache
from django.db.models import Q

from zentinelle.models import AgentEndpoint, Policy
from zentinelle.models.actions import Action, BlockLevel
from zentinelle.services.actions import Decision, denies, summarize

if TYPE_CHECKING:
    from zentinelle.services.evaluators.base import BasePolicyEvaluator


logger = logging.getLogger(__name__)

# Cache TTL for policy lookups (5 minutes)
POLICY_CACHE_TTL = 300


@dataclass
class PolicyResult:
    """Result of evaluating a single policy."""
    passed: bool
    message: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


@dataclass
class EvaluationResult:
    """Result of evaluating all policies for an action."""
    allowed: bool
    reason: Optional[str] = None
    policies_evaluated: List[Dict] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)
    dry_run: bool = False
    risk_score: int = 0
    risk_factors: List[Dict] = field(default_factory=list)
    coverage: Dict[str, Any] = field(default_factory=dict)
    # Denied only for want of a human approval: every enforced failure was an
    # approval-required result, so an approval_token could release the action.
    approval_required: bool = False
    # The decided action, its fallback chain and the rule that decided it
    # (services/actions.summarize, #396).
    enforcement: Dict[str, Any] = field(default_factory=dict)


class PolicyEngine:
    """
    Resolves effective policies for an endpoint using inheritance:
    Organization → SubOrganization → Deployment → Endpoint → User

    Higher priority policies override lower ones.
    More specific scopes override broader ones.
    """

    _evaluator_cache = None

    def get_effective_policies(
        self,
        endpoint: AgentEndpoint,
        user_id: Optional[str] = None,
        policy_types: Optional[List[str]] = None,
        sub_organization_id: Optional[str] = None,
        use_cache: bool = True,
    ) -> List[Policy]:
        """
        Get all effective policies for an endpoint, properly merged.

        Inheritance order (later overrides earlier):
        1. Organization-wide policies
        2. Sub-organization (team) policies
        3. Deployment-specific policies
        4. Endpoint-specific policies
        5. User-specific policies

        Optimized to use a single database query with select_related.
        Results are cached for POLICY_CACHE_TTL seconds.
        """
        tenant_id = endpoint.tenant_id
        sub_organization_id = endpoint.sub_organization_id_ext or sub_organization_id

        # Build versioned cache key — version bumps on policy changes
        version = cache.get(f"policies_version:{tenant_id}", 0)
        taxonomy_key = ','.join(
            sorted(
                (endpoint.metadata or {}).get(
                    'taxonomy',
                    {}).get(
                    'supported',
                    [])))
        cache_key = f"policies:v{version}:{tenant_id}:{
            endpoint.id}:{user_id}:{sub_organization_id}:{taxonomy_key}"
        if policy_types:
            cache_key += f":{','.join(sorted(policy_types))}"

        # Check cache
        if use_cache:
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

        # Build scope conditions (OR together):
        # - Tenant-wide (organization scope) policies
        # - Sub-org policies (by external ID)
        # - Endpoint-specific policies
        # - User-specific policies
        scope_conditions = Q(scope_type=Policy.ScopeType.ORGANIZATION)

        if sub_organization_id:
            scope_conditions |= Q(
                scope_type=Policy.ScopeType.SUB_ORGANIZATION,
                scope_sub_organization_id_ext=sub_organization_id,
            )

        if endpoint.deployment_id_ext:
            scope_conditions |= Q(
                scope_type=Policy.ScopeType.DEPLOYMENT,
                scope_deployment_id_ext=endpoint.deployment_id_ext,
            )

        scope_conditions |= Q(
            scope_type=Policy.ScopeType.ENDPOINT,
            scope_endpoint=endpoint,
        )

        if user_id:
            scope_conditions |= Q(
                scope_type=Policy.ScopeType.USER,
                scope_user_id_ext=user_id,
            )

        query_filter = Q(tenant_id=tenant_id, enabled=True) & scope_conditions

        # Filter by policy types if specified
        if policy_types:
            query_filter &= Q(policy_type__in=policy_types)

        # Execute single optimized query
        all_policies = list(
            Policy.objects.filter(query_filter)
            .select_related('scope_endpoint')
            .order_by('priority')
        )

        # Taxonomy selectors are additive: a policy with selectors applies only
        # when every selector is present on the endpoint.  Unselected policies
        # retain the existing hierarchy semantics.
        endpoint_tags = set(
            (endpoint.metadata or {}).get(
                'taxonomy',
                {}).get(
                'supported',
                []))
        all_policies = [
            p for p in all_policies if self._taxonomy_matches(
                p, endpoint_tags)]

        # Group policies by scope for proper merging
        org_policies = []
        sub_org_policies = []
        deployment_policies = []
        endpoint_policies = []
        user_policies = []

        for policy in all_policies:
            if policy.scope_type == Policy.ScopeType.ORGANIZATION:
                org_policies.append(policy)
            elif policy.scope_type == Policy.ScopeType.SUB_ORGANIZATION:
                sub_org_policies.append(policy)
            elif policy.scope_type == Policy.ScopeType.DEPLOYMENT:
                deployment_policies.append(policy)
            elif policy.scope_type == Policy.ScopeType.ENDPOINT:
                endpoint_policies.append(policy)
            elif policy.scope_type == Policy.ScopeType.USER:
                user_policies.append(policy)

        # Merge policies — more specific and higher priority wins
        result = self._merge_policies([
            org_policies,
            sub_org_policies,
            deployment_policies,
            endpoint_policies,
            user_policies,
        ])

        # Cache result
        if use_cache:
            cache.set(cache_key, result, timeout=POLICY_CACHE_TTL)

        return result

    @staticmethod
    def _taxonomy_matches(policy: Policy, endpoint_tags: set) -> bool:
        selectors = policy.config.get(
            'taxonomy_selectors',
            []) if isinstance(
            policy.config,
            dict) else []
        if not selectors:
            return True
        if not isinstance(
                selectors,
                list) or not all(
                isinstance(
                item,
                str) for item in selectors):
            logger.warning(
                'Malformed taxonomy selectors on policy %s; retaining for fail-closed evaluation',
                policy.id)
            return True
        return set(selectors).issubset(endpoint_tags)

    def invalidate_cache(self, tenant_id: str) -> None:
        """
        Invalidate policy cache for a tenant by bumping a version counter.
        Call this when policies are created/updated/deleted.

        Race window: a request in-flight when the version bumps may use the
        old cache key for its remaining duration. This is at most the time
        between the version read and the DB query — typically microseconds.
        The 5-minute cache TTL bounds maximum staleness.
        """
        version_key = f"policies_version:{tenant_id}"
        try:
            cache.incr(version_key)
        except ValueError:
            cache.set(version_key, 1, timeout=None)
        logger.info(f"Policy cache invalidated for tenant {tenant_id}")

    def _merge_policies(self,
                        policy_layers: List[List[Policy]]) -> List[Policy]:
        """
        Merge policies from different scopes.
        Later layers override earlier ones for same policy_type.
        Within same layer, higher priority wins.
        """
        merged = {}
        for layer in policy_layers:
            for policy in sorted(layer, key=lambda p: (p.priority, str(p.id))):
                # Blank groups and mandatory constraints always compose.
                if policy.non_overridable or not policy.override_group:
                    key = ('independent', str(policy.id))
                else:
                    key = (policy.policy_type, policy.override_group)
                merged[key] = policy
        return list(merged.values())

    def evaluate(
        self,
        endpoint: AgentEndpoint,
        action: str,
        user_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        dry_run: bool = False,
        target_capabilities: Optional[Dict[str, bool]] = None,
    ) -> EvaluationResult:
        """
        Evaluate policies for an action.
        Returns whether action is allowed and details.

        When dry_run=True:
        - All policies are evaluated normally (to surface violations)
        - Counter-incrementing side effects are skipped (rate limits, etc.)
        - The final result always has allowed=True
        - The result has dry_run=True so callers can distinguish

        Each failed policy's action is decided from its configured action,
        its escalation and its mode (services/actions.py, #396); the result's
        `enforcement` is the strongest of those decisions. target_capabilities
        is what the caller said it can honour: it picks `selected` from the
        fallback chain and never changes `allowed`. A redact decision refuses
        the call whatever the caller declares, because no evaluator returns
        redacted content for a target to pass on in place of the original.
        """
        from zentinelle.services.actions import refusal
        from zentinelle.services.evaluation_context import normalize_context
        try:
            context = normalize_context(context or {})
        except (ValueError, TypeError) as exc:
            return EvaluationResult(allowed=False, reason=str(exc), enforcement=refusal(target_capabilities))
        from zentinelle.services.authority import normalize_authority
        authority_supplied = 'authority' in context
        try:
            authority = normalize_authority(context.get('authority'))
        except (ValueError, TypeError) as exc:
            return EvaluationResult(allowed=False, reason=str(exc), enforcement=refusal(target_capabilities))
        claimed_tenant = authority.get('tenant_id')
        if claimed_tenant is not None and claimed_tenant != str(endpoint.tenant_id):
            return EvaluationResult(
                allowed=False,
                reason='authority tenant_id does not match authenticated endpoint',
                context={'authority': authority},
                enforcement=refusal(target_capabilities),
            )
        if authority_supplied:
            authority['tenant_id'] = str(endpoint.tenant_id)
            authority['endpoint_id'] = str(endpoint.id)
            context['authority'] = authority
        context = {k: v for k, v in context.items() if not k.startswith('_')}
        from zentinelle.services.approvals import context_digest
        context['_approval_digest'] = context_digest(context)
        # Trusted workload identity always replaces caller-supplied values.
        context['_tenant_id'] = endpoint.tenant_id
        context['_endpoint_id'] = str(endpoint.id)
        # Preserve the complete taxonomy decision context in traces and
        # incident evidence. Unsupported labels remain visible to operators;
        # only canonical/tenant-approved labels participate in selection.
        context['taxonomy'] = (endpoint.metadata or {}).get(
            'taxonomy', {'supported': [], 'unsupported': []})

        policies = self.get_effective_policies(
            endpoint, user_id, policy_types=['output_filter'] if action == 'llm:response' else None,
        )

        results = []
        coverage_counts = {
            'enforced': 0,
            'observation_only': 0,
            'unsupported': 0}
        # Every evaluated policy, in order: (policy, result entry, evaluator
        # result, malformed-selector message). Actions are decided once all
        # have run, because severity escalation reads the whole evaluation.
        outcomes = []

        for policy in policies:
            if policy.enforcement == Policy.Enforcement.DISABLED:
                continue

            selectors = policy.config.get('taxonomy_selectors') if isinstance(
                policy.config, dict) else None
            if selectors is not None and (
                not isinstance(
                    selectors,
                    list) or not all(
                    isinstance(
                    item,
                    str) and ':' in item for item in selectors)):
                message = f"Policy {
                    policy.name} has malformed taxonomy selectors"
                entry = {
                    'id': str(
                        policy.id),
                    'version': policy.version,
                    'name': policy.name,
                    'type': policy.policy_type,
                    'result': 'fail',
                    'message': message,
                    'matched_selectors': selectors if isinstance(
                        selectors,
                        list) else [],
                    'coverage': 'enforced' if policy.enforcement == Policy.Enforcement.ENFORCE else 'observation_only',
                    'action': None,
                    'block_level': None}
                results.append(entry)
                outcomes.append((policy, entry, None, message))
                continue

            evaluator = self._get_evaluator(policy.policy_type)
            # Tests and embedding callers may replace _get_evaluator; in that
            # case the returned evaluator itself is the authority for support.
            supported = (True if self._evaluator_cache is None else
                         policy.policy_type in self._evaluator_cache)
            coverage_status = ('unsupported' if not supported else
                               'enforced' if policy.enforcement == Policy.Enforcement.ENFORCE else
                               'observation_only')
            coverage_counts[coverage_status] += 1
            try:
                result = evaluator.evaluate(
                    policy, action, user_id, context, dry_run=dry_run)
            except Exception as exc:
                logger.error(
                    "Evaluator %s raised exception: %s",
                    policy.policy_type,
                    exc)
                result = PolicyResult(
                    passed=False,
                    message=f"Policy evaluation error: {
                        policy.name}")

            entry = {
                'id': str(policy.id),
                'version': policy.version,
                'name': policy.name,
                'type': policy.policy_type,
                'result': 'pass' if result.passed else 'fail',
                'message': result.message,
                'matched_selectors': policy.config.get('taxonomy_selectors', [])
                if isinstance(policy.config, dict) else [],
                'coverage': coverage_status,
                'action': None,
                'block_level': None,
            }
            results.append(entry)
            outcomes.append((policy, entry, result, None))

        allowed = True
        denial_reason = None
        # Cleared by any enforced denial that an approval cannot release.
        approval_only = True
        warnings = []
        decisions = []
        severity = self._escalation_severity(action, context, results, outcomes)
        for policy, entry, result, malformed in outcomes:
            if malformed is not None:
                # A rule that cannot be read fails closed: refused under
                # enforce, recorded under audit, and never escalated.
                decision = self._fail_closed(policy)
                entry['action'], entry['block_level'] = decision.action, decision.block_level
                decisions.append(decision)
                if policy.enforcement == Policy.Enforcement.ENFORCE and not dry_run:
                    allowed = False
                    denial_reason = malformed
                    approval_only = False
                else:
                    warnings.append(malformed)
                continue

            if not result.passed:
                decision = self._decide(policy, result, endpoint, action, context, severity, dry_run)
                if self._released_by_approval(decision, result, policy, action, user_id, context):
                    entry['result'] = 'pass'
                    entry['approved'] = True
                else:
                    entry['action'], entry['block_level'] = decision.action, decision.block_level
                    decisions.append(decision)
                    if policy.enforcement == Policy.Enforcement.ENFORCE:
                        if denies(decision):
                            if not dry_run:
                                allowed = False
                                denial_reason = result.message
                                if decision.action != Action.REQUIRE_APPROVAL:
                                    approval_only = False
                            logger.warning(
                                f"Policy violation{'(dry-run)' if dry_run else ''}: "
                                f"{policy.name} - {result.message} "
                                f"(endpoint={endpoint.agent_id}, action={action}, user={user_id})"
                            )
                            if dry_run:
                                warnings.append(
                                    f"[Dry-run] Would be denied: {policy.name}: {result.message}")
                        elif decision.action == Action.WARN:
                            warnings.append(f"[Warn] {policy.name}: {result.message}")
                        elif decision.action == Action.STEER:
                            warnings.append(f"[Steer] {policy.name}: {decision.message}")
                    else:  # audit mode
                        warnings.append(f"[Audit] {policy.name}: {result.message}")

            if result.warnings:
                warnings.extend(result.warnings)

        if allowed and not dry_run:
            from zentinelle.services.budgets import admit
            admission_error = admit(policies, endpoint, action, context)
            if admission_error:
                allowed = False
                denial_reason = admission_error
                approval_only = False
                decisions.append(Decision(action=Action.BLOCK.value, block_level=BlockLevel.TOOL_CALL.value,
                                          mode=Policy.Enforcement.ENFORCE.value, configured_action=None))

        from zentinelle.services.risk_scorer import RiskScorer
        scorer = RiskScorer()
        risk_score, risk_factors = scorer.compute(
            action, context, results, warnings)

        # No evaluator returns redacted content, so a target that redacts has
        # nothing to pass on here: `selected` falls back past redact, as
        # `allowed` already does, whatever the caller declares.
        honourable = None if target_capabilities is None else {**target_capabilities, 'supports_redact': False}
        evaluation_result = EvaluationResult(
            allowed=True if dry_run else allowed,
            reason=None if dry_run else denial_reason,
            policies_evaluated=results,
            warnings=warnings,
            context=context,
            dry_run=dry_run,
            risk_score=risk_score,
            risk_factors=risk_factors,
            coverage={
                'status': ('unsupported' if coverage_counts['unsupported'] else
                           'enforced' if coverage_counts['enforced'] else
                           'observation_only' if coverage_counts['observation_only'] else 'unknown'),
                'counts': coverage_counts,
            },
            approval_required=not dry_run and not allowed and approval_only,
            enforcement=summarize(decisions, honourable),
        )

        # Auto-create incidents for policy violations (skipped in dry_run mode)
        if not dry_run and not allowed:
            try:
                from zentinelle.services.incident_service import \
                    _maybe_create_incident
                _maybe_create_incident(
                    tenant_id=endpoint.tenant_id,
                    result=evaluation_result,
                    policies=policies,
                )
            except Exception as exc:
                logger.warning(
                    "incident_service._maybe_create_incident failed: %s", exc)

            # Notify on policy violation
            try:
                from zentinelle.models.notification import (
                    Notification, create_notification)
                create_notification(
                    tenant_id=endpoint.tenant_id,
                    type=Notification.Type.POLICY_VIOLATION,
                    subject=f"Policy violation: {denial_reason[:100] if denial_reason else 'Request blocked'}",
                    message=denial_reason or "A request was blocked by policy enforcement.",
                    metadata={'action': action, 'agent_id': endpoint.agent_id},
                )
            except Exception as exc:
                logger.warning("notification creation failed: %s", exc)

        # An alert decision notifies the tenant's owners whether or not the
        # call went ahead.
        if not dry_run:
            for decision in decisions:
                if decision.action != Action.ALERT:
                    continue
                try:
                    from zentinelle.models.notification import (
                        Notification, create_notification)
                    create_notification(
                        tenant_id=endpoint.tenant_id,
                        type=Notification.Type.POLICY_VIOLATION,
                        subject=f"Policy alert: {decision.rule['name'][:100]}",
                        message=next((e['message'] for e in results if e['id'] == decision.rule['id']), '') or '',
                        metadata={'action': action, 'agent_id': endpoint.agent_id,
                                  'policy_id': decision.rule['id']},
                    )
                except Exception as exc:
                    logger.warning("notification creation failed: %s", exc)

        # Notify on high risk score (>= 75), even if allowed
        if not dry_run and risk_score >= 75:
            try:
                from zentinelle.models.notification import (
                    Notification, create_notification)
                create_notification(
                    tenant_id=endpoint.tenant_id,
                    type=Notification.Type.HIGH_RISK,
                    subject=f"High risk score: {risk_score}/100 for agent {endpoint.agent_id}",
                    message=f"Action '{action}' produced a risk score of {risk_score}/100.",
                    metadata={'action': action, 'risk_score': risk_score, 'agent_id': endpoint.agent_id},
                )
            except Exception as exc:
                logger.warning("notification creation failed: %s", exc)

        return evaluation_result

    @staticmethod
    def _rule_ref(policy: Policy) -> Dict[str, Any]:
        return {'type': 'policy', 'id': str(policy.id), 'name': policy.name, 'version': policy.version}

    def _fail_closed(self, policy: Policy) -> Decision:
        if policy.enforcement == Policy.Enforcement.ENFORCE:
            return Decision(action=Action.BLOCK.value, block_level=BlockLevel.TOOL_CALL.value,
                            mode=policy.enforcement, configured_action=policy.action, rule=self._rule_ref(policy))
        return Decision(action=Action.LOG.value, block_level=None, mode=policy.enforcement,
                        configured_action=policy.action, rule=self._rule_ref(policy),
                        capped_from=Action.BLOCK.value)

    @staticmethod
    def _escalation_severity(action, context, results, outcomes) -> Optional[str]:
        """How severe this evaluation is, for rules that escalate by severity.

        The same score-to-severity mapping incidents use, over what a live
        evaluation would score. A dry run adds 'would be denied' warnings the
        scorer counts; those follow from the decision, so they are left out
        and a dry run previews the live decision.
        """
        if not any(result is not None and not result.passed and (policy.escalation or {}).get('severity')
                   for policy, _entry, result, _malformed in outcomes):
            return None
        signals = []
        for policy, _entry, result, _malformed in outcomes:
            if result is None:
                continue
            if not result.passed and policy.enforcement == Policy.Enforcement.AUDIT:
                signals.append(f"[Audit] {policy.name}: {result.message}")
            signals.extend(result.warnings)
        from zentinelle.services.incident_service import \
            _risk_score_to_severity
        from zentinelle.services.risk_scorer import RiskScorer
        score, _factors = RiskScorer().compute(action, context, results, signals)
        return _risk_score_to_severity(score)

    def _decide(self, policy, result, endpoint, action, context, severity, dry_run) -> Decision:
        from zentinelle.services.actions import (count_match, decide,
                                                 render_steer)
        escalation = policy.escalation or {}
        count = None
        if escalation.get('repeat'):
            count = count_match(tenant_id=endpoint.tenant_id, kind='policy', rule_id=str(policy.id),
                                scope_id=str(endpoint.id), window_seconds=escalation['window_seconds'],
                                record=not dry_run)
        decision = decide(action=policy.action, block_level=policy.block_level, escalation=escalation,
                          mode=policy.enforcement, count=count, severity=severity,
                          approval_kind=getattr(result, 'approval_required', False),
                          rule=self._rule_ref(policy))
        if decision.action == Action.STEER:
            decision.message = render_steer(policy.steer_message, {
                'rule': policy.name, 'reason': result.message, 'action': action,
                'tool': context.get('tool_name') or context.get('tool') or '', 'agent': endpoint.agent_id,
            })
        return decision

    @staticmethod
    def _released_by_approval(decision, result, policy, action, user_id, context) -> bool:
        """Whether a valid approval releases a require_approval decision.

        Evaluators that ask for approval check the token themselves. A policy
        whose own action is require_approval can match on anything, so the
        engine checks the token for it, with the same binding to identity,
        the exact action and the policy's version, consumed at admission.
        """
        if (decision.mode != Policy.Enforcement.ENFORCE or decision.action != Action.REQUIRE_APPROVAL
                or getattr(result, 'approval_required', False) or not context.get('approval_token')):
            return False
        from zentinelle.services.approvals import validate_policy_approval
        return validate_policy_approval(policy, action, user_id, context).passed

    def _get_evaluator(self, policy_type: str) -> 'BasePolicyEvaluator':
        """Get the appropriate evaluator for a policy type (cached)."""
        if PolicyEngine._evaluator_cache is None:
            from zentinelle.services.evaluators import (
                AgentCapabilityEvaluator, AgentDelegationEvaluator,
                AgentMemoryEvaluator, AIGuardrailEvaluator,
                AuditPolicyEvaluator, BehavioralBaselineEvaluator,
                BudgetLimitEvaluator, ContextLimitEvaluator,
                DataAccessEvaluator, DataRetentionEvaluator,
                HumanOversightEvaluator, ModelRestrictionEvaluator,
                MultimodalPolicyEvaluator, NetworkPolicyEvaluator,
                NoOpEvaluator, OutputFilterEvaluator, PromptInjectionEvaluator,
                RateLimitEvaluator, ResourceQuotaEvaluator,
                SafetySettingsEvaluator, SecretAccessEvaluator,
                SessionPolicyEvaluator, SessionQuotaEvaluator,
                SystemPromptEvaluator, ToolPermissionEvaluator)

            PolicyEngine._evaluator_cache = {
                Policy.PolicyType.RESOURCE_QUOTA: ResourceQuotaEvaluator(),
                Policy.PolicyType.BUDGET_LIMIT: BudgetLimitEvaluator(),
                Policy.PolicyType.RATE_LIMIT: RateLimitEvaluator(),
                Policy.PolicyType.TOOL_PERMISSION: ToolPermissionEvaluator(),
                Policy.PolicyType.SECRET_ACCESS: SecretAccessEvaluator(),
                Policy.PolicyType.MODEL_RESTRICTION: ModelRestrictionEvaluator(),
                Policy.PolicyType.CONTEXT_LIMIT: ContextLimitEvaluator(),
                Policy.PolicyType.NETWORK_POLICY: NetworkPolicyEvaluator(),
                Policy.PolicyType.OUTPUT_FILTER: OutputFilterEvaluator(),
                Policy.PolicyType.AGENT_CAPABILITY: AgentCapabilityEvaluator(),
                Policy.PolicyType.HUMAN_OVERSIGHT: HumanOversightEvaluator(),
                Policy.PolicyType.SYSTEM_PROMPT: SystemPromptEvaluator(),
                Policy.PolicyType.AI_GUARDRAIL: AIGuardrailEvaluator(),
                Policy.PolicyType.AGENT_MEMORY: AgentMemoryEvaluator(),
                Policy.PolicyType.AUDIT_POLICY: AuditPolicyEvaluator(),
                Policy.PolicyType.SESSION_POLICY: SessionPolicyEvaluator(),
                Policy.PolicyType.DATA_ACCESS: DataAccessEvaluator(),
                Policy.PolicyType.DATA_RETENTION: DataRetentionEvaluator(),
                Policy.PolicyType.PROMPT_INJECTION: PromptInjectionEvaluator(),
                Policy.PolicyType.AGENT_DELEGATION: AgentDelegationEvaluator(),
                Policy.PolicyType.BEHAVIORAL_BASELINE: BehavioralBaselineEvaluator(),
                Policy.PolicyType.SESSION_QUOTA: SessionQuotaEvaluator(),
                Policy.PolicyType.SAFETY_SETTINGS: SafetySettingsEvaluator(),
                Policy.PolicyType.MULTIMODAL_POLICY: MultimodalPolicyEvaluator(),
                '_noop': NoOpEvaluator(),
            }
        return PolicyEngine._evaluator_cache.get(
            policy_type, PolicyEngine._evaluator_cache['_noop'])

    def _check_organization_budget(self, endpoint, context):
        """Compatibility check using effective scope and server-owned spend."""
        from zentinelle.services.budgets import current_spend, monthly_limit
        for policy in self.get_effective_policies(
                endpoint, policy_types=['budget_limit']):
            if policy.enforcement == 'enforce' and policy.config.get(
                    'hard_limit', True):
                if current_spend(policy) >= monthly_limit(policy):
                    return {
                        'allowed': False,
                        'reason': 'Monthly budget exceeded'}
        return {'allowed': True}
