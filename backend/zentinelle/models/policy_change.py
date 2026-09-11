"""Durable staged policy changes and rollout state."""
import uuid

from django.db import models
from django.utils import timezone


class PolicyChangeSet(models.Model):
    """A reviewed, tenant-scoped proposal to change one or more policies."""

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        VALIDATED = 'validated', 'Validated'
        STAGED = 'staged', 'Staged'
        APPROVED = 'approved', 'Approved'
        PROMOTED = 'promoted', 'Promoted'
        ROLLED_BACK = 'rolled_back', 'Rolled Back'
        REJECTED = 'rejected', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    # Proposed policy documents keyed by stable policy ID or ``new:<uuid>``.
    changes = models.JSONField(default=list)
    # Versions observed when the proposal was created: {policy_id: version}.
    base_versions = models.JSONField(default=dict)
    # Structured validation/simulation/replay evidence captured before promotion.
    validation = models.JSONField(default=dict)
    # Scope/tag selectors used to identify affected workloads.
    target_selectors = models.JSONField(default=dict)
    created_by = models.CharField(max_length=255, default='system')
    reviewed_by = models.CharField(max_length=255, blank=True, default='')
    approved_by = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    staged_at = models.DateTimeField(null=True, blank=True)
    promoted_at = models.DateTimeField(null=True, blank=True)
    rolled_back_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'status', '-created_at']),
        ]

    def transition(self, status, *, actor='', validation=None):
        """Move through the reviewed rollout state machine."""
        allowed = {
            self.Status.DRAFT: {self.Status.VALIDATED, self.Status.REJECTED},
            self.Status.VALIDATED: {self.Status.STAGED, self.Status.REJECTED},
            self.Status.STAGED: {self.Status.APPROVED, self.Status.REJECTED},
            self.Status.APPROVED: {self.Status.PROMOTED, self.Status.REJECTED},
            self.Status.PROMOTED: {self.Status.ROLLED_BACK},
            self.Status.ROLLED_BACK: set(),
            self.Status.REJECTED: set(),
        }
        if status not in allowed.get(self.status, set()):
            raise ValueError(f'Cannot transition policy change from {self.status} to {status}')
        self.status = status
        if validation is not None:
            self.validation = validation
        if status == self.Status.VALIDATED:
            self.reviewed_by = actor or self.reviewed_by
        elif status == self.Status.APPROVED:
            self.approved_by = actor or self.approved_by
        elif status == self.Status.STAGED:
            self.staged_at = timezone.now()
        elif status == self.Status.PROMOTED:
            self.promoted_at = timezone.now()
        elif status == self.Status.ROLLED_BACK:
            self.rolled_back_at = timezone.now()
        self.save()
