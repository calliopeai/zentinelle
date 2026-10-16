"""
Human oversight policy evaluator.

Enforces human-in-the-loop approval requirements based on cost,
data sensitivity, and external call characteristics.
"""
import logging
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import (BasePolicyEvaluator,
                                                 PolicyResult)

logger = logging.getLogger(__name__)

# Token validity: 5 minutes by default; configurable via approval_timeout_seconds.
# We cap validation at the policy-configured timeout (default 300 s).
DEFAULT_APPROVAL_TIMEOUT_SECONDS = 300


def _declared_cost(value):
    """A non-negative finite cost as Decimal, or None if absent or invalid."""
    if value is None or isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        return None
    return amount if amount.is_finite() and amount >= 0 else None


class HumanOversightEvaluator(BasePolicyEvaluator):
    """
    Evaluates human_oversight policies.

    Config schema:
    {
        "require_approval_for": ["high_cost", "sensitive_data", "external_calls"],
        "approval_timeout_seconds": 300,
        "auto_approve_below_cost_usd": 0.10
    }

    Context keys:
    - "estimated_cost_usd": float   (optional; can only raise the server's cost)
    - "has_sensitive_data": bool    (optional)
    - "is_external_call": bool      (optional)
    - "approval_token": str         (optional) — signed approval

    Evaluation order:
    1. If auto_approve_below_cost_usd is set AND estimated_cost_usd is present
       AND estimated_cost_usd < threshold → allow immediately
    2. If a valid (non-expired) approval_token is present → allow
    3. Check whether any require_approval_for condition is triggered:
       - "high_cost":      the call's cost is at or above the threshold
                           (auto_approve_below_cost_usd, default 1.0 USD), or
                           a model call's cost is unknown. The cost is the
                           server's upper bound for a model call
                           (services/budgets.estimated_call_cost); a caller's
                           estimated_cost_usd can raise it, never lower it.
                           Any other action spends no model budget, so only a
                           cost the caller declares can trigger it.
       - "sensitive_data": has_sensitive_data is True
       - "external_calls": is_external_call is True
    4. If any condition is triggered → deny, asking caller to surface to a human
       and retry with an approval_token
    5. Otherwise → allow
    """

    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
        dry_run: bool = False,
    ) -> PolicyResult:
        config = policy.config

        from zentinelle.services.budgets import estimated_call_cost
        estimated_cost = estimated_call_cost(action, context)
        declared = _declared_cost(context.get('estimated_cost_usd'))
        if estimated_cost is not None and declared is not None:
            estimated_cost = max(estimated_cost, declared)
        has_sensitive_data = context.get('has_sensitive_data', False)
        is_external_call = context.get('is_external_call', False)
        approval_token = context.get('approval_token')

        require_approval_for = config.get('require_approval_for', [])
        config.get(
            'approval_timeout_seconds', DEFAULT_APPROVAL_TIMEOUT_SECONDS
        )
        auto_approve_threshold = config.get('auto_approve_below_cost_usd')

        # 3. Check require_approval_for conditions
        triggered_conditions = []

        if 'high_cost' in require_approval_for:
            threshold = _declared_cost(auto_approve_threshold if auto_approve_threshold is not None else 1.0)
            if estimated_cost is None:
                triggered_conditions.append("unknown cost (unpriced model or unbounded request)")
            elif threshold is None or (estimated_cost > 0 and estimated_cost >= threshold):
                triggered_conditions.append("high_cost")

        if 'sensitive_data' in require_approval_for:
            if has_sensitive_data:
                triggered_conditions.append("sensitive_data")

        if 'external_calls' in require_approval_for:
            if is_external_call:
                triggered_conditions.append("external_calls")

        # 4. Deny if any condition triggered
        if triggered_conditions and approval_token:
            from zentinelle.services.approvals import validate_policy_approval
            return validate_policy_approval(policy, action, user_id, context)

        if triggered_conditions:
            conditions_str = ', '.join(triggered_conditions)
            return PolicyResult(
                passed=False,
                message=(
                    f"Human approval required for: {conditions_str}. "
                    "Surface this to a human approver and retry with a valid approval_token."
                ),
                approval_required=True,
            )

        # 5. Allow
        return PolicyResult(passed=True)
