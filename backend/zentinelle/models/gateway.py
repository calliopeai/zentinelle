"""
Registered gateways and their credentials (#380).

The Go gateway runs inside each cluster that hosts agents (a data plane), with
Zentinelle as the control plane for one or many of them. Each gateway is
registered here with the tenants it may act for, and holds its own credential.
The provider-key lookup releases a tenant's stored key only to a gateway whose
registration names that tenant, so one leaked gateway credential exposes the
tenants of that gateway and no others, and is revoked on its own.

These are platform records, not tenant-owned ones: one registration can span
several tenants, so neither model has a tenant_id. The scope is `tenant_ids`,
and every lookup checks the requesting agent's tenant against it.
"""
import uuid

from django.db import models
from django.utils import timezone

from zentinelle.utils.api_keys import (KeyPrefixes, generate_api_key,
                                       verify_api_key)


class GatewayRegistration(models.Model):
    """One gateway deployment: where it runs and which tenants it serves.

    cluster_id is the opaque id of the cluster the gateway runs in, the value
    the gateway sends as X-Zentinelle-Cluster. It is the link to the cluster
    record Zentinelle does not have yet: when that record lands, this model
    gains a nullable foreign key to it, backfilled by matching cluster_id,
    and the string stays as the external id.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    cluster_id = models.CharField(max_length=255, blank=True, default='', db_index=True)
    tenant_ids = models.JSONField(
        default=list,
        blank=True,
        help_text='Tenants this gateway may read stored provider keys for. Empty serves none.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    revoked_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Set to revoke the gateway: every credential it holds stops working.',
    )

    class Meta:
        app_label = 'zentinelle'
        db_table = 'zentinelle_gateway_registration'
        ordering = ['name']

    def __str__(self):
        return f'GatewayRegistration({self.name})'

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    def serves(self, tenant_id: str) -> bool:
        return bool(tenant_id) and tenant_id in (self.tenant_ids or [])

    def revoke(self):
        self.revoked_at = timezone.now()
        self.save(update_fields=['revoked_at', 'updated_at'])


class GatewayCredential(models.Model):
    """One credential of a registered gateway, stored as a bcrypt hash.

    Hashed like APIKey: the plaintext (sk_gateway_...) exists only when it is
    minted, and the prefix finds the row to verify against. A registration can
    hold more than one, so a credential is rotated by minting the next,
    rolling it out, then revoking the old one.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    registration = models.ForeignKey(
        GatewayRegistration, on_delete=models.PROTECT, related_name='credentials')
    key_prefix = models.CharField(max_length=24, db_index=True)
    key_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'zentinelle'
        db_table = 'zentinelle_gateway_credential'
        ordering = ['-created_at']

    def __str__(self):
        return f'GatewayCredential({self.key_prefix}..., {self.registration_id})'

    @classmethod
    def mint(cls, registration):
        """Create a credential for `registration`. Returns (plaintext, record)."""
        plaintext, key_hash, key_prefix = generate_api_key(
            prefix=KeyPrefixes.GATEWAY, prefix_length=len(KeyPrefixes.GATEWAY) + 8)
        record = cls.objects.create(registration=registration, key_prefix=key_prefix, key_hash=key_hash)
        return plaintext, record

    @classmethod
    def authenticate(cls, presented: str):
        """The live credential `presented` matches, or None.

        Revoked credentials and credentials of a revoked registration never
        match.
        """
        if not presented or not presented.startswith(KeyPrefixes.GATEWAY):
            return None
        candidates = cls.objects.select_related('registration').filter(
            key_prefix=presented[:len(KeyPrefixes.GATEWAY) + 8],
            revoked_at__isnull=True,
            registration__revoked_at__isnull=True,
        )
        for record in candidates:
            if verify_api_key(presented, record.key_hash, allow_legacy_sha256=False):
                return record
        return None

    def revoke(self):
        self.revoked_at = timezone.now()
        self.save(update_fields=['revoked_at'])
