"""Session quota evaluator — cumulative volume limits per session."""
import logging
from typing import Any, Dict, List, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)

# Default config values
DEFAULT_CONFIG = {
    'max_bytes_read': 52428800,       # 50 MB
    'max_bytes_written': 10485760,    # 10 MB
    'max_outbound_calls': 10,
    'max_pii_accesses': 5,
    'max_tool_calls': 200,
    'max_session_tokens': 500000,
    'warn_at_percent': 80,
    'session_ttl_seconds': 86400,
}


class SessionQuotaEvaluator(BasePolicyEvaluator):
    """
    Evaluates SESSION_QUOTA policies.

    Tracks cumulative per-session resource usage in Redis via
    SessionStateStore.  Increments are only applied when the
    evaluation passes and dry_run is False.

    Context keys consumed:
        session_id (str, required)
        bytes_read (int)
        bytes_written (int)
        is_outbound_call (bool)
        is_pii_access (bool)
        tool_call_count (int)
        tokens_used (int)
        tenant_id (str)

    Config schema:
        max_bytes_read, max_bytes_written, max_outbound_calls,
        max_pii_accesses, max_tool_calls, max_session_tokens,
        warn_at_percent, session_ttl_seconds
    """

    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
        dry_run: bool = False,
    ) -> PolicyResult:
        session_id = context.get('session_id')
        if not session_id:
            # Cannot track without an identifier — fail open
            return PolicyResult(passed=True, message='No session_id in context; quota not enforced')

        config = {**DEFAULT_CONFIG, **policy.config}
        tenant_id = context.get('tenant_id', '')
        warn_at = config.get('warn_at_percent', 80) / 100.0
        ttl = config.get('session_ttl_seconds', DEFAULT_CONFIG['session_ttl_seconds'])

        # Import here to allow mocking in tests without Django setup
        from zentinelle.services.session_state import SessionStateStore
        store = SessionStateStore(ttl=ttl)

        current = store.get_all(session_id, tenant_id)
        warnings: List[str] = []

        # ----------------------------------------------------------------
        # Deltas from the current request
        # ----------------------------------------------------------------
        deltas: Dict[str, int] = {}

        bytes_read = int(context.get('bytes_read', 0))
        bytes_written = int(context.get('bytes_written', 0))
        is_outbound = bool(context.get('is_outbound_call', False))
        is_pii = bool(context.get('is_pii_access', False))
        tool_calls = int(context.get('tool_call_count', 0))
        tokens = int(context.get('tokens_used', 0))

        if bytes_read:
            deltas['bytes_read'] = bytes_read
        if bytes_written:
            deltas['bytes_written'] = bytes_written
        if is_outbound:
            deltas['outbound_calls'] = 1
        if is_pii:
            deltas['pii_accesses'] = 1
        if tool_calls:
            deltas['tool_calls'] = tool_calls
        if tokens:
            deltas['session_tokens'] = tokens

        # ----------------------------------------------------------------
        # Map: counter_name → (config_key, limit, human_label)
        # ----------------------------------------------------------------
        checks = [
            ('bytes_read',      'max_bytes_read',      'bytes read'),
            ('bytes_written',   'max_bytes_written',   'bytes written'),
            ('outbound_calls',  'max_outbound_calls',  'outbound calls'),
            ('pii_accesses',    'max_pii_accesses',    'PII accesses'),
            ('tool_calls',      'max_tool_calls',      'tool calls'),
            ('session_tokens',  'max_session_tokens',  'session tokens'),
        ]

        for counter, config_key, label in checks:
            limit = config.get(config_key)
            if limit is None:
                continue

            current_val = current.get(counter, 0)
            delta = deltas.get(counter, 0)
            new_total = current_val + delta

            if new_total > limit:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Session quota exceeded: {label} — "
                        f"{new_total} > {limit} (limit)"
                    ),
                )

            if limit > 0 and new_total >= limit * warn_at:
                warnings.append(
                    f"[SessionQuota] Approaching {label} limit: {new_total}/{limit}"
                )

        # ----------------------------------------------------------------
        # Increment only when passing and not dry-run
        # ----------------------------------------------------------------
        if not dry_run:
            try:
                for counter, amount in deltas.items():
                    store.increment(session_id, tenant_id, counter, amount)
            except Exception as exc:
                logger.warning(
                    "SessionQuotaEvaluator: failed to increment counters: %s", exc
                )
                # Fail open — don't block the action due to a Redis issue

        return PolicyResult(passed=True, warnings=warnings)
