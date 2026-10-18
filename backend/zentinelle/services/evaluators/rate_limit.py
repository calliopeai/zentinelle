"""
Rate limit policy evaluator.
"""
from typing import Any, Dict, Optional

from django.core.cache import cache

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import (BasePolicyEvaluator,
                                                 PolicyResult)


class RateLimitEvaluator(BasePolicyEvaluator):
    """
    Evaluates rate_limit policies.

    Config schema:
    {
        "requests_per_minute": 60,
        "requests_per_hour": 1000,
        "tokens_per_day": 100000,
    }

    Uses Redis cache for rate limit tracking.
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

        # Build cache key prefix from the engine's trusted identity. A
        # caller-supplied endpoint_id shared one bucket across every tenant
        # and let any caller reset its own count by changing it.
        tenant_id = context.get('_tenant_id', 'unknown')
        endpoint_id = context.get('_endpoint_id', 'unknown')
        key_prefix = f"zentinelle:ratelimit:{tenant_id}:{endpoint_id}"
        # A claimed user_id is caller input too, so it splits the count only
        # when it cannot open a fresh bucket: the engine verified it (a hub
        # user token), or the policy is scoped to that one user.
        if user_id and (context.get('_user_verified') or policy.scope_type == Policy.ScopeType.USER):
            key_prefix += f":{user_id}"

        # Check per-minute limit
        rpm_limit = config.get('requests_per_minute')
        if rpm_limit is not None:
            result = self._check_rate_limit(
                key=f"{key_prefix}:rpm",
                limit=rpm_limit,
                window_seconds=60,
                limit_name="requests per minute",
                dry_run=dry_run,
            )
            if not result.passed:
                return result
            warnings.extend(result.warnings)

        # Check per-hour limit
        rph_limit = config.get('requests_per_hour')
        if rph_limit is not None:
            result = self._check_rate_limit(
                key=f"{key_prefix}:rph",
                limit=rph_limit,
                window_seconds=3600,
                limit_name="requests per hour",
                dry_run=dry_run,
            )
            if not result.passed:
                return result
            warnings.extend(result.warnings)

        # Check daily token limit (for AI requests)
        if action == 'ai_request':
            tokens_limit = config.get('tokens_per_day')
            # A negative count would wind the daily counter back.
            tokens_requested = max(0, int(context.get('tokens', 0)))

            if tokens_limit is not None:
                result = self._check_token_limit(
                    key=f"{key_prefix}:tokens_daily",
                    limit=tokens_limit,
                    tokens=tokens_requested,
                    limit_name="tokens per day",
                    dry_run=dry_run,
                )
                if not result.passed:
                    return result
                warnings.extend(result.warnings)

        return PolicyResult(passed=True, warnings=warnings)

    def _check_rate_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int,
        limit_name: str,
        dry_run: bool = False,
    ) -> PolicyResult:
        """Count this request against a fixed window, then check the count.

        Counting first, atomically, is what makes the limit hold across
        backend replicas: a read then a write let every replica that read the
        same count admit a request, so N replicas allowed up to N times the
        limit in a burst.
        """
        warnings = []

        if dry_run:
            # Don't increment counters in dry-run mode
            new_count = (cache.get(key) or 0) + 1
        else:
            new_count = add_to_counter(key, 1, window_seconds)

        if new_count > limit:
            return PolicyResult(
                passed=False,
                message=f"Rate limit exceeded: {limit} {limit_name}"
            )

        # Warn if approaching limit
        if new_count >= limit * 0.8:
            warnings.append(
                f"Approaching rate limit: {new_count}/{limit} {limit_name}"
            )

        return PolicyResult(passed=True, warnings=warnings)

    def _check_token_limit(
        self,
        key: str,
        limit: int,
        tokens: int,
        limit_name: str,
        dry_run: bool = False,
    ) -> PolicyResult:
        """Reserve tokens against the day's budget, atomically.

        The tokens are added first and taken back if they do not fit, so two
        replicas cannot both admit the last of the budget. The day starts at
        the first request; rewriting the counter on every request used to
        push its expiry out a day each time, so a busy agent's day never ended.
        """
        warnings = []

        if dry_run:
            # Add tokens to counter only outside dry-run mode
            new_count = (cache.get(key) or 0) + tokens
        else:
            new_count = add_to_counter(key, tokens, 86400)

        if new_count > limit:
            if not dry_run and tokens:
                try:
                    cache.decr(key, tokens)
                except ValueError:
                    pass  # The day ended meanwhile; nothing left to give back.
            return PolicyResult(
                passed=False,
                message=f"Token limit exceeded: {limit} {limit_name}. Current: {new_count - tokens}, Requested: {tokens}"
            )

        # Warn if approaching limit
        if new_count >= limit * 0.8:
            warnings.append(
                f"Approaching token limit: {new_count}/{limit} {limit_name}"
            )

        return PolicyResult(passed=True, warnings=warnings)


def add_to_counter(key: str, amount: int, window_seconds: int) -> int:
    """Add to a counter every replica shares, and return its new value.

    ``add`` starts the window only for the first writer and ``incr`` is atomic
    on the Redis cache, so concurrent requests on any replica each see a
    distinct count.
    """
    cache.add(key, 0, timeout=window_seconds)
    try:
        return cache.incr(key, amount)
    except ValueError:
        # The window closed between add and incr: this request opens the next.
        cache.add(key, 0, timeout=window_seconds)
        return cache.incr(key, amount)
