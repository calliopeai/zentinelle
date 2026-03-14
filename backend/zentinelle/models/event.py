import uuid

from django.db import models
from django.utils import timezone


class Event(models.Model):
    """
    Events received from agents - telemetry, audit trails, alerts.
    High-volume table, consider partitioning by time in production.
    """

    class Category(models.TextChoices):
        TELEMETRY = 'telemetry', 'Telemetry'
        AUDIT = 'audit', 'Audit'
        ALERT = 'alert', 'Alert'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PROCESSING = 'processing', 'Processing'
        PROCESSED = 'processed', 'Processed'
        FAILED = 'failed', 'Failed'

    # Common event types
    class EventType:
        # Telemetry
        HEARTBEAT = 'heartbeat'
        METRICS = 'metrics'
        USAGE = 'usage'

        # Audit
        SPAWN = 'spawn'
        STOP = 'stop'
        LOGIN = 'login'
        LOGOUT = 'logout'
        CONFIG_CHANGE = 'config_change'
        SECRET_ACCESS = 'secret_access'
        AI_REQUEST = 'ai_request'
        AI_RESPONSE = 'ai_response'
        TOOL_CALL = 'tool_call'

        # Alert
        POLICY_VIOLATION = 'policy_violation'
        BUDGET_EXCEEDED = 'budget_exceeded'
        ENDPOINT_UNHEALTHY = 'endpoint_unhealthy'
        SECURITY_THREAT = 'security_threat'
        ERROR = 'error'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Source
    endpoint = models.ForeignKey(
        'zentinelle.AgentEndpoint',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='events'
    )
    # TODO: decouple - deployment FK removed
    deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )
    user_identifier = models.CharField(
        max_length=255,
        blank=True,
        help_text='User who triggered event (username or ID)'
    )

    # Event classification
    event_type = models.CharField(max_length=100, db_index=True)
    event_category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.TELEMETRY
    )

    # Event data
    payload = models.JSONField(default=dict)

    # Processing status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    retry_count = models.IntegerField(default=0)

    # Timestamps
    occurred_at = models.DateTimeField(
        db_index=True,
        help_text='When event actually happened (from agent)'
    )
    received_at = models.DateTimeField(
        auto_now_add=True,
        help_text='When we received the event'
    )

    # External references
    # Note: Field name is legacy from prior billing system. Now stores Stripe event IDs.
    lago_event_id = models.CharField(
        max_length=255,
        blank=True,
        help_text='Billing event ID (Stripe)'
    )
    correlation_id = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text='For correlating related events'
    )

    class Meta:
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['tenant_id', 'event_type', 'occurred_at']),
            models.Index(fields=['endpoint', 'occurred_at']),
            models.Index(fields=['status', 'received_at']),
            models.Index(fields=['event_category', 'occurred_at']),
            models.Index(fields=['tenant_id', 'event_category', '-occurred_at']),
        ]

    def __str__(self):
        return f"{self.event_type} - {self.occurred_at}"

    def mark_processing(self):
        """Mark event as being processed."""
        self.status = self.Status.PROCESSING
        self.save(update_fields=['status'])

    def mark_processed(self):
        """Mark event as successfully processed."""
        self.status = self.Status.PROCESSED
        self.processed_at = timezone.now()
        self.save(update_fields=['status', 'processed_at'])

    def mark_failed(self, error_message: str):
        """Mark event as failed."""
        self.status = self.Status.FAILED
        self.error_message = error_message
        self.retry_count += 1
        self.save(update_fields=['status', 'error_message', 'retry_count'])

    @classmethod
    def create_from_agent(
        cls,
        organization,
        endpoint,
        event_type: str,
        category: str,
        payload: dict,
        occurred_at,
        user_identifier: str = '',
    ) -> 'Event':
        """Factory method to create an event from agent data."""
        return cls.objects.create(
            organization=organization,
            endpoint=endpoint,
            deployment=endpoint.deployment if endpoint else None,
            event_type=event_type,
            event_category=category,
            payload=payload,
            occurred_at=occurred_at,
            user_identifier=user_identifier,
        )
