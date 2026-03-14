"""
Data Retention Policy models.

Provides comprehensive data lifecycle management:
- Per-entity type retention periods
- Legal/litigation holds
- Archive policies (cold storage)
- Compliance-driven retention requirements
"""
import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from zentinelle.models.base import Tracking


class RetentionPolicy(Tracking):
    """
    Organization-wide or deployment-specific retention policy.

    Defines how long different types of data are retained and
    what happens when retention periods expire.
    """

    class EntityType(models.TextChoices):
        """Types of data that can have retention policies."""
        ALL = 'all', 'All Data'
        EVENTS = 'events', 'Telemetry Events'
        INTERACTIONS = 'interactions', 'AI Interactions'
        SCANS = 'scans', 'Content Scans'
        AUDIT_LOGS = 'audit_logs', 'Audit Logs'
        SESSIONS = 'sessions', 'User Sessions'
        SECRETS = 'secrets', 'Secret Access Logs'
        USAGE_DATA = 'usage_data', 'Usage/Billing Data'

    class ExpirationAction(models.TextChoices):
        """What happens when data expires."""
        DELETE = 'delete', 'Permanently Delete'
        ARCHIVE = 'archive', 'Archive to Cold Storage'
        ANONYMIZE = 'anonymize', 'Anonymize/Pseudonymize'
        FLAG = 'flag', 'Flag for Review'

    class ComplianceRequirement(models.TextChoices):
        """Compliance framework driving retention."""
        NONE = 'none', 'No Specific Requirement'
        GDPR = 'gdpr', 'GDPR (Right to Erasure)'
        CCPA = 'ccpa', 'CCPA (Data Deletion)'
        HIPAA = 'hipaa', 'HIPAA (6 Year Minimum)'
        SOX = 'sox', 'SOX (7 Year Minimum)'
        PCI_DSS = 'pci_dss', 'PCI-DSS (1 Year)'
        SOC2 = 'soc2', 'SOC 2'
        CUSTOM = 'custom', 'Custom Policy'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Identity
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # Scope
    entity_type = models.CharField(
        max_length=30,
        choices=EntityType.choices,
        default=EntityType.ALL,
        help_text='Type of data this policy applies to'
    )
    # TODO: decouple - deployment FK removed
    deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )

    # Retention period
    retention_days = models.IntegerField(
        default=90,
        help_text='Days to retain data before expiration action'
    )
    minimum_retention_days = models.IntegerField(
        null=True,
        blank=True,
        help_text='Minimum days required by compliance (cannot delete before)'
    )

    # Expiration handling
    expiration_action = models.CharField(
        max_length=20,
        choices=ExpirationAction.choices,
        default=ExpirationAction.DELETE
    )
    archive_location = models.CharField(
        max_length=500,
        blank=True,
        help_text='S3 bucket/path for archived data (if action is archive)'
    )

    # Compliance
    compliance_requirement = models.CharField(
        max_length=20,
        choices=ComplianceRequirement.choices,
        default=ComplianceRequirement.NONE
    )
    compliance_notes = models.TextField(
        blank=True,
        help_text='Notes about compliance requirements'
    )

    # Status
    enabled = models.BooleanField(default=True)
    priority = models.IntegerField(
        default=0,
        help_text='Higher priority overrides lower for same entity type'
    )

    # Audit
    # TODO: decouple - created_by FK removed (use user_id/ext_user_id instead)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    class Meta:
        verbose_name = 'Retention Policy'
        verbose_name_plural = 'Retention Policies'
        ordering = ['-priority', 'entity_type']
        indexes = [
            models.Index(fields=['tenant_id', 'entity_type', 'enabled']),
            models.Index(fields=['deployment_id_ext', 'entity_type']),
        ]

    def __str__(self):
        return f"{self.name} ({self.entity_type})"

    def get_effective_retention_days(self) -> int:
        """Get effective retention considering minimum requirements."""
        if self.minimum_retention_days:
            return max(self.retention_days, self.minimum_retention_days)
        return self.retention_days


