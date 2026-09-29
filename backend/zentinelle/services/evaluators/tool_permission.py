"""
Tool permission (RBAC) policy evaluator.
"""
import logging
from typing import Any, Dict, Optional

from zentinelle.models import Policy
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
            }
        }
    }
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

        # Check tool-specific configs
        tool_configs = config.get('tool_configs', {})
        tool_config = tool_configs.get(tool_name)

        if tool_config:
            validation_result = self._validate_tool_args(
                tool_name, tool_config, context.get('tool_args', {})
            )
            if not validation_result.passed:
                return validation_result

        return PolicyResult(passed=True)

    def _validate_tool_args(
        self,
        tool_name: str,
        tool_config: Dict[str, Any],
        tool_args: Dict[str, Any],
    ) -> PolicyResult:
        """Validate tool arguments against tool-specific config."""

        # SQL-specific validations
        if tool_name == 'execute_sql':
            return self._validate_sql(tool_config, tool_args)

        # File operation validations
        if tool_name in ['read_file', 'write_file', 'delete_file']:
            return self._validate_file_op(tool_config, tool_args)

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

    def _validate_file_op(
        self,
        config: Dict[str, Any],
        args: Dict[str, Any],
    ) -> PolicyResult:
        """Validate file operations against restrictions."""
        file_path = args.get('path', '')

        # Check allowed paths
        allowed_paths = config.get('allowed_paths', [])
        if allowed_paths:
            path_allowed = any(
                file_path.startswith(allowed) for allowed in allowed_paths
            )
            if not path_allowed:
                return PolicyResult(
                    passed=False,
                    message=f"File path '{file_path}' is not in allowed paths"
                )

        # Check blocked paths
        blocked_paths = config.get('blocked_paths', [])
        for blocked in blocked_paths:
            if file_path.startswith(blocked):
                return PolicyResult(
                    passed=False,
                    message=f"File path '{file_path}' is in blocked paths"
                )

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
