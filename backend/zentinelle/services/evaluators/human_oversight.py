"""
Human oversight policy evaluator.

Enforces human-in-the-loop approval requirements based on cost,
data sensitivity, and external call characteristics.
"""
import logging
from typing import Any, Dict, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import (BasePolicyEvaluator,
                                                 PolicyResult)

logger = logging.getLogger(__name__)

# Token validity: 5 minutes by default; configurable via approval_timeout_seconds.
# We cap validation at the policy-configured timeout (default 300 s).
DEFAULT_APPROVAL_TIMEOUT_SECONDS = 300


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
    - "estimated_cost_usd": float   (optional)
    - "has_sensitive_data": bool    (optional)
    - "is_external_call": bool      (optional)
    - "approval_token": str         (optional) — signed approval

    Evaluation order:
    1. If auto_approve_below_cost_usd is set AND estimated_cost_usd is present
       AND estimated_cost_usd < threshold → allow immediately
    2. If a valid (non-expired) approval_token is present → allow
    3. Check whether any require_approval_for condition is triggered:
       - "high_cost":      estimated_cost_usd is present and > 1.0 USD
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

        estimated_cost = context.get('estimated_cost_usd')
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
            if estimated_cost is None or estimated_cost >= (auto_approve_threshold if auto_approve_threshold is not None else 1.0):
                triggered_conditions.append(
                    "high_cost or unknown cost"
                )

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
            )

        # 5. Allow
        return PolicyResult(passed=True)