class LegalHold(Tracking):
    """
    Legal/litigation hold that preserves data regardless of retention policies.

    When active, data matching the hold criteria cannot be deleted or modified,
    even if retention periods have expired.
    """

    class HoldType(models.TextChoices):
        LITIGATION = 'litigation', 'Litigation Hold'
        REGULATORY = 'regulatory', 'Regulatory Investigation'
        INTERNAL = 'internal', 'Internal Investigation'
        PRESERVATION = 'preservation', 'General Preservation'

    class HoldStatus(models.TextChoices):
        ACTIVE = 'active', 'Active'
        RELEASED = 'released', 'Released'
        EXPIRED = 'expired', 'Expired'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Identity
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    reference_number = models.CharField(
        max_length=100,
        blank=True,
        help_text='External case/matter reference number'
    )

    # Hold type and status
    hold_type = models.CharField(
        max_length=20,
        choices=HoldType.choices,
        default=HoldType.PRESERVATION
    )
    status = models.CharField(
        max_length=20,
        choices=HoldStatus.choices,
        default=HoldStatus.ACTIVE
    )

    # Scope
    applies_to_all = models.BooleanField(
        default=False,
        help_text='If true, applies to all organization data'
    )
    entity_types = models.JSONField(
        default=list,
        blank=True,
        help_text='List of entity types to hold (if not applies_to_all)'
    )
    # TODO: decouple - deployments M2M removed
    deployment_ids_ext = models.JSONField(
        default=list,
        blank=True,
        help_text='External deployment IDs to hold (if not applies_to_all)'
    )
    user_identifiers = models.JSONField(
        default=list,
        blank=True,
        help_text='Specific user IDs whose data is held'
    )

    # Date range
    data_from = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Hold data created after this date'
    )
    data_to = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Hold data created before this date'
    )

    # Hold period
    effective_date = models.DateTimeField(
        default=timezone.now,
        help_text='When the hold becomes effective'
    )
    expiration_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the hold expires (null = indefinite)'
    )
    released_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the hold was released'
    )

    # Custodian
    # TODO: decouple - custodian FK removed (use user_id/ext_user_id instead)
    custodian_email = models.EmailField(
        blank=True,
        help_text='External custodian email (if not a system user)'
    )

    # Notifications
    notify_on_access = models.BooleanField(
        default=False,
        help_text='Send notification when held data is accessed'
    )
    notification_emails = models.JSONField(
        default=list,
        blank=True,
        help_text='Email addresses to notify'
    )

    # Metadata
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text='Additional hold metadata'
    )

    # Audit
    # TODO: decouple - created_by FK removed (use user_id/ext_user_id instead)
    # TODO: decouple - released_by FK removed (use user_id/ext_user_id instead)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    class Meta:
        verbose_name = 'Legal Hold'
        verbose_name_plural = 'Legal Holds'
        ordering = ['-effective_date']
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['hold_type', 'status']),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"

    @property
    def is_active(self) -> bool:
        """Check if hold is currently active."""
        if self.status != self.HoldStatus.ACTIVE:
            return False
        if self.expiration_date and timezone.now() > self.expiration_date:
            return False
        return True

    def release(self, user=None):
        """Release the hold."""
        self.status = self.HoldStatus.RELEASED
        self.released_at = timezone.now()
        self.released_by = user
        self.save(update_fields=['status', 'released_at', 'released_by', 'updated_at'])


class DataArchive(Tracking):
    """
    Record of archived data batches.

    Tracks what data has been archived, where, and when.
    """

    class ArchiveStatus(models.TextChoices):
        PENDING = 'pending', 'Pending Archive'
        IN_PROGRESS = 'in_progress', 'Archiving'
        COMPLETED = 'completed', 'Archived'
        FAILED = 'failed', 'Archive Failed'
        RESTORED = 'restored', 'Restored'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    retention_policy = models.ForeignKey(
        RetentionPolicy,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='archives'
    )

    # Archive details
    entity_type = models.CharField(
        max_length=30,
        choices=RetentionPolicy.EntityType.choices
    )
    status = models.CharField(
        max_length=20,
        choices=ArchiveStatus.choices,
        default=ArchiveStatus.PENDING
    )

    # Data range
    data_from = models.DateTimeField(help_text='Earliest data in archive')
    data_to = models.DateTimeField(help_text='Latest data in archive')
    record_count = models.IntegerField(default=0)
    size_bytes = models.BigIntegerField(default=0)

    # Storage location
    archive_location = models.CharField(
        max_length=500,
        help_text='S3 path or storage location'
    )
    checksum = models.CharField(
        max_length=64,
        blank=True,
        help_text='SHA-256 checksum of archive'
    )

    # Timing
    archived_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When archive can be deleted'
    )

    # Error handling
    error_message = models.TextField(blank=True)
    retry_count = models.IntegerField(default=0)

    class Meta:
        verbose_name = 'Data Archive'
        verbose_name_plural = 'Data Archives'
        ordering = ['-archived_at']
        indexes = [
            models.Index(fields=['tenant_id', 'entity_type', 'status']),
            models.Index(fields=['archived_at']),
        ]

    def __str__(self):
        return f"{self.entity_type} archive ({self.data_from.date()} - {self.data_to.date()})"
