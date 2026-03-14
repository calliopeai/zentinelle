"""
User API Keys - Platform API keys for programmatic access.

These are user-created API keys for accessing the platform API,
separate from agent endpoint keys.
"""
import uuid

from django.db import models
from django.utils import timezone

from zentinelle.models.base import Tracking
from zentinelle.utils.api_keys import generate_api_key as _generate_api_key
from zentinelle.utils.api_keys import verify_api_key as _verify_api_key
from zentinelle.utils.api_keys import KeyPrefixes


class APIKey(Tracking):
    """
    User-created API key for platform API access.
    """

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        REVOKED = 'revoked', 'Revoked'
        EXPIRED = 'expired', 'Expired'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # TODO: decouple - created_by FK removed (use user_id instead)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Key identification
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    key_prefix = models.CharField(
        max_length=20,
        db_index=True,
        help_text='First chars of API key for identification'
    )
    key_hash = models.CharField(max_length=255)

    # Status & lifecycle
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE
    )
    expires_at = models.DateTimeField(null=True, blank=True)

    # Permissions
    scopes = models.JSONField(
        default=list,
        blank=True,
        help_text='List of scopes: ["read", "write", "admin"]'
    )

    # Rate limiting
    rate_limit = models.IntegerField(
        null=True,
        blank=True,
        help_text='Rate limit in requests per minute'
    )

    # Usage tracking
    last_used_at = models.DateTimeField(null=True, blank=True)
    usage_count = models.IntegerField(default=0)

    class Meta:
        verbose_name = 'API Key'
        verbose_name_plural = 'API Keys'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['key_prefix']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f"{self.name} ({self.key_prefix}...)"

    @classmethod
    def generate_api_key(cls) -> tuple[str, str, str]:
        """
        Generate a new API key.
        Returns: (full_key, key_hash, key_prefix)

        Uses the centralized API key utility with bcrypt hashing.
        """
        return _generate_api_key(prefix=KeyPrefixes.PLATFORM, prefix_length=15)

    @classmethod
    def verify_api_key(cls, api_key: str, key_hash: str) -> bool:
        """Verify an API key against its bcrypt hash."""
        return _verify_api_key(api_key, key_hash, allow_legacy_sha256=False)

    @property
    def is_active(self) -> bool:
        """Check if key is currently usable."""
        if self.status != self.Status.ACTIVE:
            return False
        if self.expires_at and self.expires_at < timezone.now():
            return False
        return True

    @property
    def created_by_username(self) -> str:
        """Get username of the creator."""
        return self.user_id or 'System'

    def revoke(self):
        """Revoke this API key."""
        self.status = self.Status.REVOKED
        self.save(update_fields=['status', 'updated_at'])

    def record_usage(self):
        """Record API key usage."""
        self.last_used_at = timezone.now()
        self.usage_count += 1
        self.save(update_fields=['last_used_at', 'usage_count'])
