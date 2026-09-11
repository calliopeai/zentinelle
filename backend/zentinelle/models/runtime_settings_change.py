"""Reviewable tenant runtime settings changes."""
import uuid
from django.db import models
from django.utils import timezone


class RuntimeSettingsChange(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        STAGED = 'staged', 'Staged'
        APPROVED = 'approved', 'Approved'
        APPLIED = 'applied', 'Applied'
        REJECTED = 'rejected', 'Rejected'
        ROLLED_BACK = 'rolled_back', 'Rolled Back'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    settings = models.JSONField(default=dict)
    base_revision = models.PositiveIntegerField(default=0)
    created_by = models.CharField(max_length=255, default='system')
    approved_by = models.CharField(max_length=255, blank=True, default='')
    applied_revision = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['tenant_id', 'status', '-created_at'])]

    def transition(self, status, *, actor=''):
        allowed = {
            self.Status.DRAFT: {self.Status.STAGED, self.Status.REJECTED},
            self.Status.STAGED: {self.Status.APPROVED, self.Status.REJECTED},
            self.Status.APPROVED: {self.Status.APPLIED, self.Status.REJECTED},
            self.Status.APPLIED: {self.Status.ROLLED_BACK},
            self.Status.REJECTED: set(), self.Status.ROLLED_BACK: set(),
        }
        if status not in allowed.get(self.status, set()):
            raise ValueError(f'Cannot transition runtime settings change from {self.status} to {status}')
        self.status = status
        if status == self.Status.APPROVED:
            self.approved_by = actor
            self.approved_at = timezone.now()
        if status == self.Status.APPLIED:
            self.applied_at = timezone.now()
        self.save()
