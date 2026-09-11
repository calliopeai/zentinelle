"""Single-use, server-issued approvals and assistant confirmation proposals."""
import uuid

from django.db import models


class ExecutionApproval(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    kind = models.CharField(max_length=20)
    endpoint_id_ext = models.CharField(max_length=255, blank=True)
    subject = models.CharField(max_length=255, blank=True)
    action = models.CharField(max_length=255)
    context_digest = models.CharField(max_length=64)
    policy_versions = models.JSONField(default=dict)
    granted_by = models.CharField(max_length=255, blank=True)
    expires_at = models.DateTimeField(db_index=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
