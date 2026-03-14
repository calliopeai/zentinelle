"""
Key manager registry and factory.

Provides access to provider-specific key managers with feature gating.
"""
import logging
from typing import Optional, Type

# TODO: decouple - billing features not available in standalone mode
try:
    from billing.features import Features, org_has_feature
    from billing.exceptions import FeatureNotAvailable
except ImportError:
    Features = None
    org_has_feature = lambda org, feature: True
    class FeatureNotAvailable(Exception):
        pass

from .base import BaseKeyManager, KeyNotSupportedError
from .openai_manager import OpenAIKeyManager
from .anthropic_manager import AnthropicKeyManager
from .together_manager import TogetherKeyManager
from .fireworks_manager import FireworksKeyManager
from .bedrock_manager import BedrockKeyManager
from .huggingface_manager import HuggingFaceKeyManager
from .openrouter_manager import OpenRouterKeyManager
from .litellm_manager import LiteLLMKeyManager

logger = logging.getLogger(__name__)


# Registry of available key managers
KEY_MANAGERS: dict[str, Type[BaseKeyManager]] = {
    'openai': OpenAIKeyManager,
    'anthropic': AnthropicKeyManager,
    'together': TogetherKeyManager,
    'fireworks': FireworksKeyManager,
    'aws_bedrock': BedrockKeyManager,
    'huggingface': HuggingFaceKeyManager,
    'openrouter': OpenRouterKeyManager,
    'litellm': LiteLLMKeyManager,
}

# Providers that require special initialization
SPECIAL_INIT_PROVIDERS = {'aws_bedrock', 'litellm'}

# Providers that support key management
SUPPORTED_PROVIDERS = list(KEY_MANAGERS.keys())


def get_supported_providers() -> list[str]:
    """Get list of providers that support managed key rotation."""
    return SUPPORTED_PROVIDERS.copy()


def get_key_manager(
    provider_slug: str,
    admin_api_key: str,
    organization=None,
    organization_id: str = None,
    skip_feature_check: bool = False,
    **kwargs,
) -> BaseKeyManager:
    """
    Get a key manager instance for a provider.

    Args:
        provider_slug: Provider identifier (e.g., 'openai', 'anthropic')
        admin_api_key: Admin API key with key management permissions
        organization: Organization model instance (for feature check)
        organization_id: Provider's org/workspace ID
        skip_feature_check: Skip enterprise feature check (for internal use)
        **kwargs: Additional provider-specific arguments:
            - aws_bedrock: aws_access_key_id, aws_secret_access_key, aws_region
            - litellm: base_url

    Returns:
        Configured key manager instance

    Raises:
        FeatureNotAvailable: If org doesn't have enterprise plan
        KeyNotSupportedError: If provider doesn't support key management
    """
    # Feature gating - Enterprise only
    if organization and not skip_feature_check:
        if not org_has_feature(organization, Features.KEYS_MANAGED_ROTATION):
            raise FeatureNotAvailable(
                "Managed key rotation is an Enterprise feature. "
                "Please upgrade your plan to access programmatic key management."
            )

    # Check if provider is supported
    if provider_slug not in KEY_MANAGERS:
        raise KeyNotSupportedError(
            f"Provider '{provider_slug}' does not support managed key rotation. "
            f"Supported providers: {', '.join(SUPPORTED_PROVIDERS)}"
        )

    # Instantiate manager
    manager_class = KEY_MANAGERS[provider_slug]

    # Handle special provider initialization
    if provider_slug == 'aws_bedrock':
        return manager_class(
            admin_api_key=admin_api_key,
            organization_id=organization_id,
            aws_access_key_id=kwargs.get('aws_access_key_id'),
            aws_secret_access_key=kwargs.get('aws_secret_access_key'),
            aws_region=kwargs.get('aws_region', 'us-east-1'),
            iam_path=kwargs.get('iam_path', '/zentinelle/'),
        )
    elif provider_slug == 'litellm':
        base_url = kwargs.get('base_url')
        if not base_url:
            raise KeyNotSupportedError(
                "LiteLLM requires base_url parameter for self-hosted proxy."
            )
        return manager_class(
            admin_api_key=admin_api_key,
            organization_id=organization_id,
            base_url=base_url,
        )
    else:
        return manager_class(
            admin_api_key=admin_api_key,
            organization_id=organization_id,
        )


