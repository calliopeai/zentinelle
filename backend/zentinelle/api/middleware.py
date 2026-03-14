"""
Zentinelle API Middleware - Rate limiting and security middleware.
"""
import time
import hashlib
import logging
from typing import Optional, Tuple
from functools import wraps

from django.http import JsonResponse
from django.core.cache import cache
from django.conf import settings

logger = logging.getLogger(__name__)


class RateLimitExceeded(Exception):
    """Raised when rate limit is exceeded."""
    pass


class RateLimiter:
    """
    Token bucket rate limiter using Redis.

    Supports:
    - Per-endpoint rate limits
    - Per-API-key rate limits
    - Per-IP rate limits (fallback)
    - Burst allowance
    """

    # Default limits (requests per window)
    DEFAULT_LIMITS = {
        'register': (10, 3600),      # 10 per hour
        'config': (100, 60),         # 100 per minute
        'secrets': (60, 60),         # 60 per minute
        'events': (1000, 60),        # 1000 per minute (bulk events)
        'heartbeat': (120, 60),      # 120 per minute (2/sec)
        'evaluate': (500, 60),       # 500 per minute
        'scan': (200, 60),           # 200 per minute
        'default': (100, 60),        # Default: 100 per minute
    }

    # Burst multiplier (allows short bursts above limit)
    BURST_MULTIPLIER = 1.5

    def __init__(self, cache_prefix: str = 'zentinelle_ratelimit'):
        self.cache_prefix = cache_prefix

    def _get_key(self, identifier: str, endpoint: str) -> str:
        """Generate cache key for rate limit tracking."""
        return f"{self.cache_prefix}:{endpoint}:{hashlib.md5(identifier.encode()).hexdigest()}"

    def _get_limit(self, endpoint: str) -> Tuple[int, int]:
        """Get rate limit for endpoint (max_requests, window_seconds)."""
        return self.DEFAULT_LIMITS.get(endpoint, self.DEFAULT_LIMITS['default'])

    def check_rate_limit(
        self,
        identifier: str,
        endpoint: str,
        custom_limit: Optional[Tuple[int, int]] = None,
    ) -> Tuple[bool, dict]:
        """
        Check if request is within rate limit.

        Args:
            identifier: API key or IP address
            endpoint: Endpoint name
            custom_limit: Optional custom (max_requests, window_seconds)

        Returns:
            (allowed, headers_dict) - headers include rate limit info
        """
        max_requests, window = custom_limit or self._get_limit(endpoint)
        burst_limit = int(max_requests * self.BURST_MULTIPLIER)

        key = self._get_key(identifier, endpoint)
        now = time.time()
        window_start = now - window

        # Get current window data from cache
        # Using a sliding window approach
        data = cache.get(key)

        if data is None:
            # First request in window
            data = {'requests': [], 'first_request': now}

        # Clean old requests outside window
        data['requests'] = [ts for ts in data['requests'] if ts > window_start]

        current_count = len(data['requests'])
        remaining = max(0, max_requests - current_count)

        headers = {
            'X-RateLimit-Limit': str(max_requests),
            'X-RateLimit-Remaining': str(remaining),
            'X-RateLimit-Window': str(window),
            'X-RateLimit-Reset': str(int(window_start + window)),
        }

        # Check if over burst limit
        if current_count >= burst_limit:
            retry_after = int(data['requests'][0] - window_start + window) if data['requests'] else window
            headers['Retry-After'] = str(max(1, retry_after))

            logger.warning(
                f"Rate limit exceeded for {identifier[:20]}... on {endpoint}: "
                f"{current_count}/{max_requests} requests"
            )
            return False, headers

        # Add this request
        data['requests'].append(now)
        cache.set(key, data, timeout=window * 2)  # Keep data for 2x window

        return True, headers

    def reset(self, identifier: str, endpoint: str) -> None:
        """Reset rate limit for an identifier."""
        key = self._get_key(identifier, endpoint)
        cache.delete(key)


# Global rate limiter instance
rate_limiter = RateLimiter()


