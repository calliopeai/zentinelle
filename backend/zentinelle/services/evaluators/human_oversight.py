"""
Human oversight policy evaluator.

Enforces human-in-the-loop approval requirements based on cost,
data sensitivity, and external call characteristics.
"""
import logging
from typing import Dict, Any, Optional

from django.core import signing

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

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
        approval_timeout = config.get(
            'approval_timeout_seconds', DEFAULT_APPROVAL_TIMEOUT_SECONDS
        )
        auto_approve_threshold = config.get('auto_approve_below_cost_usd')

        # 1. Auto-approve by cost threshold
        if (
            auto_approve_threshold is not None
            and estimated_cost is not None
            and estimated_cost < auto_approve_threshold
        ):
            return PolicyResult(passed=True)

        # 2. Validate existing approval token
        if approval_token:
            validation = self._validate_approval_token(
                token=approval_token,
                user_id=user_id,
                policy_id=str(policy.id),
                max_age=approval_timeout,
            )
            if validation.passed:
                return PolicyResult(passed=True)
            # Token present but invalid — fall through to condition check
            # so we give the caller a clear message about what triggered denial
            logger.debug(
                "Human oversight: approval token invalid (%s), continuing evaluation",
                validation.message,
            )

        # 3. Check require_approval_for conditions
        triggered_conditions = []

        if 'high_cost' in require_approval_for:
            if estimated_cost is not None and estimated_cost > 1.0:
                triggered_conditions.append(
                    f"high_cost (estimated ${estimated_cost:.4f} > $1.00)"
                )

        if 'sensitive_data' in require_approval_for:
            if has_sensitive_data:
                triggered_conditions.append("sensitive_data")

        if 'external_calls' in require_approval_for:
            if is_external_call:
                triggered_conditions.append("external_calls")

        # 4. Deny if any condition triggered
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

    def _validate_approval_token(
        self,
        token: str,
        user_id: Optional[str],
        policy_id: str,
        max_age: int = DEFAULT_APPROVAL_TIMEOUT_SECONDS,
    ) -> PolicyResult:
        """
        Validate an approval token using the same HMAC approach as
        tool_permission.py (django.core.signing).

        Expected token payload:
        {
            "policy": "policy_uuid",
            "user": "user_id" (optional),
            "granted_by": "approver_id",
            "reason": "approval reason",
        }
        """
        try:
            payload = signing.loads(
                token,
                salt='human-oversight-approval',
                max_age=max_age,
            )

            if 'policy' in payload and payload['policy'] != policy_id:
                return PolicyResult(
                    passed=False,
                    message="Approval token was issued for a different policy",
                )

            if 'user' in payload and user_id and payload['user'] != user_id:
                return PolicyResult(
                    passed=False,
                    message="Approval token was issued for a different user",
                )

            logger.info(
                "Human oversight approval validated: user=%s, granted_by=%s",
                user_id,
                payload.get('granted_by'),
            )
            return PolicyResult(passed=True)

        except signing.SignatureExpired:
            return PolicyResult(
                passed=False,
                message="Approval token has expired. Please request new approval.",
            )
        except signing.BadSignature:
            return PolicyResult(
                passed=False,
                message="Invalid approval token. Please request proper approval.",
            )
        except Exception as exc:
            logger.error("Error validating human oversight approval token: %s", exc)
            return PolicyResult(
                passed=False,
                message="Failed to validate approval token",
            )
