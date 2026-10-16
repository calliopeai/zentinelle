import hashlib
import secrets
import uuid

from django.db import models
from django.db.models import Case, F, Q, Value, When
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
    single_use = models.BooleanField(default=False, help_text='Revoke after first use')
    max_uses = models.PositiveIntegerField(default=0, help_text='0 = unlimited')
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
        if self.max_uses and self.use_count >= self.max_uses:
            return False
        return True

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
        """Validate a bootstrap token against the database and count the use.
        Returns (tenant_id, token_record) or (None, None).

        The check and the count are one conditional UPDATE. Read then save
        let concurrent registrations all pass the check before any counted,
        so a single-use or max_uses token could be used more than allowed.
        """
        token_hash = hashlib.sha256(token_string.encode()).hexdigest()
        now = timezone.now()
        claimed = cls.objects.filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now),
            Q(max_uses=0) | Q(use_count__lt=F('max_uses')),
            token_hash=token_hash, revoked=False,
        ).update(
            use_count=F('use_count') + 1, last_used_at=now,
            revoked=Case(When(single_use=True, then=Value(True)), default=F('revoked')),
        )
        if not claimed:
            return None, None
        record = cls.objects.get(token_hash=token_hash)
        return record.tenant_id, record

    @classmethod
    def is_issued(cls, token_string):
        """Whether this token was issued from the database, valid or not."""
        return cls.objects.filter(token_hash=hashlib.sha256(token_string.encode()).hexdigest()).exists()
