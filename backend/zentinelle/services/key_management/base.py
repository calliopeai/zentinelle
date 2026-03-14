"""
Base class for provider key management.
"""
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class KeyManagerError(Exception):
    """Base exception for key management errors."""
    pass


class KeyNotSupportedError(KeyManagerError):
    """Provider does not support this key operation."""
    pass


class KeyCreationError(KeyManagerError):
    """Failed to create key at provider."""
    pass


class KeyRotationError(KeyManagerError):
    """Failed to rotate key at provider."""
    pass


class KeyRevocationError(KeyManagerError):
    """Failed to revoke key at provider."""
    pass


@dataclass
class ProviderKeyInfo:
    """Information about a key from the provider."""
    key_id: str
    key_value: str  # The actual API key (sensitive!)
    name: str
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    project_id: Optional[str] = None
    rate_limit: Optional[int] = None
    budget_limit: Optional[float] = None


class BaseKeyManager(ABC):
    """
    Abstract base class for provider-specific key management.

    Each provider that supports Admin API key management should
    implement this interface.
    """

    # Provider slug (e.g., 'openai', 'anthropic')
    provider_slug: str = None

    # Whether this provider supports key rotation
    supports_rotation: bool = False

    # Whether this provider supports per-key limits
    supports_limits: bool = False

    def __init__(self, admin_api_key: str, organization_id: str = None):
        """
        Initialize key manager.

        Args:
            admin_api_key: Admin API key with key management permissions
            organization_id: Provider's org/workspace ID (if applicable)
        """
        self.admin_api_key = admin_api_key
        self.organization_id = organization_id

    @abstractmethod
    def create_key(
        self,
        name: str,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Create a new API key at the provider.

        Args:
            name: Human-readable name for the key
            project_id: Project/workspace to scope key to (if supported)
            rate_limit: Rate limit in requests/minute (if supported)
            budget_limit: Monthly budget limit in USD (if supported)

        Returns:
            ProviderKeyInfo with the new key details

        Raises:
            KeyCreationError: If key creation fails
        """
        pass

    @abstractmethod
    def revoke_key(self, key_id: str) -> bool:
        """
        Revoke/delete an API key at the provider.

        Args:
            key_id: Provider's key ID

        Returns:
            True if successful

        Raises:
            KeyRevocationError: If revocation fails
        """
        pass

    def rotate_key(
        self,
        old_key_id: str,
        name: str = None,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Rotate a key by creating a new one and revoking the old.

        Default implementation creates new key then revokes old.
        Override if provider has native rotation support.

        Args:
            old_key_id: ID of key to rotate
            name: Name for new key (optional)
            project_id: Project scope for new key
            rate_limit: Rate limit for new key
            budget_limit: Budget limit for new key

        Returns:
            ProviderKeyInfo for the new key

        Raises:
            KeyRotationError: If rotation fails
        """
        if not self.supports_rotation:
            raise KeyNotSupportedError(
                f"Provider {self.provider_slug} does not support key rotation"
            )

        try:
            # Create new key
            new_key = self.create_key(
                name=name or f"Rotated key (was {old_key_id[:8]}...)",
                project_id=project_id,
                rate_limit=rate_limit,
                budget_limit=budget_limit,
            )

            # Revoke old key
            try:
                self.revoke_key(old_key_id)
            except KeyRevocationError as e:
                # Log but don't fail - new key is already created
                logger.warning(
                    f"Failed to revoke old key {old_key_id} during rotation: {e}"
                )

            return new_key

        except KeyCreationError:
            raise KeyRotationError(f"Failed to create replacement key")

    @abstractmethod
    def list_keys(self) -> list[dict]:
        """
        List all API keys for the organization.

        Returns:
            List of key info dicts (without actual key values)
        """
        pass

    @abstractmethod
    def get_key_usage(self, key_id: str, start_date: datetime, end_date: datetime) -> dict:
        """
        Get usage statistics for a specific key.

        Args:
            key_id: Provider's key ID
            start_date: Start of usage period
            end_date: End of usage period

        Returns:
            Dict with usage metrics (tokens, cost, etc.)
        """
        pass

    def update_key_limits(
        self,
        key_id: str,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> bool:
        """
        Update limits on an existing key.

        Args:
            key_id: Provider's key ID
            rate_limit: New rate limit (or None to keep current)
            budget_limit: New budget limit (or None to keep current)

        Returns:
            True if successful

        Raises:
            KeyNotSupportedError: If provider doesn't support limit updates
        """
        raise KeyNotSupportedError(
            f"Provider {self.provider_slug} does not support updating key limits"
        )

    def test_connection(self) -> bool:
        """
        Test that the admin API credentials are valid.

        Returns:
            True if connection successful
        """
        try:
            self.list_keys()
            return True
        except Exception as e:
            logger.error(f"Connection test failed for {self.provider_slug}: {e}")
            return False
