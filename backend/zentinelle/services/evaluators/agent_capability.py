"""
Agent capability policy evaluator.

Controls which actions an agent is allowed to perform based on
an allowlist, blocklist, and approval-required list.
"""
import fnmatch
import logging
from typing import Any, Dict, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import (BasePolicyEvaluator,
                                                 PolicyResult)

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
        agent_action = action

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
                        approval_required=True,
                    )
                from zentinelle.services.approvals import \
                    validate_policy_approval
                validation = validate_policy_approval(policy, action, user_id, context)
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
