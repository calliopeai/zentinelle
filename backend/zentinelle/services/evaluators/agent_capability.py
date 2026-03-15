"""
Agent capability policy evaluator.

Controls which actions an agent is allowed to perform based on
an allowlist, blocklist, and approval-required list.
"""
import fnmatch
import logging
from typing import Dict, Any, Optional

from django.core import signing

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)

# Token validity: 24 hours (same as tool_permission)
APPROVAL_TOKEN_MAX_AGE = 60 * 60 * 24


class AgentCapabilityEvaluator(BasePolicyEvaluator):
    """
    Evaluates agent_capability policies.

    Config schema:
    {
        "allowed_actions": ["llm:invoke", "tool:search", "tool:code"],
        "denied_actions": ["tool:execute_shell", "tool:file_write"],
        "require_approval": ["tool:database_write"]
    }

    Supports fnmatch wildcards, e.g. "tool:*" matches "tool:search".

    Evaluation order:
    1. If action matches any denied_actions pattern → deny
    2. If action matches any require_approval pattern and no valid
       approval_token in context → deny with approval-required message
    3. If allowed_actions is non-empty and action does not match any
       allowed_actions pattern → deny
    4. Otherwise → allow
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

        # The "action" evaluated here is the agent action (e.g. "tool:search"),
        # passed in context["action"] when calling the policy engine, or falling
        # back to the top-level action parameter for direct use.
        agent_action = context.get('action', action)

        # 1. Explicit deny list
        denied_actions = config.get('denied_actions', [])
        for pattern in denied_actions:
            if fnmatch.fnmatch(agent_action, pattern):
                return PolicyResult(
                    passed=False,
                    message=f"Action '{agent_action}' is explicitly denied by policy '{policy.name}'",
                )

        # 2. Require-approval list
        require_approval = config.get('require_approval', [])
        for pattern in require_approval:
            if fnmatch.fnmatch(agent_action, pattern):
                approval_token = context.get('approval_token')
                if not approval_token:
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Action '{agent_action}' requires human approval. "
                            "Provide a valid approval_token to proceed."
                        ),
                    )
                validation = self._validate_approval_token(
                    token=approval_token,
                    action=agent_action,
                    user_id=user_id,
                    policy_id=str(policy.id),
                )
                if not validation.passed:
                    return validation
                # Approval validated — fall through to allowlist check
                break

        # 3. Allowlist (if specified)
        allowed_actions = config.get('allowed_actions', [])
        if allowed_actions:
            for pattern in allowed_actions:
                if fnmatch.fnmatch(agent_action, pattern):
                    return PolicyResult(passed=True)
            return PolicyResult(
                passed=False,
                message=(
                    f"Action '{agent_action}' is not in the allowed actions list. "
                    f"Allowed: {', '.join(allowed_actions)}"
                ),
            )

        return PolicyResult(passed=True)

    def _validate_approval_token(
        self,
        token: str,
        action: str,
        user_id: Optional[str],
        policy_id: str,
    ) -> PolicyResult:
        """
        Validate an approval token using the same HMAC approach as
        tool_permission.py (django.core.signing).

        Expected token payload:
        {
            "action": "tool:database_write",
            "policy": "policy_uuid",
            "user": "user_id" (optional),
            "granted_by": "approver_id",
            "reason": "approval reason",
        }
        """
        try:
            payload = signing.loads(
                token,
                salt='agent-capability-approval',
                max_age=APPROVAL_TOKEN_MAX_AGE,
            )

            if payload.get('action') != action:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Approval token is for action '{payload.get('action')}', "
                        f"not '{action}'"
                    ),
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
                "Agent capability approval validated: action=%s, user=%s, granted_by=%s",
                action,
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
            logger.error("Error validating agent capability approval token: %s", exc)
            return PolicyResult(
                passed=False,
                message="Failed to validate approval token",
            )
