"""
Compatibility layer for zentinelle.sdk imports.

The SDK is now in a separate package (zentinelle_sdk) loaded as a git submodule.
This module provides backward-compatible imports.

Usage:
    # Old style (still works):
    from zentinelle.sdk_compat import SentinelClient

    # New style (preferred):
    from zentinelle.sdk.sentinel_sdk import SentinelClient
"""
from zentinelle.sdk.sentinel_sdk import (
    SentinelClient,
    SentinelError,
    SentinelConnectionError,
    SentinelAuthError,
    SentinelRateLimitError,
    RetryConfig,
    CircuitBreaker,
    EvaluateResult,
    PolicyConfig,
    RegisterResult,
    ConfigResult,
    SecretsResult,
    EventsResult,
)

__all__ = [
    'SentinelClient',
    'SentinelError',
    'SentinelConnectionError',
    'SentinelAuthError',
    'SentinelRateLimitError',
    'RetryConfig',
    'CircuitBreaker',
    'EvaluateResult',
    'PolicyConfig',
    'RegisterResult',
    'ConfigResult',
    'SecretsResult',
    'EventsResult',
]
