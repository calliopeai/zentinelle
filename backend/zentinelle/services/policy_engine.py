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
        from django.contrib.auth import get_user_model
        from organization.models import SubOrganization
        User = get_user_model()

        # Build cache key
        cache_key = f"policies:{endpoint.organization_id}:{endpoint.id}:{user_id}:{sub_organization_id}"
        if policy_types:
            cache_key += f":{','.join(sorted(policy_types))}"

        # Check cache
        if use_cache:
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

        # Resolve user and sub-organization upfront
        user = None
        sub_org = None
        sub_org_ids = []

        if user_id:
            try:
                user = User.objects.select_related().get(username=user_id)
                if not sub_organization_id:
                    # Get sub_org from user's membership
                    membership = user.memberships.select_related(
                        'sub_organization'
                    ).filter(
                        organization=endpoint.organization,
                        is_active=True
                    ).first()
                    if membership and membership.sub_organization:
                        sub_org = membership.sub_organization
            except User.DoesNotExist:
                pass

        if sub_organization_id and not sub_org:
            try:
                sub_org = SubOrganization.objects.get(
                    id=sub_organization_id,
                    organization=endpoint.organization
                )
            except SubOrganization.DoesNotExist:
                pass

        if sub_org:
            # Get all ancestor sub-org IDs for hierarchy
            sub_org_ids = [sub_org.id] + [a.id for a in sub_org.get_ancestors()]

        # Build a single optimized query using Q objects
        # This replaces 5 separate queries with 1
        query_filter = Q(
            organization=endpoint.organization,
            enabled=True,
        )

        # Build scope conditions (OR together)
        scope_conditions = Q(scope_type=Policy.ScopeType.ORGANIZATION)

        if sub_org_ids:
            scope_conditions |= Q(
                scope_type=Policy.ScopeType.SUB_ORGANIZATION,
                scope_sub_organization_id__in=sub_org_ids
            )

        if endpoint.deployment_id:
            scope_conditions |= Q(
                scope_type=Policy.ScopeType.DEPLOYMENT,
                scope_deployment_id=endpoint.deployment_id
            )

        scope_conditions |= Q(
            scope_type=Policy.ScopeType.ENDPOINT,
            scope_endpoint_id=endpoint.id
        )

        if user:
            scope_conditions |= Q(
                scope_type=Policy.ScopeType.USER,
                scope_user_id=user.id
            )

        query_filter &= scope_conditions

        # Filter by policy types if specified
        if policy_types:
            query_filter &= Q(policy_type__in=policy_types)

        # Execute single optimized query with all related objects
        all_policies = list(
            Policy.objects.filter(query_filter)
            .select_related(
                'scope_sub_organization',
                'scope_deployment',
                'scope_endpoint',
                'scope_user',
                'created_by',
            )
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

        # Sort sub-org policies by hierarchy depth (ancestors first)
        if sub_org_ids and sub_org_policies:
            sub_org_depth = {id_: idx for idx, id_ in enumerate(reversed(sub_org_ids))}
            sub_org_policies.sort(
                key=lambda p: sub_org_depth.get(p.scope_sub_organization_id, 0)
            )

        # Merge policies - more specific and higher priority wins
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

    def invalidate_cache(self, organization_id: str) -> None:
        """
        Invalidate policy cache for an organization.
        Call this when policies are created/updated/deleted.
        """
        # In production, use cache.delete_pattern for Redis
        # For now, we rely on TTL expiration
        logger.info(f"Policy cache invalidation requested for org {organization_id}")

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
    ) -> EvaluationResult:
        """
        Evaluate policies for an action.
        Returns whether action is allowed and details.
        """
        context = context or {}

        # Check organization budget first (before policy evaluation)
        budget_check = self._check_organization_budget(endpoint, context)
        if not budget_check['allowed']:
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
            result = evaluator.evaluate(policy, action, user_id, context)

            results.append({
                'id': str(policy.id),
                'name': policy.name,
                'type': policy.policy_type,
                'result': 'pass' if result.passed else 'fail',
                'message': result.message,
            })

            if not result.passed:
                if policy.enforcement == Policy.Enforcement.ENFORCE:
                    allowed = False
                    denial_reason = result.message
                    logger.warning(
                        f"Policy violation: {policy.name} - {result.message} "
                        f"(endpoint={endpoint.agent_id}, action={action}, user={user_id})"
                    )
                else:  # audit mode
                    warnings.append(f"[Audit] {policy.name}: {result.message}")

            if result.warnings:
                warnings.extend(result.warnings)

        return EvaluationResult(
            allowed=allowed,
            reason=denial_reason,
            policies_evaluated=results,
            warnings=warnings,
            context=context,
        )

    def _get_evaluator(self, policy_type: str) -> 'BasePolicyEvaluator':
        """Get the appropriate evaluator for a policy type."""
        from zentinelle.services.evaluators import (
            ResourceQuotaEvaluator,
            BudgetLimitEvaluator,
            RateLimitEvaluator,
            ToolPermissionEvaluator,
            SecretAccessEvaluator,
            NoOpEvaluator,
        )

        evaluators = {
            Policy.PolicyType.RESOURCE_QUOTA: ResourceQuotaEvaluator(),
            Policy.PolicyType.BUDGET_LIMIT: BudgetLimitEvaluator(),
            Policy.PolicyType.RATE_LIMIT: RateLimitEvaluator(),
            Policy.PolicyType.TOOL_PERMISSION: ToolPermissionEvaluator(),
            Policy.PolicyType.SECRET_ACCESS: SecretAccessEvaluator(),
            # These policy types don't block actions, just configure behavior
            Policy.PolicyType.SYSTEM_PROMPT: NoOpEvaluator(),
            Policy.PolicyType.AI_GUARDRAIL: NoOpEvaluator(),
            Policy.PolicyType.AUDIT_POLICY: NoOpEvaluator(),
            Policy.PolicyType.SESSION_POLICY: NoOpEvaluator(),
            Policy.PolicyType.NETWORK_POLICY: NoOpEvaluator(),
            Policy.PolicyType.DATA_ACCESS: NoOpEvaluator(),
            Policy.PolicyType.DATA_RETENTION: NoOpEvaluator(),
        }
        return evaluators.get(policy_type, NoOpEvaluator())

    def _check_organization_budget(
        self,
        endpoint: AgentEndpoint,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Check if organization budget allows the action.

        Args:
            endpoint: The agent endpoint making the request
            context: Request context (may contain estimated_cost)

        Returns:
            Dict with 'allowed', 'reason', and optionally 'warning'
        """
        from decimal import Decimal

        org = endpoint.organization
        if not org:
            return {'allowed': True, 'reason': 'No organization context'}

        # Refresh org to get latest budget values
        org.refresh_from_db(fields=[
            'ai_budget_usd',
            'ai_budget_spent_usd',
            'overage_policy',
            'stripe_payment_method_id',
            'ai_budget_alert_threshold',
        ])

        # No budget configured = unlimited
        if not org.has_ai_budget:
            return {'allowed': True, 'reason': 'No budget limit configured'}

        # Get estimated cost from context if provided
        estimated_cost = Decimal(str(context.get('estimated_cost', 0)))

        # Check budget
        allowed, reason = org.check_ai_budget(estimated_cost)

        result = {
            'allowed': allowed,
            'reason': reason if not allowed else None,
        }

        # Add warning if approaching budget threshold
        if allowed and org.ai_budget_percentage_used >= org.ai_budget_alert_threshold:
            result['warning'] = (
                f"Budget alert: {org.ai_budget_percentage_used:.1f}% of "
                f"${org.ai_budget_usd} budget used (${org.ai_budget_spent_usd} spent)"
            )

        return result
