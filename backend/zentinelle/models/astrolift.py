"""
Astrolift integration: per-tenant config and audit delivery dedupe.

Astrolift emits compliance-evidence audit events to Zentinelle over a signed
webhook. Two things have to be stored for that to work: which Zentinelle tenant
an Astrolift org maps to plus the shared signing secret, and which deliveries
have already been accepted so a retry cannot duplicate an evidence row.
"""
import uuid

from django.db import models


class AstroliftIntegration(models.Model):
    """One Astrolift installation wired to one Zentinelle tenant.

    `astrolift_org_id` is the tenant key on the Astrolift side and arrives in
    every envelope; it selects which signing secret to verify against, so it is
    unique across the table.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    tenant_id = models.CharField(max_length=255, db_index=True)
    astrolift_org_id = models.BigIntegerField(unique=True, db_index=True)

    astrolift_url = models.URLField(max_length=500, blank=True)

    signing_secret = models.CharField(
        max_length=500,
        help_text='Shared secret for the X-Astrolift-Signature HMAC',
    )
    previous_signing_secret = models.CharField(
        max_length=500,
        blank=True,
        default='',
        help_text=(
            'Accepted alongside signing_secret so a secret can be rotated '
            'without dropping in-flight deliveries. Clear it once rotation '
            'has settled.'
        ),
    )

    is_active = models.BooleanField(default=True)

    last_event_at = models.DateTimeField(null=True, blank=True)
    events_accepted = models.BigIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'zentinelle'
        verbose_name = 'Astrolift Integration'

    def __str__(self):
        return f"Astrolift org {self.astrolift_org_id} -> tenant {self.tenant_id}"


class AstroliftAuditDelivery(models.Model):
    """Accepted deliveries, keyed by Astrolift's idempotency key.

    Webhooks retry. Without this, a retry appends a second evidence row for the
    same event and the audit chain no longer reflects what happened.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    idempotency_key = models.CharField(max_length=255, unique=True, db_index=True)
    tenant_id = models.CharField(max_length=255, db_index=True)
    astrolift_event_id = models.CharField(max_length=255, db_index=True)
    event_type = models.CharField(max_length=100)

    audit_log_id = models.UUIDField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        app_label = 'zentinelle'
        verbose_name = 'Astrolift Audit Delivery'
        verbose_name_plural = 'Astrolift Audit Deliveries'
        indexes = [models.Index(fields=['tenant_id', 'received_at'])]

    def __str__(self):
        return self.idempotency_key
