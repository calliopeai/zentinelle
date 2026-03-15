"""
Policy Engine - Evaluates policies for agents with inheritance support.
"""
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from functools import lru_cache

from django.db.models import Q, Prefetch
from django.core.cache import cache

from zentinelle.models import Policy, AgentEndpoint

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

        # Build cache key
        cache_key = f"policies:{tenant_id}:{endpoint.id}:{user_id}:{sub_organization_id}"
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
        endpoint_policies = []
        user_policies = []

        for policy in all_policies:
            if policy.scope_type == Policy.ScopeType.ORGANIZATION:
                org_policies.append(policy)
            elif policy.scope_type == Policy.ScopeType.SUB_ORGANIZATION:
                sub_org_policies.append(policy)
            elif policy.scope_type == Policy.ScopeType.ENDPOINT:
                endpoint_policies.append(policy)
            elif policy.scope_type == Policy.ScopeType.USER:
                user_policies.append(policy)

        # Merge policies — more specific and higher priority wins
        result = self._merge_policies([
            org_policies,
            sub_org_policies,
            endpoint_policies,
            user_policies,
        ])

        # Cache result
        if use_cache:
            cache.set(cache_key, result, timeout=POLICY_CACHE_TTL)

        return result

    def invalidate_cache(self, tenant_id: str) -> None:
        """
        Invalidate policy cache for a tenant.
        Call this when policies are created/updated/deleted.
        """
        # In production, use cache.delete_pattern for Redis
        # For now, we rely on TTL expiration
        logger.info(f"Policy cache invalidation requested for tenant {tenant_id}")

    def _merge_policies(self, policy_layers: List[List[Policy]]) -> List[Policy]:
        """
        Merge policies from different scopes.
        Later layers override earlier ones for same policy_type.
        Within same layer, higher priority wins.
        """
        merged: Dict[str, Policy] = {}

        for layer in policy_layers:
            # Sort by priority within layer (lower priority first, so higher overwrites)
            layer.sort(key=lambda p: p.priority)

            for policy in layer:
                # Later layer always overrides, higher priority within layer overrides
                existing = merged.get(policy.policy_type)
                if existing is None or policy.priority >= existing.priority:
                    merged[policy.policy_type] = policy

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
        context = context or {}

        # Check organization budget first (before policy evaluation)
        # Skip hard budget denial in dry-run mode
        budget_check = self._check_organization_budget(endpoint, context)
        if not budget_check['allowed'] and not dry_run:
            return EvaluationResult(
                allowed=False,
                reason=budget_check['reason'],
                policies_evaluated=[{
                    'id': 'budget_check',
                    'name': 'Organization AI Budget',
                    'type': 'budget_limit',
                    'result': 'fail',
                    'message': budget_check['reason'],
                }],
                warnings=[],
                context=context,
                dry_run=False,
            )

        policies = self.get_effective_policies(endpoint, user_id)

        results = []
        allowed = True
        denial_reason = None
        warnings = []

        # Add budget warning if approaching limit
        if budget_check.get('warning'):
            warnings.append(budget_check['warning'])

        for policy in policies:
            if policy.enforcement == Policy.Enforcement.DISABLED:
                continue

            evaluator = self._get_evaluator(policy.policy_type)
            result = evaluator.evaluate(policy, action, user_id, context, dry_run=dry_run)

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

        from zentinelle.services.risk_scorer import RiskScorer
        scorer = RiskScorer()
        risk_score, risk_factors = scorer.compute(action, context, results, warnings)

        return EvaluationResult(
            allowed=True if dry_run else allowed,
            reason=None if dry_run else denial_reason,
            policies_evaluated=results,
            warnings=warnings,
            context=context,
            dry_run=dry_run,
            risk_score=risk_score,
            risk_factors=risk_factors,
        )

    def _get_evaluator(self, policy_type: str) -> 'BasePolicyEvaluator':
        """Get the appropriate evaluator for a policy type."""
        from zentinelle.services.evaluators import (
            ResourceQuotaEvaluator,
            BudgetLimitEvaluator,
            RateLimitEvaluator,
            ToolPermissionEvaluator,
            SecretAccessEvaluator,
            ModelRestrictionEvaluator,
            ContextLimitEvaluator,
            NetworkPolicyEvaluator,
            OutputFilterEvaluator,
            AgentCapabilityEvaluator,
            HumanOversightEvaluator,
            SystemPromptEvaluator,
            AIGuardrailEvaluator,
            AgentMemoryEvaluator,
            AuditPolicyEvaluator,
            SessionPolicyEvaluator,
            DataAccessEvaluator,
            DataRetentionEvaluator,
            PromptInjectionEvaluator,
            AgentDelegationEvaluator,
            BehavioralBaselineEvaluator,
            SessionQuotaEvaluator,
            NoOpEvaluator,
        )

        evaluators = {
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
        }
        return evaluators.get(policy_type, NoOpEvaluator())

    def _check_organization_budget(
        self,
        endpoint: AgentEndpoint,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Check if tenant budget allows the action.

        In standalone mode, budget enforcement is handled via BudgetLimit policies
        rather than organization FK lookups. This method is a no-op placeholder.
        """
        # TODO: implement budget check via BudgetLimit policy type
        return {'allowed': True, 'reason': 'Budget check via policies'}