def rotate_managed_key(
    managed_key,
    initiated_by=None,
    rotation_type: str = 'manual',
) -> 'ManagedAPIKey':
    """
    Rotate a managed API key.

    This is the main entry point for key rotation. It:
    1. Checks feature access
    2. Creates new key at provider
    3. Updates secrets manager
    4. Revokes old key
    5. Logs the rotation

    Args:
        managed_key: ManagedAPIKey instance to rotate
        initiated_by: User who initiated rotation (None for system)
        rotation_type: Type of rotation for logging

    Returns:
        Updated ManagedAPIKey instance
    """
    from django.utils import timezone
    from zentinelle.models import ManagedAPIKey, KeyRotationLog

    organization = managed_key.ai_config.organization

    # Feature check
    if not org_has_feature(organization, Features.KEYS_MANAGED_ROTATION):
        raise FeatureNotAvailable(
            "Managed key rotation requires Enterprise plan."
        )

    ai_config = managed_key.ai_config
    provider_slug = ai_config.provider.slug

    # Get admin key from org's config
    admin_key = ai_config.admin_api_key
    if not admin_key:
        raise KeyNotSupportedError(
            f"No admin API key configured for {provider_slug}. "
            "Admin API key required for key rotation."
        )

    # Get key manager
    manager = get_key_manager(
        provider_slug=provider_slug,
        admin_api_key=admin_key,
        organization=organization,
        organization_id=ai_config.provider_org_id,
    )

    old_key_id = managed_key.provider_key_id

    try:
        # Mark as rotating
        managed_key.status = ManagedAPIKey.Status.ROTATING
        managed_key.save(update_fields=['status', 'updated_at'])

        # Rotate at provider
        new_key_info = manager.rotate_key(
            old_key_id=old_key_id,
            name=managed_key.provider_key_name or f"Zentinelle - {managed_key.user.email}",
            project_id=managed_key.provider_project_id or None,
            rate_limit=managed_key.provider_rate_limit,
            budget_limit=float(managed_key.provider_budget_limit) if managed_key.provider_budget_limit else None,
        )

        # Update secrets manager with new key
        from zentinelle.services.secrets import update_secret_value
        update_secret_value(
            secret_arn=managed_key.key_secret_arn,
            new_value=new_key_info.key_value,
        )

        # Update managed key record
        managed_key.provider_key_id = new_key_info.key_id
        managed_key.key_prefix_hint = new_key_info.key_value[:10] + '...'
        managed_key.last_rotated_at = timezone.now()
        managed_key.status = ManagedAPIKey.Status.ACTIVE
        managed_key.save()

        # Log successful rotation
        KeyRotationLog.objects.create(
            managed_key=managed_key,
            rotation_type=rotation_type,
            old_key_id=old_key_id,
            new_key_id=new_key_info.key_id,
            initiated_by=initiated_by,
            success=True,
        )

        logger.info(
            f"Rotated key for {managed_key.user.email} on {provider_slug}: "
            f"{old_key_id} -> {new_key_info.key_id}"
        )

        return managed_key

    except Exception as e:
        # Log failed rotation
        managed_key.status = ManagedAPIKey.Status.ACTIVE  # Restore status
        managed_key.save(update_fields=['status', 'updated_at'])

        KeyRotationLog.objects.create(
            managed_key=managed_key,
            rotation_type=rotation_type,
            old_key_id=old_key_id,
            new_key_id='',
            initiated_by=initiated_by,
            success=False,
            error_message=str(e),
        )

        logger.error(f"Key rotation failed for {managed_key}: {e}")
        raise
