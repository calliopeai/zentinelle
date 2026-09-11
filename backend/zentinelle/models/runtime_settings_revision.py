"""Auditable, tenant-scoped runtime settings snapshots."""
import uuid

from django.db import models
from django.utils import timezone


class RuntimeSettingsRevision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    revision = models.PositiveIntegerField()
    settings = models.JSONField(default=dict)
    actor_id = models.CharField(max_length=255, blank=True, default='')
    actor_name = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['tenant_id', 'revision'], name='unique_runtime_settings_revision')]
        ordering = ['-revision']
