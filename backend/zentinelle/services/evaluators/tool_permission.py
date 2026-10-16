"""
Tool permission (RBAC) policy evaluator.
"""
import logging
from typing import Any, Dict, Optional

from zentinelle.models import Policy
from zentinelle.services import tool_arguments
from zentinelle.services.evaluators.base import (BasePolicyEvaluator,
                                                 PolicyResult)

logger = logging.getLogger(__name__)

# Token validity (24 hours)
APPROVAL_TOKEN_MAX_AGE = 60 * 60 * 24


class ToolPermissionEvaluator(BasePolicyEvaluator):
    """
    Evaluates tool_permission policies for RBAC on agent tools.

    Config schema:
    {
        "allowed_tools": ["search", "read_file", "execute_sql"],
        "denied_tools": ["delete_file", "shell", "sudo"],
        "requires_approval": ["delete_database", "send_email"],
        "tool_configs": {
            "execute_sql": {
                "read_only": true,
                "max_rows": 1000,
            },
            "Bash": {
                "blocked_commands": ["rm -rf *"],
                "allowed_commands": ["npm test", "npm run *"],
            },
            "Write": {
                "allowed_paths": ["/workspace"],
                "blocked_paths": ["/workspace/.git"],
            }
        }
    }

    tool_configs is keyed by the tool's name as the caller sends it, so a
    harness's own tools (Claude's Bash, Read, Write, Edit; Codex's shell and
    apply_patch; Calliope AI's shell, read_file, write_file) take command and
    path rules. They read context.tool_input, as agent hosts send it, and
    context.tool_args, as older callers do; a call carrying both must pass
    with each. See services/tool_arguments.py for how commands and paths are
    matched.
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

        # Only evaluate for tool_call actions
        if action != 'tool_call':
            return PolicyResult(passed=True)

        tool_name = context.get('tool_name') or context.get('tool')
        if not tool_name:
            return PolicyResult(passed=False, message='Tool name is required')

        # Check denied tools first (explicit deny)
        denied_tools = config.get('denied_tools', [])
        if tool_name in denied_tools:
            return PolicyResult(
                passed=False,
                message=f"Tool '{tool_name}' is explicitly denied"
            )

        # Check allowed tools (if specified, only these are allowed)
        allowed_tools = config.get('allowed_tools', [])
        if allowed_tools and tool_name not in allowed_tools:
            return PolicyResult(
                passed=False,
                message=f"Tool '{tool_name}' is not in allowed list. Allowed: {', '.join(allowed_tools)}"
            )

        # Argument rules come before approval: a call its arguments refuse is
        # denied outright, never held for a human to release.
        tool_configs = config.get('tool_configs') or {}
        tool_config = tool_configs.get(tool_name) if isinstance(tool_configs, dict) else None
        if tool_config:
            validation_result = self._validate_tool_args(tool_name, tool_config, context)
            if not validation_result.passed:
                return validation_result

        # Check if tool requires approval
        requires_approval = config.get('requires_approval', [])
        if tool_name in requires_approval:
            # Check if approval was provided
            approval_token = context.get('approval_token')
            if not approval_token:
                return PolicyResult(
                    passed=False,
                    message=f"Tool '{tool_name}' requires approval. Request approval before proceeding.",
                    approval_required=True,
                )

            # Validate approval token
            from zentinelle.services.approvals import validate_policy_approval
            validation_result = validate_policy_approval(policy, action, user_id, context)
            if not validation_result.passed:
                return validation_result

        return PolicyResult(passed=True)

    def _validate_tool_args(
        self,
        tool_name: str,
        tool_config: Any,
        context: Dict[str, Any],
    ) -> PolicyResult:
        """Validate the call's arguments against the tool's config."""
        if not isinstance(tool_config, dict):
            return PolicyResult(passed=False, message=f"Tool '{tool_name}' rules must be an object")
        argument_sets = [context[key] for key in ('tool_input', 'tool_args') if context.get(key) is not None]

        # SQL-specific validations
        if tool_name == 'execute_sql':
            for tool_args in argument_sets or [{}]:
                result = self._validate_sql(tool_config, tool_args if isinstance(tool_args, dict) else {})
                if not result.passed:
                    return result
            return PolicyResult(passed=True)

        try:
            for arguments in argument_sets or [None]:
                reason = (tool_arguments.check_command(tool_name, tool_config, arguments)
                          or tool_arguments.check_paths(tool_name, tool_config, arguments, context))
                if reason:
                    return PolicyResult(passed=False, message=reason)
        except tool_arguments.Unreadable as exc:
            return PolicyResult(passed=False, message=f"Tool '{tool_name}' call refused: {exc}")
        return PolicyResult(passed=True)

    def _validate_sql(
        self,
        config: Dict[str, Any],
        args: Dict[str, Any],
    ) -> PolicyResult:
        """Validate SQL query against restrictions."""
        query = args.get('query', '').upper()

        # Check read-only restriction
        if config.get('read_only', False):
            write_keywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE']
            for keyword in write_keywords:
                if keyword in query:
                    return PolicyResult(
                        passed=False,
                        message=f"SQL query contains '{keyword}' but database is read-only"
                    )

        # Check max rows (would need to be enforced at execution time)
        max_rows = config.get('max_rows')
        if max_rows:
            # Add to context for downstream enforcement
            args['_max_rows'] = max_rows

        return PolicyResult(passed=True)


def create_tool_approval_token(
    tool_name: str,
    policy_id: str,
    granted_by: str,
    user_id: Optional[str] = None,
    reason: str = '',
) -> str:
    """
    Create a signed approval token for tool execution.

    Args:
        tool_name: Name of the tool being approved
        policy_id: ID of the policy requiring approval
        granted_by: ID/name of the approver
        user_id: Optional user ID the approval is for
        reason: Optional reason for approval

    Returns:
        Signed token string
    """
    raise ValueError('Use the authenticated approvals endpoint to bind identity, arguments and policy versions')
