"""
Notification model — system-level alerts surfaced from Zentinelle events.

Populated by:
- PolicyEngine.evaluate() → on allowed=False (policy violation)
- PolicyEngine._check_organization_budget() → on budget warning
- Incident post_save signal → on new open incident
"""
import uuid
from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        POLICY_VIOLATION = 'policy_violation', 'Policy Violation'
        BUDGET_WARNING = 'budget_warning', 'Budget Warning'
        HIGH_RISK = 'high_risk', 'High Risk Score'
        INCIDENT_OPENED = 'incident_opened', 'Incident Opened'

    class Status(models.TextChoices):
        UNREAD = 'UNREAD', 'Unread'
        READ = 'READ', 'Read'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    type = models.CharField(max_length=50, choices=Type.choices, db_index=True)
    subject = models.CharField(max_length=255)
    message = models.TextField()
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.UNREAD,
        db_index=True,
    )
    status_date = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        app_label = 'zentinelle'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'status', '-created_at']),
        ]

    def __str__(self):
        return f"[{self.type}] {self.subject} ({self.tenant_id})"


def create_notification(tenant_id: str, type: str, subject: str, message: str, metadata: dict = None):
    """
    Helper to create a notification, silently skipping duplicates within 5 minutes.
    Deduplication key: (tenant_id, type, subject) within the last 5 minutes.
    """
    from django.utils import timezone
    from datetime import timedelta

    cutoff = timezone.now() - timedelta(minutes=5)
    exists = Notification.objects.filter(
        tenant_id=tenant_id,
        type=type,
        subject=subject,
        created_at__gte=cutoff,
    ).exists()
    if exists:
        return None

    return Notification.objects.create(
        tenant_id=tenant_id,
        type=type,
        subject=subject,
        message=message,
        metadata=metadata or {},
    )
