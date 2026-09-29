"""Single-use, server-issued approvals and assistant confirmation proposals."""
import uuid

from django.db import models
from django.utils import timezone


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


class ApprovalRequest(models.Model):
    """An action held for a human decision after /evaluate answered `ask`.

    The requesting workload polls it and an operator decides it. Approving
    records an ordinary ExecutionApproval bound to ``context_digest``, so the
    workload's retry passes the same single-use check as any other approval.
    ``context`` is a capture-filtered copy for the approver; the digest, not
    the copy, is what binds the approval to the exact action.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        DENIED = 'denied', 'Denied'

    # Never stored: a pending request past expires_at reads as expired.
    EXPIRED = 'expired'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    endpoint_id_ext = models.CharField(max_length=255)
    subject = models.CharField(max_length=255, blank=True)
    action = models.CharField(max_length=255)
    context_digest = models.CharField(max_length=64)
    context = models.JSONField(default=dict, blank=True)
    reason = models.TextField(blank=True)
    trace_id = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField()
    decided_by = models.CharField(max_length=255, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_reason = models.TextField(blank=True)
    approval = models.OneToOneField(ExecutionApproval, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='request')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['tenant_id', 'status', 'expires_at'])]

    def save(self, *args, **kwargs):
        from zentinelle.services.content_capture import capture_payload
        self.context = capture_payload(self.context, self.tenant_id)
        return super().save(*args, **kwargs)

    def current_status(self):
        if self.status == self.Status.PENDING and self.expires_at <= timezone.now():
            return self.EXPIRED
        return self.status
