"""Session state store — Redis-backed per-session cumulative counters."""
import logging
import threading
from typing import Any, Dict

from django.core.cache import cache

logger = logging.getLogger(__name__)

DEFAULT_TTL = 86400  # 24 hours


class SessionStateStore:
    """
    Redis-backed store for per-session cumulative counters.

    Keys are namespaced as:
        session_quota:{tenant_id}:{session_id}

    Each key holds a JSON-serialisable dict of counter → value.
    """

    def __init__(self, ttl: int = DEFAULT_TTL):
        self._ttl = ttl
        self._lock = threading.Lock()

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

        Returns the new value.  Uses a local threading lock for
        optimistic concurrency (sufficient for single-process deployments;
        Redis transactions would be needed for multi-process).
        """
        with self._lock:
            data = self._load(session_id, tenant_id)
            current = data.get(counter, 0)
            new_value = current + amount
            data[counter] = new_value
            self._save(session_id, tenant_id, data)
        return new_value

    def get(self, session_id: str, tenant_id: str, counter: str) -> int:
        """Return the current value of a single counter (0 if unset)."""
        data = self._load(session_id, tenant_id)
        return data.get(counter, 0)

    def get_all(self, session_id: str, tenant_id: str) -> Dict[str, Any]:
        """Return all counters for the session as a dict."""
        return dict(self._load(session_id, tenant_id))

    def reset(self, session_id: str, tenant_id: str) -> None:
        """Clear all counters for the session (useful in tests)."""
        key = self._key(session_id, tenant_id)
        cache.delete(key)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _key(self, session_id: str, tenant_id: str) -> str:
        return f"session_quota:{tenant_id}:{session_id}"

    def _load(self, session_id: str, tenant_id: str) -> Dict[str, Any]:
        key = self._key(session_id, tenant_id)
        try:
            data = cache.get(key)
        except Exception as exc:
            logger.warning("SessionStateStore: cache read failed (%s) — using empty state", exc)
            return {}
        return data if isinstance(data, dict) else {}

    def _save(self, session_id: str, tenant_id: str, data: Dict[str, Any]) -> None:
        key = self._key(session_id, tenant_id)
        try:
            cache.set(key, data, timeout=self._ttl)
        except Exception as exc:
            logger.warning("SessionStateStore: cache write failed (%s) — counters not persisted", exc)
