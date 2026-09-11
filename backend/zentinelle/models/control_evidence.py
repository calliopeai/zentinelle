"""Dated operating evidence for a governance control."""
import uuid

from django.db import models
from django.utils import timezone


class ControlEvidence(models.Model):
    class Status(models.TextChoices):
        VERIFIED_OPERATING = 'verified-operating', 'Verified Operating'
        STALE = 'stale', 'Stale'
        FAILED = 'failed', 'Failed'
        UNKNOWN = 'unknown', 'Unknown'
        OBSERVATION_ONLY = 'observation-only', 'Observation only'
        UNSUPPORTED = 'unsupported', 'Unsupported'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    control_id = models.CharField(max_length=255, db_index=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.UNKNOWN)
    owner = models.CharField(max_length=255, blank=True, default='')
    scope = models.JSONField(default=dict, blank=True)
    evidence_links = models.JSONField(default=list, blank=True)
    test_results = models.JSONField(default=dict, blank=True)
    captured_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=255, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-captured_at']
        indexes = [
            models.Index(fields=['tenant_id', 'control_id', '-captured_at']),
        ]

    @property
    def effective_status(self):
        if self.expires_at and self.expires_at <= timezone.now():
            return self.Status.STALE
        return self.status
