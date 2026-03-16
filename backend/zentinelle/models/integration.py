import uuid
from django.db import models


class ClientCoveIntegration(models.Model):
    """
    Stores Client Cove connection config for a standalone Zentinelle tenant.
    When configured and status=connected, the tenant is optionally able to
    delegate auth to Client Cove via the ClientCoveTenantResolver.
    """

    class Status(models.TextChoices):
        UNTESTED = 'untested', 'Untested'
        CONNECTED = 'connected', 'Connected'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True, unique=True)
    client_cove_url = models.URLField(max_length=500)
    api_key = models.CharField(max_length=500)
    is_active = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.UNTESTED,
    )
    status_message = models.TextField(blank=True)
    connected_org_name = models.CharField(max_length=255, blank=True)
    last_tested_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'zentinelle'

    def api_key_preview(self) -> str:
        if not self.api_key:
            return ''
        k = self.api_key
        if len(k) > 8:
            return k[:4] + '••••' + k[-4:]
        return '••••'
