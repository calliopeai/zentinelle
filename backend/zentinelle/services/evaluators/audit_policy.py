"""
Audit policy evaluator.

Validates that required audit context fields are present before allowing
an action. Ensures audit trail completeness.
"""
import logging
from typing import Dict, Any, Optional, List

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


class AuditPolicyEvaluator(BasePolicyEvaluator):
    """
    Evaluates audit_policy policies.

    Config schema:
    {
        "required_fields": ["user_id", "session_id", "request_id"],
        "required_for_actions": ["tool:*", "llm:invoke"],
        "log_level": "info",
        "pii_masking": true,
        "retention_days": 90
    }

    Checks that all required_fields are present in the context before
    allowing actions that match required_for_actions patterns.

    If required_for_actions is empty, required_fields are checked on
    every action.
    """

    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
        dry_run: bool = False,
    ) -> PolicyResult:
        import fnmatch
        config = policy.config
        warnings = []

        required_fields: List[str] = config.get('required_fields', [])
        required_for_actions: List[str] = config.get('required_for_actions', [])

        # Determine if this action requires the audit fields
        if required_for_actions:
            action_applies = any(
                fnmatch.fnmatch(action, pattern)
                for pattern in required_for_actions
            )
            if not action_applies:
                return PolicyResult(passed=True)

        # Check all required fields are present in context
        missing = []
        for field in required_fields:
            if field not in context or context[field] is None or context[field] == '':
                missing.append(field)

        if missing:
            return PolicyResult(
                passed=False,
                message=(
                    f"Audit policy '{policy.name}' requires the following context fields "
                    f"that are missing or empty: {', '.join(missing)}."
                ),
            )

        # Surface informational warnings
        pii_masking = config.get('pii_masking', False)
        if pii_masking and context.get('pii_detected'):
            warnings.append(
                "PII detected in context — audit logging will apply PII masking."
            )

        retention_days = config.get('retention_days')
        if retention_days:
            warnings.append(
                f"Audit records for this action will be retained for {retention_days} days."
            )

        return PolicyResult(passed=True, warnings=warnings)
