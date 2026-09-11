"""Durable, auditable outcomes from retention enforcement runs."""
import uuid

from django.db import models
from django.utils import timezone


class RetentionOutcome(models.Model):
    class Status(models.TextChoices):
        PRESERVED = 'preserved_for_review', 'Preserved for review'
        ARCHIVED = 'archived', 'Archived'
        DELETED = 'deleted', 'Deleted'
        FAILED = 'failed', 'Failed'
        HELD = 'held', 'Held'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    entity_type = models.CharField(max_length=40)
    status = models.CharField(max_length=30, choices=Status.choices)
    record_count = models.PositiveIntegerField(default=0)
    manifest = models.JSONField(default=dict, blank=True)
    manifest_digest = models.CharField(max_length=128, blank=True, default='')
    destination = models.CharField(max_length=500, blank=True, default='')
    error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=['tenant_id', 'entity_type', '-created_at'])]
