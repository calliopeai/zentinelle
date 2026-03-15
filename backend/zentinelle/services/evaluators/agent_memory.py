"""
Agent memory policy evaluator.

Controls agent memory operations: read/write access, item limits, type
restrictions, and blocked key patterns.
"""
import fnmatch
import logging
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


class AgentMemoryEvaluator(BasePolicyEvaluator):
    """
    Evaluates agent_memory policies.

    Config schema:
    {
        "allow_read": true,
        "allow_write": true,
        "max_memory_items": 100,
        "allowed_memory_types": ["episodic", "semantic"],
        "blocked_key_patterns": ["secret_*", "internal_*"],
        "max_value_size_bytes": 65536
    }

    Context keys:
        "memory_operation"  — "read" | "write" | "delete" | "list"
        "memory_key"        — the key being accessed
        "memory_type"       — type of memory (e.g. "episodic", "semantic")
        "memory_item_count" — current number of items stored (for limit check)
        "value_size_bytes"  — size of the value being written
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
        warnings = []

        operation = context.get('memory_operation', '')
        memory_key = context.get('memory_key', '')
        memory_type = context.get('memory_type', '')

        # 1. Operation-level access controls
        if operation == 'read' and not config.get('allow_read', True):
            return PolicyResult(
                passed=False,
                message=f"Policy '{policy.name}' does not allow memory read operations.",
            )

        if operation in ('write', 'delete') and not config.get('allow_write', True):
            return PolicyResult(
                passed=False,
                message=f"Policy '{policy.name}' does not allow memory write/delete operations.",
            )

        # 2. Blocked key patterns
        blocked_key_patterns = config.get('blocked_key_patterns', [])
        if memory_key:
            for pattern in blocked_key_patterns:
                if fnmatch.fnmatch(memory_key, pattern):
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Memory key '{memory_key}' matches blocked pattern "
                            f"'{pattern}' in policy '{policy.name}'."
                        ),
                    )

        # 3. Allowed memory types
        allowed_types = config.get('allowed_memory_types', [])
        if allowed_types and memory_type:
            if memory_type not in allowed_types:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Memory type '{memory_type}' is not allowed by policy '{policy.name}'. "
                        f"Allowed types: {', '.join(allowed_types)}"
                    ),
                )

        # 4. Max memory items (write operations only)
        if operation == 'write':
            max_items = config.get('max_memory_items')
            current_count = context.get('memory_item_count', 0)
            if max_items and current_count >= max_items:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Memory item limit of {max_items} reached "
                        f"(current: {current_count}) — policy '{policy.name}'."
                    ),
                )

            # Max value size
            max_size = config.get('max_value_size_bytes')
            value_size = context.get('value_size_bytes', 0)
            if max_size and value_size > max_size:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Memory value size {value_size} bytes exceeds maximum "
                        f"{max_size} bytes — policy '{policy.name}'."
                    ),
                )

            # Warn when approaching limit
            if max_items and current_count >= max_items * 0.9:
                warnings.append(
                    f"Approaching memory item limit: {current_count}/{max_items} items stored."
                )

        return PolicyResult(passed=True, warnings=warnings)