def rate_limit(endpoint: str = 'default', custom_limit: Optional[Tuple[int, int]] = None):
    """
    Decorator for rate limiting views.

    Usage:
        @rate_limit('config')
        def my_view(request):
            ...

        @rate_limit(custom_limit=(10, 60))  # 10 requests per minute
        def restricted_view(request):
            ...
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            # Get identifier (API key > authenticated user > IP)
            identifier = (
                request.META.get('HTTP_X_ZENTINELLE_KEY', '')[:20] or
                str(getattr(request, 'user', None) or '') or
                get_client_ip(request)
            )

            allowed, headers = rate_limiter.check_rate_limit(
                identifier=identifier,
                endpoint=endpoint,
                custom_limit=custom_limit,
            )

            if not allowed:
                response = JsonResponse(
                    {
                        'error': 'rate_limit_exceeded',
                        'message': 'Too many requests. Please slow down.',
                        'retry_after': int(headers.get('Retry-After', 60)),
                    },
                    status=429,
                )
                for key, value in headers.items():
                    response[key] = value
                return response

            # Call the view
            response = view_func(request, *args, **kwargs)

            # Add rate limit headers to response
            if hasattr(response, '__setitem__'):
                for key, value in headers.items():
                    response[key] = value

            return response

        return wrapper
    return decorator


class RateLimitMiddleware:
    """
    Django middleware for global rate limiting.

    Applies default rate limits to all Zentinelle API endpoints.
    Can be overridden per-view with @rate_limit decorator.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only apply to Zentinelle API endpoints
        if not request.path.startswith('/api/zentinelle/'):
            return self.get_response(request)

        # Extract endpoint name from path
        endpoint = self._get_endpoint_name(request.path)

        # Skip rate limiting for certain paths
        if endpoint in ('health', 'metrics'):
            return self.get_response(request)

        # Get identifier
        identifier = (
            request.META.get('HTTP_X_ZENTINELLE_KEY', '')[:20] or
            str(getattr(request, 'user', None) or '') or
            get_client_ip(request)
        )

        allowed, headers = rate_limiter.check_rate_limit(
            identifier=identifier,
            endpoint=endpoint,
        )

        if not allowed:
            response = JsonResponse(
                {
                    'error': 'rate_limit_exceeded',
                    'message': 'Too many requests. Please slow down.',
                    'retry_after': int(headers.get('Retry-After', 60)),
                },
                status=429,
            )
            for key, value in headers.items():
                response[key] = value
            return response

        response = self.get_response(request)

        # Add rate limit headers
        for key, value in headers.items():
            response[key] = value

        return response

    def _get_endpoint_name(self, path: str) -> str:
        """Extract endpoint name from path."""
        # /api/zentinelle/v1/config/agent-123 -> config
        parts = path.rstrip('/').split('/')
        if len(parts) >= 5:
            return parts[4]  # ['', 'api', 'zentinelle', 'v1', 'config', ...]
        return 'default'


def get_client_ip(request) -> str:
    """Get client IP address from request."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR', 'unknown')
    return ip


class IPBlocklistMiddleware:
    """
    Middleware to block requests from known malicious IPs.

    Uses Redis-backed blocklist that can be updated dynamically.
    """

    BLOCKLIST_KEY = 'zentinelle_ip_blocklist'
    BLOCKLIST_TTL = 3600  # 1 hour

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only apply to Zentinelle API endpoints
        if not request.path.startswith('/api/zentinelle/'):
            return self.get_response(request)

        client_ip = get_client_ip(request)

        if self.is_blocked(client_ip):
            logger.warning(f"Blocked request from blocklisted IP: {client_ip}")
            return JsonResponse(
                {
                    'error': 'forbidden',
                    'message': 'Access denied.',
                },
                status=403,
            )

        return self.get_response(request)

    def is_blocked(self, ip: str) -> bool:
        """Check if IP is in blocklist."""
        blocklist = cache.get(self.BLOCKLIST_KEY, set())
        return ip in blocklist

    @classmethod
    def add_to_blocklist(cls, ip: str, ttl: Optional[int] = None) -> None:
        """Add IP to blocklist."""
        blocklist = cache.get(cls.BLOCKLIST_KEY, set())
        blocklist.add(ip)
        cache.set(cls.BLOCKLIST_KEY, blocklist, timeout=ttl or cls.BLOCKLIST_TTL)
        logger.info(f"Added {ip} to IP blocklist")

    @classmethod
    def remove_from_blocklist(cls, ip: str) -> None:
        """Remove IP from blocklist."""
        blocklist = cache.get(cls.BLOCKLIST_KEY, set())
        blocklist.discard(ip)
        cache.set(cls.BLOCKLIST_KEY, blocklist, timeout=cls.BLOCKLIST_TTL)
        logger.info(f"Removed {ip} from IP blocklist")
