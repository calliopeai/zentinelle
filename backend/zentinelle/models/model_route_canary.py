"""Durable operator evidence for model-route canaries."""
import uuid

from django.db import models


class ModelRouteCanary(models.Model):
    class Status(models.TextChoices):
        PASSED = 'passed', 'Passed'
        FAILED = 'failed', 'Failed'
        ROLLED_BACK = 'rolled_back', 'Rolled back'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    provider = models.CharField(max_length=64)
    model = models.CharField(max_length=128)
    status = models.CharField(max_length=16, choices=Status.choices)
    reason = models.TextField(blank=True, default='')
    baseline = models.JSONField(default=dict, blank=True)
    evidence = models.JSONField(default=dict, blank=True)
    actor_id = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['tenant_id', '-created_at'])]
