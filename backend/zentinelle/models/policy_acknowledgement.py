"""Workload acknowledgements for staged policy changes."""
import uuid

from django.db import models


class PolicyChangeAcknowledgement(models.Model):
    class Status(models.TextChoices):
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged'
        REJECTED = 'rejected', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    change_set = models.ForeignKey(
        'zentinelle.PolicyChangeSet', on_delete=models.CASCADE,
        related_name='acknowledgements',
    )
    subject_type = models.CharField(max_length=30)
    subject_id = models.CharField(max_length=255)
    policy_version = models.JSONField(default=dict)
    acknowledgement_digest = models.CharField(max_length=128)
    status = models.CharField(max_length=20, choices=Status.choices)
    metadata = models.JSONField(default=dict, blank=True)
    acknowledged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-acknowledged_at']
        constraints = [
            models.UniqueConstraint(
                fields=['change_set', 'subject_type', 'subject_id'],
                name='unique_policy_change_ack_subject',
            ),
        ]
        indexes = [
            models.Index(fields=['tenant_id', 'change_set', 'status']),
        ]
