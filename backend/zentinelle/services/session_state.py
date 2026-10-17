"""Session state store — Redis-backed per-session cumulative counters."""
import logging
from typing import Any, Dict

from django.core.cache import cache

logger = logging.getLogger(__name__)

DEFAULT_TTL = 86400  # 24 hours


# The counters the session quota evaluator keeps. get_all reads these.
COUNTERS = ('bytes_read', 'bytes_written', 'outbound_calls', 'pii_accesses', 'tool_calls', 'session_tokens')


class SessionStateStore:
    """
    Redis-backed store for per-session cumulative counters.

    Each counter is its own key:
        session_quota:{tenant_id}:{session_id}:{counter}

    so an increment is one atomic Redis operation that holds across every
    backend process and replica. A read-modify-write of one dict per session,
    guarded by a lock in one process, lost the increments other processes
    made at the same time.
    """

    def __init__(self, ttl: int = DEFAULT_TTL):
        self._ttl = ttl

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def increment(
        self,
        session_id: str,
        tenant_id: str,
        counter: str,
        amount: int = 1,
    ) -> int:
        """
        Atomically increment *counter* by *amount* for the given session.

        Returns the new value. The session's counters live for the TTL after
        its last increment.
        """
        from zentinelle.services.evaluators.rate_limit import add_to_counter

        key = self._key(session_id, tenant_id, counter)
        new_value = add_to_counter(key, amount, self._ttl)
        cache.touch(key, self._ttl)
        return new_value

    def get(self, session_id: str, tenant_id: str, counter: str) -> int:
        """Return the current value of a single counter (0 if unset)."""
        return self.get_all(session_id, tenant_id, (counter,)).get(counter, 0)

    def get_all(self, session_id: str, tenant_id: str, counters=COUNTERS) -> Dict[str, Any]:
        """Return the session's counters that are set, as a dict."""
        keys = {self._key(session_id, tenant_id, c): c for c in counters}
        try:
            found = cache.get_many(list(keys))
        except Exception as exc:
            logger.warning("SessionStateStore: cache read failed (%s) — using empty state", exc)
            return {}
        return {keys[k]: v for k, v in found.items() if isinstance(v, int)}

    def reset(self, session_id: str, tenant_id: str) -> None:
        """Clear all counters for the session (useful in tests)."""
        cache.delete_many([self._key(session_id, tenant_id, c) for c in COUNTERS])

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _key(self, session_id: str, tenant_id: str, counter: str) -> str:
        return f"session_quota:{tenant_id}:{session_id}:{counter}"
