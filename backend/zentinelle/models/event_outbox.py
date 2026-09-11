"""Durable bounded records for asynchronous event projection delivery."""
import uuid

from django.db import models
from django.utils import timezone


class EventDeliveryOutbox(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        QUEUED = 'queued', 'Queued'
        DELIVERED = 'delivered', 'Delivered'
        DEAD_LETTER = 'dead_letter', 'Dead letter'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    event_id = models.UUIDField(unique=True)
    envelope = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True, default='')
    next_attempt_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=['tenant_id', 'status', 'next_attempt_at'])]
