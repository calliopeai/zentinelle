"""Durable release qualification and recovery evidence."""
import uuid

from django.db import models
from django.utils import timezone


class ReleaseQualification(models.Model):
    class Status(models.TextChoices):
        QUALIFIED = 'qualified', 'Qualified'
        REJECTED = 'rejected', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    release_id = models.CharField(max_length=255, unique=True)
    version = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices)
    checks = models.JSONField(default=dict)
    rollback_evidence = models.JSONField(default=dict, blank=True)
    sbom_digest = models.CharField(max_length=128, blank=True, default='')
    signature = models.TextField(blank=True, default='')
    qualified_at = models.DateTimeField(default=timezone.now)
