"""
Provider-specific key management services.

Handles key creation, rotation, and revocation via provider Admin APIs.
Enterprise-only feature (requires KEYS_MANAGED_ROTATION).

Supported providers:
- OpenAI: Full Admin API support
- Anthropic: Workspace key management
- Together AI: API key management
- Fireworks AI: Key management with limits
- AWS Bedrock: IAM credential management
- Hugging Face: Token management
- OpenRouter: Key management with credits
- LiteLLM: Self-hosted proxy key management
"""
from .base import (
    BaseKeyManager,
    ProviderKeyInfo,
    KeyManagerError,
    KeyNotSupportedError,
    KeyCreationError,
    KeyRevocationError,
)
from .registry import (
    get_key_manager,
    get_supported_providers,
    rotate_managed_key,
    SUPPORTED_PROVIDERS,
)

__all__ = [
    # Base classes and types
    'BaseKeyManager',
    'ProviderKeyInfo',
    # Exceptions
    'KeyManagerError',
    'KeyNotSupportedError',
    'KeyCreationError',
    'KeyRevocationError',
    # Factory functions
    'get_key_manager',
    'get_supported_providers',
    'rotate_managed_key',
    'SUPPORTED_PROVIDERS',
]
