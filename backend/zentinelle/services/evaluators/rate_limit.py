"""
Rate limit policy evaluator.
"""
from typing import Dict, Any, Optional

from django.core.cache import cache

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult


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

        # Build cache key prefix
        endpoint_id = context.get('endpoint_id', 'unknown')
        key_prefix = f"zentinelle:ratelimit:{endpoint_id}"
        if user_id:
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
            tokens_requested = context.get('tokens', 0)

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
        """Check and increment a rate limit counter."""
        warnings = []

        # Get current count
        current = cache.get(key, 0)

        if current >= limit:
            return PolicyResult(
                passed=False,
                message=f"Rate limit exceeded: {limit} {limit_name}"
            )

        if dry_run:
            # Don't increment counters in dry-run mode
            new_count = current + 1
        else:
            # Increment counter
            try:
                # Use atomic increment if available
                new_count = cache.incr(key)
            except ValueError:
                # Key doesn't exist, create it
                cache.set(key, 1, timeout=window_seconds)
                new_count = 1

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
        """Check token limit (cumulative counter)."""
        warnings = []

        # Get current token count
        current = cache.get(key, 0)

        if current + tokens > limit:
            return PolicyResult(
                passed=False,
                message=f"Token limit exceeded: {limit} {limit_name}. Current: {current}, Requested: {tokens}"
            )

        new_count = current + tokens

        if not dry_run:
            # Add tokens to counter — skip in dry-run mode
            # Set with 24 hour expiry
            cache.set(key, new_count, timeout=86400)

        # Warn if approaching limit
        if new_count >= limit * 0.8:
            warnings.append(
                f"Approaching token limit: {new_count}/{limit} {limit_name}"
            )

        return PolicyResult(passed=True, warnings=warnings)
