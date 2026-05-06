import uuid
import hashlib
import secrets

from django.db import models
from django.utils import timezone


class BootstrapToken(models.Model):
    """
    Issued bootstrap token for agent registration.

    Supports per-tenant token management with optional expiry and revocation.
    The HMAC-only flow (ZENTINELLE_BOOTSTRAP_SECRET env var) is preserved as
    a fallback for simple deployments.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    token_hash = models.CharField(max_length=128, unique=True)
    token_prefix = models.CharField(max_length=16)
    label = models.CharField(max_length=255, blank=True, help_text='Human-readable label')
    revoked = models.BooleanField(default=False)
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    use_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'revoked']),
        ]

    def __str__(self):
        return f"bt_{self.token_prefix}... ({self.tenant_id})"

    @property
    def is_valid(self):
        if self.revoked:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        return True

    def record_use(self):
        self.last_used_at = timezone.now()
        self.use_count = models.F('use_count') + 1
        self.save(update_fields=['last_used_at', 'use_count'])

    @classmethod
    def generate(cls, tenant_id, label='', expires_at=None):
        """Generate a new bootstrap token for a tenant. Returns (token_string, db_record)."""
        raw_secret = secrets.token_hex(32)
        token_string = f"bt_{tenant_id}_{raw_secret}"
        token_hash = hashlib.sha256(token_string.encode()).hexdigest()
        token_prefix = raw_secret[:12]

        record = cls.objects.create(
            tenant_id=tenant_id,
            token_hash=token_hash,
            token_prefix=token_prefix,
            label=label,
            expires_at=expires_at,
        )
        return token_string, record

    @classmethod
    def validate(cls, token_string):
        """Validate a bootstrap token against the database.
        Returns (tenant_id, token_record) or (None, None).
        """
        token_hash = hashlib.sha256(token_string.encode()).hexdigest()
        try:
            record = cls.objects.get(token_hash=token_hash)
        except cls.DoesNotExist:
            return None, None

        if not record.is_valid:
            return None, None

        record.record_use()
        return record.tenant_id, record
