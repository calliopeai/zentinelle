"""
Centralized API key generation and verification utilities.

Standalone version extracted from client-cove core.utils.api_keys.
Provides secure, consistent API key operations across the platform.
"""

import hashlib
import secrets
from typing import Optional

import bcrypt


def generate_api_key(
    prefix: str = 'znt_',
    key_length: int = 32,
    prefix_length: Optional[int] = None
) -> tuple[str, str, str]:
    """
    Generate a secure API key with configurable prefix.

    Args:
        prefix: Key prefix for identification (e.g., 'sk_agent_', 'sk_deploy_')
        key_length: Number of bytes for the random part (default 32, yields ~43 chars)
        prefix_length: Length of prefix for identification. If None, uses len(prefix) + 8

    Returns:
        Tuple of (full_key, key_hash, key_prefix)
    """
    raw_key = secrets.token_urlsafe(key_length)
    full_key = f"{prefix}{raw_key}"

    key_hash = hash_api_key(full_key)

    if prefix_length is None:
        prefix_length = len(prefix) + 8

    key_prefix = full_key[:prefix_length]

    return full_key, key_hash, key_prefix


def generate_api_secret(length: int = 32) -> str:
    """Generate a secure secret for callbacks, tokens, etc."""
    return secrets.token_urlsafe(length)


def hash_api_key(api_key: str, rounds: int = 12) -> str:
    """Hash an API key for secure storage using bcrypt."""
    return bcrypt.hashpw(api_key.encode(), bcrypt.gensalt(rounds=rounds)).decode()


def verify_api_key(
    api_key: str,
    key_hash: str,
    allow_legacy_sha256: bool = True
) -> bool:
    """
    Verify an API key against its stored hash.
    Uses constant-time comparison to prevent timing attacks.
    """
    if not api_key or not key_hash:
        return False

    try:
        return bcrypt.checkpw(api_key.encode(), key_hash.encode())
    except (ValueError, TypeError):
        if allow_legacy_sha256:
            computed_sha256 = hashlib.sha256(api_key.encode()).hexdigest()
            return secrets.compare_digest(computed_sha256, key_hash)
        return False


def compare_secrets(secret1: str, secret2: str) -> bool:
    """Constant-time comparison of two secrets."""
    if not secret1 or not secret2:
        return False
    return secrets.compare_digest(secret1, secret2)


class KeyPrefixes:
    """Standard API key prefixes used across the platform."""
    AGENT = 'sk_agent_'
    PLATFORM = 'sk_platform_'
    DEPLOY = 'sk_deploy_'
    ZENTINELLE = 'znt_'
