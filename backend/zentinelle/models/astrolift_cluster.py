"""
Connected Astrolift installs and their clusters (#389).

The Go gateway runs inside each Astrolift cluster (a data plane) and Zentinelle
is the control plane for one or many of them. An Astrolift install connects
itself: an admin generates a one-time EnrollmentCode here, pastes it into
Astrolift with this Zentinelle's URL, and Astrolift exchanges it for an
AstroliftInstall and that install's own credential. With it Astrolift registers
each cluster, and every cluster gets a GatewayRegistration scoped to the
install's tenants, holding the credential its gateway presents.

Like GatewayRegistration these are platform records: one install can serve
several tenants, so the scope is `tenant_ids` rather than a tenant_id. A
cluster's tenants are those of its gateway registration, never wider than the
install's.

Nothing here is deleted. Revoking sets `revoked_at` and leaves the row as
history.
"""
import hashlib
import secrets
import uuid
from datetime import timedelta

from django.db import models
from django.utils import timezone

from zentinelle.utils.api_keys import (KeyPrefixes, generate_api_key,
                                       verify_api_key)


class EnrollmentCode(models.Model):
    """A one-time code an admin hands to Astrolift to connect it.

    Only the SHA-256 of the code is stored. The code carries 192 random bits,
    which no brute force reaches, so a slow hash would buy nothing; what the
    fast one buys is an exact lookup, so the code is consumed by one
    conditional UPDATE and stays single use when two requests race.
    """

    DEFAULT_TTL = timedelta(minutes=15)
    MAX_TTL = timedelta(minutes=60)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code_hash = models.CharField(max_length=64, unique=True)
    tenant_ids = models.JSONField(default=list, help_text='Tenants the install that uses this code may serve.')
    created_by = models.CharField(max_length=255, help_text='Who generated it: a portal username or manage.py.')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'zentinelle'
        db_table = 'zentinelle_astrolift_enrollment_code'
        ordering = ['-created_at']

    def __str__(self):
        return f'EnrollmentCode({self.id})'

    @staticmethod
    def hash_code(code: str) -> str:
        return hashlib.sha256(code.encode()).hexdigest()

    @classmethod
    def issue(cls, tenant_ids, created_by, ttl=None):
        """Create a code for `tenant_ids`. Returns (plaintext, record)."""
        ttl = cls.DEFAULT_TTL if ttl is None else ttl
        if not timedelta(minutes=1) <= ttl <= cls.MAX_TTL:
            raise ValueError('An enrollment code lives between 1 and 60 minutes')
        if not tenant_ids:
            raise ValueError('An enrollment code needs at least one tenant')
        plaintext = f'{KeyPrefixes.ENROLLMENT}{secrets.token_urlsafe(24)}'
        record = cls.objects.create(
            code_hash=cls.hash_code(plaintext),
            tenant_ids=list(tenant_ids),
            created_by=created_by[:255],
            expires_at=timezone.now() + ttl,
        )
        return plaintext, record


class AstroliftInstall(models.Model):
    """One Astrolift control plane connected to this Zentinelle.

    Its credential (sk_astroinst_...) is stored as a bcrypt hash like a gateway
    credential, and exists in plaintext only in the response to connect.
    Revoking the install (disconnecting it) ends that credential and, through
    the service that does it, every cluster and gateway registration under it.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    base_url = models.URLField(max_length=500)
    tenant_ids = models.JSONField(default=list, help_text='Tenants this install may serve, from its enrollment code.')
    enrollment_code = models.OneToOneField(
        EnrollmentCode, on_delete=models.PROTECT, related_name='install',
        help_text='The code this install consumed. One-to-one: a code connects one install.')
    key_prefix = models.CharField(max_length=24, db_index=True)
    key_hash = models.CharField(max_length=255)
    connected_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'zentinelle'
        db_table = 'zentinelle_astrolift_install'
        ordering = ['-connected_at']

    def __str__(self):
        return f'AstroliftInstall({self.name})'

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    @property
    def status(self) -> str:
        return 'connected' if self.is_active else 'disconnected'

    @staticmethod
    def new_credential():
        """(plaintext, key_hash, key_prefix) for a new install credential."""
        return generate_api_key(
            prefix=KeyPrefixes.ASTROLIFT_INSTALL, prefix_length=len(KeyPrefixes.ASTROLIFT_INSTALL) + 8)

    @classmethod
    def authenticate(cls, presented: str):
        """The connected install `presented` is the credential of, or None."""
        if not presented or not presented.startswith(KeyPrefixes.ASTROLIFT_INSTALL):
            return None
        candidates = cls.objects.filter(
            key_prefix=presented[:len(KeyPrefixes.ASTROLIFT_INSTALL) + 8], revoked_at__isnull=True)
        for install in candidates:
            if verify_api_key(presented, install.key_hash, allow_legacy_sha256=False):
                return install
        return None


class AstroliftCluster(models.Model):
    """A cluster of a connected install, whose gateway Zentinelle governs.

    `external_id` is Astrolift's id for the cluster and the value its gateway
    sends as X-Zentinelle-Cluster (ZENTINELLE_CLUSTER_ID), so it is also the
    cluster_id of the cluster's GatewayRegistration. It is unique per install
    among live clusters only: a revoked cluster stays as history, and the same
    id registered again is a new row with a new gateway registration.
    """

    class Health(models.TextChoices):
        UNKNOWN = 'unknown', 'Unknown'
        HEALTHY = 'healthy', 'Healthy'
        DEGRADED = 'degraded', 'Degraded'
        UNHEALTHY = 'unhealthy', 'Unhealthy'

    # The gateway is asked to report every HEARTBEAT_INTERVAL; a cluster not
    # heard from for STALE_AFTER reads as stale.
    HEARTBEAT_INTERVAL = timedelta(seconds=60)
    STALE_AFTER = timedelta(minutes=5)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    install = models.ForeignKey(AstroliftInstall, on_delete=models.PROTECT, related_name='clusters')
    external_id = models.CharField(max_length=128)
    provider = models.CharField(max_length=50, blank=True, default='')
    region = models.CharField(max_length=100, blank=True, default='')
    health = models.CharField(max_length=20, choices=Health.choices, default=Health.UNKNOWN)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    gateway_version = models.CharField(max_length=64, blank=True, default='')
    counters = models.JSONField(default=dict, blank=True, help_text='The counters of the latest heartbeat.')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'zentinelle'
        db_table = 'zentinelle_astrolift_cluster'
        ordering = ['external_id', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['install', 'external_id'],
                condition=models.Q(revoked_at__isnull=True),
                name='unique_live_astrolift_cluster_per_install',
            ),
        ]

    def __str__(self):
        return f'AstroliftCluster({self.external_id})'

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    @property
    def status(self) -> str:
        if self.revoked_at is not None:
            return 'revoked'
        if self.last_seen_at is None:
            return 'pending'
        if timezone.now() - self.last_seen_at > self.STALE_AFTER:
            return 'stale'
        return 'active'

    def active_registration(self):
        """The live gateway registration of this cluster, or None."""
        return self.gateway_registrations.filter(revoked_at__isnull=True).order_by('-created_at').first()
