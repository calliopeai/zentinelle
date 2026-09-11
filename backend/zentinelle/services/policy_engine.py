"""
Policy Engine - Evaluates policies for agents with inheritance support.
"""
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from django.core.cache import cache
from django.db.models import Q

from zentinelle.models import AgentEndpoint, Policy

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
        cache_key = f"policies:v{version}:{tenant_id}:{endpoint.id}:{user_id}:{sub_organization_id}"
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

    def _merge_policies(self, policy_layers: List[List[Policy]]) -> List[Policy]:
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
    ) -> EvaluationResult:
        """
        Evaluate policies for an action.
        Returns whether action is allowed and details.

        When dry_run=True:
        - All policies are evaluated normally (to surface violations)
        - Counter-incrementing side effects are skipped (rate limits, etc.)
        - The final result always has allowed=True
        - The result has dry_run=True so callers can distinguish
        """
        from zentinelle.services.evaluation_context import normalize_context
        try:
            context = normalize_context(context or {})
        except (ValueError, TypeError) as exc:
            return EvaluationResult(allowed=False, reason=str(exc))
        context = {k: v for k, v in context.items() if not k.startswith('_')}
        from zentinelle.services.approvals import context_digest
        context['_approval_digest'] = context_digest(context)
        # Trusted workload identity always replaces caller-supplied values.
        context['_tenant_id'] = endpoint.tenant_id
        context['_endpoint_id'] = str(endpoint.id)

        policies = self.get_effective_policies(
            endpoint, user_id, policy_types=['output_filter'] if action == 'llm:response' else None,
        )

        results = []
        allowed = True
        denial_reason = None
        warnings = []

        for policy in policies:
            if policy.enforcement == Policy.Enforcement.DISABLED:
                continue

            evaluator = self._get_evaluator(policy.policy_type)
            try:
                result = evaluator.evaluate(policy, action, user_id, context, dry_run=dry_run)
            except Exception as exc:
                logger.error("Evaluator %s raised exception: %s", policy.policy_type, exc)
                result = PolicyResult(passed=False, message=f"Policy evaluation error: {policy.name}")

            results.append({
                'id': str(policy.id),
                'name': policy.name,
                'type': policy.policy_type,
                'result': 'pass' if result.passed else 'fail',
                'message': result.message,
            })

            if not result.passed:
                if policy.enforcement == Policy.Enforcement.ENFORCE:
                    if not dry_run:
                        allowed = False
                        denial_reason = result.message
                    logger.warning(
                        f"Policy violation{'(dry-run)' if dry_run else ''}: "
                        f"{policy.name} - {result.message} "
                        f"(endpoint={endpoint.agent_id}, action={action}, user={user_id})"
                    )
                    if dry_run:
                        warnings.append(f"[Dry-run] Would be denied: {policy.name}: {result.message}")
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

        from zentinelle.services.risk_scorer import RiskScorer
        scorer = RiskScorer()
        risk_score, risk_factors = scorer.compute(action, context, results, warnings)

        evaluation_result = EvaluationResult(
            allowed=True if dry_run else allowed,
            reason=None if dry_run else denial_reason,
            policies_evaluated=results,
            warnings=warnings,
            context=context,
            dry_run=dry_run,
            risk_score=risk_score,
            risk_factors=risk_factors,
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
                logger.warning("incident_service._maybe_create_incident failed: %s", exc)

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
        return PolicyEngine._evaluator_cache.get(policy_type, PolicyEngine._evaluator_cache['_noop'])

    def _check_organization_budget(self, endpoint, context):
        """Compatibility check using effective scope and server-owned spend."""
        from zentinelle.services.budgets import current_spend, monthly_limit
        for policy in self.get_effective_policies(endpoint, policy_types=['budget_limit']):
            if policy.enforcement == 'enforce' and policy.config.get('hard_limit', True):
                if current_spend(policy) >= monthly_limit(policy):
                    return {'allowed': False, 'reason': 'Monthly budget exceeded'}
        return {'allowed': True}
