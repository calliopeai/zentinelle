"""
Usage metrics models for high-volume telemetry and billing aggregation.

Billing categories:
1. Infrastructure (cloud) - Only for MANAGED deployments (we host)
   - Compute, storage, network costs we incur
   - Enterprise BYOC customers don't pay this

2. API/Token usage - For ALL deployments
   - LLM passthrough costs (Anthropic, OpenAI, etc.)
   - Charged regardless of hosting model

3. Licensing - For ALL deployments
   - All deployments (managed + BYOC) need valid license
   - License validates agent registration

Architecture:
    1000s of Agents -> Central API -> RabbitMQ -> Celery Workers -> UsageMetric (raw)
                                                                        |
                                                        Aggregation Task (hourly)
                                                                        |
                                                    UsageAggregate (rolled up) -> Stripe
"""
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone
from django.db.models import Sum, Count, Avg, Max, Min
from django.db.models.functions import TruncHour, TruncDay


class UsageMetric(models.Model):
    """
    Raw usage metrics from agents - high volume, append-only.

    Two main categories:
    1. Infrastructure (cloud billing) - compute, storage, network
    2. API/Token usage (LLM passthrough) - tokens per model per user

    This table will be very large. Consider:
    - Partitioning by time (e.g., monthly partitions)
    - Archiving old data to cold storage
    - TimescaleDB or similar for time-series optimization
    """

    class Category(models.TextChoices):
        INFRASTRUCTURE = 'infrastructure', 'Infrastructure'
        API_TOKENS = 'api_tokens', 'API/Token Usage'
        USER_ACTIVITY = 'user_activity', 'User Activity'

    class MetricType(models.TextChoices):
        # =====================================================================
        # Infrastructure metrics (cloud billing)
        # =====================================================================
        # Compute
        COMPUTE_HOURS = 'compute_hours', 'Compute Hours'
        GPU_HOURS = 'gpu_hours', 'GPU Hours'
        CPU_SECONDS = 'cpu_seconds', 'CPU Seconds'
        MEMORY_GB_HOURS = 'memory_gb_hours', 'Memory GB Hours'

        # Storage
        STORAGE_GB = 'storage_gb', 'Storage GB'
        STORAGE_GB_HOURS = 'storage_gb_hours', 'Storage GB Hours'
        SNAPSHOT_GB = 'snapshot_gb', 'Snapshot Storage GB'

        # Network
        DATA_TRANSFER_GB = 'data_transfer_gb', 'Data Transfer GB'
        DATA_TRANSFER_IN_GB = 'data_transfer_in_gb', 'Data Transfer In GB'
        DATA_TRANSFER_OUT_GB = 'data_transfer_out_gb', 'Data Transfer Out GB'

        # Container/Instance
        CONTAINER_HOURS = 'container_hours', 'Container Hours'
        INSTANCE_HOURS = 'instance_hours', 'Instance Hours'

        # =====================================================================
        # API/Token usage (LLM passthrough billing)
        # =====================================================================
        AI_REQUESTS = 'ai_requests', 'AI Requests'
        AI_INPUT_TOKENS = 'ai_input_tokens', 'AI Input Tokens'
        AI_OUTPUT_TOKENS = 'ai_output_tokens', 'AI Output Tokens'
        AI_TOTAL_TOKENS = 'ai_total_tokens', 'AI Total Tokens'
        AI_CACHE_READ_TOKENS = 'ai_cache_read_tokens', 'AI Cache Read Tokens'
        AI_CACHE_WRITE_TOKENS = 'ai_cache_write_tokens', 'AI Cache Write Tokens'

        # =====================================================================
        # User activity metrics
        # =====================================================================
        ACTIVE_USERS = 'active_users', 'Active Users'
        NOTEBOOK_SESSIONS = 'notebook_sessions', 'Notebook Sessions'
        NOTEBOOK_HOURS = 'notebook_hours', 'Notebook Hours'
        API_CALLS = 'api_calls', 'API Calls'

        # Tool-specific
        EXPERIMENT_RUNS = 'experiment_runs', 'Experiment Runs'
        MODEL_DEPLOYMENTS = 'model_deployments', 'Model Deployments'
        PIPELINE_RUNS = 'pipeline_runs', 'Pipeline Runs'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Source identification
    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    # TODO: decouple - deployment FK removed
    deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )
    endpoint = models.ForeignKey(
        'zentinelle.AgentEndpoint',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='usage_metrics'
    )

    # Metric data
    category = models.CharField(
        max_length=30,
        choices=Category.choices,
        default=Category.INFRASTRUCTURE,
        db_index=True
    )
    metric_type = models.CharField(
        max_length=50,
        choices=MetricType.choices,
        db_index=True
    )
    value = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        help_text='Metric value (e.g., hours, count, GB)'
    )
    unit = models.CharField(
        max_length=20,
        default='count',
        help_text='Unit of measurement'
    )

    # Context - common
    user_identifier = models.CharField(
        max_length=255,
        blank=True,
        db_index=True,
        help_text='User associated with this usage'
    )
    tool_type = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        help_text='Tool type (jupyterhub, mlflow, airflow, etc.)'
    )
    resource_id = models.CharField(
        max_length=255,
        blank=True,
        help_text='Specific resource ID (notebook, experiment, etc.)'
    )

    # Context - AI/LLM specific
    ai_provider = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        help_text='AI provider (anthropic, openai, google, etc.)'
    )
    ai_model = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text='Model name (claude-3-opus, gpt-4, etc.)'
    )
    ai_request_id = models.CharField(
        max_length=255,
        blank=True,
        help_text='Provider request ID for correlation'
    )

    # Context - Infrastructure specific
    instance_type = models.CharField(
        max_length=50,
        blank=True,
        help_text='Cloud instance type (m5.large, etc.)'
    )
    region = models.CharField(
        max_length=50,
        blank=True,
        help_text='Cloud region'
    )

    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text='Additional context'
    )

    # Timing
    occurred_at = models.DateTimeField(
        db_index=True,
        help_text='When the usage occurred'
    )
    received_at = models.DateTimeField(
        auto_now_add=True,
        help_text='When we received the metric'
    )

    # Processing state
    aggregated = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Has this been rolled up into UsageAggregate?'
    )
    aggregated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-occurred_at']
        indexes = [
            # Primary query patterns
            models.Index(fields=['tenant_id', 'metric_type', 'occurred_at']),
            models.Index(fields=['tenant_id', 'category', 'occurred_at']),
            models.Index(fields=['tenant_id', 'occurred_at']),
            models.Index(fields=['deployment_id_ext', 'metric_type', 'occurred_at']),
            # Aggregation queries
            models.Index(fields=['aggregated', 'occurred_at']),
            models.Index(fields=['tenant_id', 'aggregated', 'occurred_at']),
            # User-level queries
            models.Index(fields=['tenant_id', 'user_identifier', 'occurred_at']),
            # AI-specific queries
            models.Index(fields=['tenant_id', 'ai_provider', 'ai_model', 'occurred_at']),
            models.Index(fields=['tenant_id', 'user_identifier', 'ai_model', 'occurred_at']),
        ]

    def __str__(self):
        return f"{self.metric_type}: {self.value} ({self.occurred_at})"

    @classmethod
    def record_from_heartbeat(
        cls,
        endpoint,
        metrics: dict,
        occurred_at=None
    ):
        """
        Record infrastructure usage metrics from an agent heartbeat.

        Args:
            endpoint: AgentEndpoint that sent the heartbeat
            metrics: Dict of metric_type -> value
            occurred_at: When the metrics were collected
        """
        if not metrics:
            return []

        occurred_at = occurred_at or timezone.now()
        records = []

        for metric_type, value in metrics.items():
            if metric_type not in cls.MetricType.values:
                continue

            if value is None or value == 0:
                continue

            record = cls(
                tenant_id=endpoint.tenant_id,
                deployment_id_ext=endpoint.deployment_id_ext,
                endpoint=endpoint,
                category=cls.Category.INFRASTRUCTURE,
                metric_type=metric_type,
                value=Decimal(str(value)),
                tool_type=endpoint.tool_type or '',
                occurred_at=occurred_at,
            )
            records.append(record)

        if records:
            cls.objects.bulk_create(records)

        return records

    @classmethod
    def record_ai_usage(
        cls,
        organization,
        user_identifier: str,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        request_id: str = '',
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        endpoint=None,
        deployment=None,
        occurred_at=None,
        metadata: dict = None
    ):
        """
        Record AI/LLM token usage.

        Args:
            organization: Organization using the API
            user_identifier: User who made the request
            provider: AI provider (anthropic, openai, google)
            model: Model name (claude-3-opus, gpt-4, etc.)
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            request_id: Provider's request ID
            cache_read_tokens: Cached input tokens read
            cache_write_tokens: Tokens written to cache
            endpoint: Optional AgentEndpoint source
            deployment: Optional Deployment source
            occurred_at: When the request occurred
            metadata: Additional context
        """
        occurred_at = occurred_at or timezone.now()
        records = []

        base_kwargs = {
            'tenant_id': organization,  # TODO: decouple - callers should pass tenant_id
            'deployment_id_ext': deployment,  # TODO: decouple - callers should pass deployment_id_ext
            'endpoint': endpoint,
            'category': cls.Category.API_TOKENS,
            'user_identifier': user_identifier,
            'ai_provider': provider,
            'ai_model': model,
            'ai_request_id': request_id,
            'occurred_at': occurred_at,
            'metadata': metadata or {},
        }

        # Input tokens
        if input_tokens > 0:
            records.append(cls(
                **base_kwargs,
                metric_type=cls.MetricType.AI_INPUT_TOKENS,
                value=Decimal(input_tokens),
                unit='tokens'
            ))

        # Output tokens
        if output_tokens > 0:
            records.append(cls(
                **base_kwargs,
                metric_type=cls.MetricType.AI_OUTPUT_TOKENS,
                value=Decimal(output_tokens),
                unit='tokens'
            ))

        # Total tokens
        total_tokens = input_tokens + output_tokens
        if total_tokens > 0:
            records.append(cls(
                **base_kwargs,
                metric_type=cls.MetricType.AI_TOTAL_TOKENS,
                value=Decimal(total_tokens),
                unit='tokens'
            ))

        # Cache tokens (Anthropic-specific)
        if cache_read_tokens > 0:
            records.append(cls(
                **base_kwargs,
                metric_type=cls.MetricType.AI_CACHE_READ_TOKENS,
                value=Decimal(cache_read_tokens),
                unit='tokens'
            ))

        if cache_write_tokens > 0:
            records.append(cls(
                **base_kwargs,
                metric_type=cls.MetricType.AI_CACHE_WRITE_TOKENS,
                value=Decimal(cache_write_tokens),
                unit='tokens'
            ))

        # Request count
        records.append(cls(
            **base_kwargs,
            metric_type=cls.MetricType.AI_REQUESTS,
            value=Decimal(1),
            unit='count'
        ))

        if records:
            cls.objects.bulk_create(records)

        return records


class UsageAggregate(models.Model):
    """
    Aggregated usage data for billing.

    Rolled up from UsageMetric on a schedule (hourly/daily).
    These records are sent to Stripe for billing.
    """

    class Period(models.TextChoices):
        HOURLY = 'hourly', 'Hourly'
        DAILY = 'daily', 'Daily'
        MONTHLY = 'monthly', 'Monthly'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SENT = 'sent', 'Sent to Billing'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    # TODO: decouple - deployment FK removed
    deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )

    # Aggregation period
    period_type = models.CharField(
        max_length=20,
        choices=Period.choices,
        default=Period.HOURLY
    )
    period_start = models.DateTimeField(db_index=True)
    period_end = models.DateTimeField()

    # Metric data
    metric_type = models.CharField(
        max_length=50,
        choices=UsageMetric.MetricType.choices,
        db_index=True
    )
    total_value = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        help_text='Sum of values in period'
    )
    count = models.IntegerField(
        default=0,
        help_text='Number of raw records aggregated'
    )
    avg_value = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        null=True,
        blank=True
    )
    max_value = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        null=True,
        blank=True
    )
    min_value = models.DecimalField(
        max_digits=20,
        decimal_places=6,
        null=True,
        blank=True
    )

    # Context
    tool_type = models.CharField(max_length=50, blank=True)
    unique_users = models.IntegerField(
        default=0,
        help_text='Number of unique users in period'
    )
    metadata = models.JSONField(default=dict, blank=True)

    # Billing integration
    # Note: Field names prefixed with 'lago_' are legacy from prior billing system.
    # They now store Stripe billing event IDs. Field names kept for DB migration compatibility.
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    lago_event_id = models.CharField(max_length=255, blank=True, help_text='Billing event ID (Stripe)')
    lago_transaction_id = models.CharField(max_length=255, blank=True, help_text='Billing transaction ID (Stripe)')
    sent_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-period_start']
        indexes = [
            models.Index(fields=['tenant_id', 'metric_type', 'period_start']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['tenant_id', 'period_type', 'period_start']),
        ]
        unique_together = [
            ('tenant_id', 'deployment_id_ext', 'metric_type', 'period_type', 'period_start', 'tool_type')
        ]

    def __str__(self):
        return f"{self.tenant_id} - {self.metric_type}: {self.total_value} ({self.period_start})"

    @classmethod
    def aggregate_hourly(cls, organization, hour_start, hour_end=None):
        """
        Aggregate raw metrics for an organization for a specific hour.

        Args:
            organization: Organization to aggregate for
            hour_start: Start of the hour to aggregate
            hour_end: End of the hour (defaults to hour_start + 1 hour)
        """
        from django.db.models import Count as DjangoCount

        if hour_end is None:
            from datetime import timedelta
            hour_end = hour_start + timedelta(hours=1)

        # Get raw metrics for this hour that haven't been aggregated
        raw_metrics = UsageMetric.objects.filter(
            tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
            occurred_at__gte=hour_start,
            occurred_at__lt=hour_end,
            aggregated=False
        )

        # Group by metric_type, deployment, tool_type
        aggregations = raw_metrics.values(
            'metric_type', 'deployment_id', 'tool_type'
        ).annotate(
            total=Sum('value'),
            count=DjangoCount('id'),
            avg=Avg('value'),
            max_val=Max('value'),
            min_val=Min('value'),
        )

        created = []
        for agg in aggregations:
            # Count unique users
            unique_users = raw_metrics.filter(
                metric_type=agg['metric_type'],
                deployment_id=agg['deployment_id'],
                tool_type=agg['tool_type'],
            ).exclude(user_identifier='').values('user_identifier').distinct().count()

            aggregate, _ = cls.objects.update_or_create(
                tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
                deployment_id=agg['deployment_id'],
                metric_type=agg['metric_type'],
                period_type=cls.Period.HOURLY,
                period_start=hour_start,
                tool_type=agg['tool_type'] or '',
                defaults={
                    'period_end': hour_end,
                    'total_value': agg['total'] or 0,
                    'count': agg['count'] or 0,
                    'avg_value': agg['avg'],
                    'max_value': agg['max_val'],
                    'min_value': agg['min_val'],
                    'unique_users': unique_users,
                    'status': cls.Status.PENDING,
                }
            )
            created.append(aggregate)

        # Mark raw metrics as aggregated
        raw_metrics.update(aggregated=True, aggregated_at=timezone.now())

        return created

    def mark_sent(self, billing_event_id: str, billing_transaction_id: str = ''):
        """Mark this aggregate as sent to billing (Stripe)."""
        self.status = self.Status.SENT
        self.lago_event_id = billing_event_id
        self.lago_transaction_id = billing_transaction_id
        self.sent_at = timezone.now()
        self.save(update_fields=['status', 'lago_event_id', 'lago_transaction_id', 'sent_at'])

    def mark_failed(self, error: str):
        """Mark this aggregate as failed to send."""
        self.status = self.Status.FAILED
        self.error_message = error
        self.save(update_fields=['status', 'error_message'])


class Subscription(models.Model):
    """
    Customer subscription for billing.

    Links an organization to a Stripe subscription and plan.
    """

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        PENDING = 'pending', 'Pending'
        CANCELED = 'canceled', 'Canceled'
        TERMINATED = 'terminated', 'Terminated'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Plan info
    plan_code = models.CharField(
        max_length=100,
        help_text='Plan code (team, business, enterprise)'
    )
    plan_name = models.CharField(max_length=255, blank=True)

    # Note: These fields are unused (legacy from prior billing system).
    # Stripe customer/subscription IDs are stored in billing.Subscription model.
    # Field names kept for DB migration compatibility - do not use in new code.
    lago_customer_id = models.CharField(
        max_length=255,
        blank=True,
        help_text='Deprecated - not used'
    )
    lago_subscription_id = models.CharField(
        max_length=255,
        blank=True,
        unique=True,
        null=True,
        help_text='Deprecated - not used'
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    # Dates
    started_at = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)
    terminated_at = models.DateTimeField(null=True, blank=True)

    # Billing
    billing_period = models.CharField(
        max_length=20,
        default='monthly',
        help_text='Billing period (monthly, yearly)'
    )
    currency = models.CharField(max_length=3, default='USD')

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.tenant_id} - {self.plan_code} ({self.status})"

    @classmethod
    def get_active_for_org(cls, organization):
        """Get the active subscription for an organization."""
        return cls.objects.filter(
            tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
            status=cls.Status.ACTIVE
        ).first()


class License(models.Model):
    """
    Organization license for billing and feature access.

    Licensing model:
    - Per-user: Pay per active user (seat-based)
    - Per-tool (future): Additional charges per tool type

    All deployments (managed and BYOC) require a valid license.
    License keys are validated during agent registration.
    """

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        EXPIRED = 'expired', 'Expired'
        REVOKED = 'revoked', 'Revoked'
        SUSPENDED = 'suspended', 'Suspended'

    class LicenseType(models.TextChoices):
        MANAGED = 'managed', 'Managed (We Host)'
        BYOC = 'byoc', 'Bring Your Own Cloud'
        TRIAL = 'trial', 'Trial'

    class BillingModel(models.TextChoices):
        PER_USER = 'per_user', 'Per User (Seat-based)'
        PER_USER_TOOL = 'per_user_tool', 'Per User + Per Tool'
        FLAT = 'flat', 'Flat Rate'
        USAGE = 'usage', 'Usage-based'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    subscription = models.ForeignKey(
        'zentinelle.Subscription',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='licenses'
    )

    # License key (used by agents to authenticate)
    license_key = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text='License key for agent validation'
    )

    # License details
    license_type = models.CharField(
        max_length=20,
        choices=LicenseType.choices,
        default=LicenseType.MANAGED
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE
    )

    # Billing model
    billing_model = models.CharField(
        max_length=20,
        choices=BillingModel.choices,
        default=BillingModel.PER_USER,
        help_text='How this license is billed'
    )

    # Per-user pricing
    price_per_user = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text='Monthly price per active user'
    )
    min_users = models.IntegerField(
        default=1,
        help_text='Minimum number of users billed'
    )
    included_users = models.IntegerField(
        default=0,
        help_text='Users included in base price'
    )

    # Per-tool pricing (future) - JSON config, actual tool records in LicensedTool
    tool_pricing_config = models.JSONField(
        default=list,
        blank=True,
        help_text='Tool pricing configuration'
    )

    # Scope limits
    max_deployments = models.IntegerField(
        default=1,
        help_text='Maximum number of deployments allowed (-1 = unlimited)'
    )
    max_agents = models.IntegerField(
        default=100,
        help_text='Maximum number of agents allowed (-1 = unlimited)'
    )
    max_users = models.IntegerField(
        default=50,
        help_text='Maximum number of active users (-1 = unlimited)'
    )

    # Feature flags
    features = models.JSONField(
        default=dict,
        blank=True,
        help_text='Licensed features (ai_gateway, custom_images, etc.)'
    )

    # Validity
    issued_at = models.DateTimeField(auto_now_add=True)
    valid_from = models.DateTimeField(default=timezone.now)
    valid_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text='License expiration (null = perpetual)'
    )

    # Billing flags
    bill_infrastructure = models.BooleanField(
        default=True,
        help_text='Bill for infrastructure usage (false for BYOC)'
    )
    bill_api_tokens = models.BooleanField(
        default=True,
        help_text='Bill for API/token usage'
    )

    # Tracking
    last_validated_at = models.DateTimeField(null=True, blank=True)
    validation_count = models.IntegerField(default=0)

    # =========================================================================
    # Grace Period Fields
    # =========================================================================
    # When license validation fails (payment issues, expiration), we provide
    # a grace period before hard-blocking access.

    class GracePeriodReason(models.TextChoices):
        PAYMENT_FAILED = 'payment_failed', 'Payment Failed'
        SUBSCRIPTION_EXPIRED = 'subscription_expired', 'Subscription Expired'
        SUBSCRIPTION_CANCELED = 'subscription_canceled', 'Subscription Canceled'
        USAGE_LIMIT_EXCEEDED = 'usage_limit_exceeded', 'Usage Limit Exceeded'
        MANUAL = 'manual', 'Manual Override'

    grace_period_started = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the grace period started'
    )
    grace_period_ends = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the grace period expires (hard block after this)'
    )
    grace_period_reason = models.CharField(
        max_length=30,
        choices=GracePeriodReason.choices,
        blank=True,
        help_text='Reason for entering grace period'
    )
    grace_period_warnings_sent = models.IntegerField(
        default=0,
        help_text='Number of warning notifications sent during grace period'
    )
    grace_period_last_warning_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the last grace period warning was sent'
    )

    # =========================================================================
    # Enterprise License Hierarchy (Parent/Child relationships)
    # =========================================================================

    # Parent license for child organizations
    parent_license = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='child_licenses',
        help_text='Parent license for enterprise hierarchy'
    )

    # Whether this is a parent license that can have children
    is_parent_license = models.BooleanField(
        default=False,
        help_text='Whether this license can have child licenses'
    )

    # Maximum number of child licenses allowed (enterprise tier only)
    max_child_licenses = models.IntegerField(
        default=0,
        help_text='Maximum number of child licenses (-1 = unlimited)'
    )

    # Whether child licenses inherit entitlements from parent
    inherit_entitlements = models.BooleanField(
        default=True,
        help_text='Whether child licenses inherit features from parent'
    )

    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['license_key']),
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['parent_license']),
        ]

    def __str__(self):
        return f"{self.tenant_id} - {self.license_type} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.license_key:
            self.license_key = self._generate_license_key()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_license_key():
        """Generate a unique license key."""
        import secrets
        # Format: CLIO-XXXX-XXXX-XXXX-XXXX
        parts = [secrets.token_hex(2).upper() for _ in range(4)]
        return f"CLIO-{'-'.join(parts)}"

    @property
    def is_valid(self) -> bool:
        """Check if license is currently valid."""
        if self.status != self.Status.ACTIVE:
            return False
        if self.valid_until and self.valid_until < timezone.now():
            return False
        return True

    @property
    def is_expired(self) -> bool:
        """Check if license has expired."""
        if self.valid_until and self.valid_until < timezone.now():
            return True
        return False

    def validate(self) -> tuple[bool, str]:
        """
        Validate the license and return (is_valid, error_message).
        """
        if self.status == self.Status.REVOKED:
            return False, "License has been revoked"
        if self.status == self.Status.SUSPENDED:
            return False, "License has been suspended"
        if self.is_expired:
            return False, "License has expired"
        if self.status != self.Status.ACTIVE:
            return False, f"License status is {self.status}"

        # Update validation tracking
        self.last_validated_at = timezone.now()
        self.validation_count += 1
        self.save(update_fields=['last_validated_at', 'validation_count'])

        return True, ""

    def check_deployment_limit(self) -> tuple[bool, str]:
        """Check if adding another deployment is allowed."""
        # TODO: decouple - deployments.models.Deployment not available in standalone
        current_count = Deployment.objects.filter(
            tenant_id=self.tenant_id,
            status__in=[Deployment.Status.ACTIVE, Deployment.Status.PENDING]
        ).count()

        if current_count >= self.max_deployments:
            return False, f"Deployment limit reached ({self.max_deployments})"
        return True, ""

    def check_agent_limit(self) -> tuple[bool, str]:
        """Check if adding another agent is allowed."""
        from zentinelle.models import AgentEndpoint
        current_count = AgentEndpoint.objects.filter(
            tenant_id=self.tenant_id,
            is_active=True
        ).count()

        if current_count >= self.max_agents:
            return False, f"Agent limit reached ({self.max_agents})"
        return True, ""

    # =========================================================================
    # Grace Period Methods
    # =========================================================================

    @property
    def is_in_grace_period(self) -> bool:
        """Check if the license is currently in a grace period."""
        if not self.grace_period_started or not self.grace_period_ends:
            return False
        now = timezone.now()
        return self.grace_period_started <= now < self.grace_period_ends

    @property
    def grace_period_expired(self) -> bool:
        """Check if the grace period has expired (should hard-block)."""
        if not self.grace_period_ends:
            return False
        return timezone.now() >= self.grace_period_ends

    @property
    def days_remaining_in_grace_period(self) -> int:
        """Get the number of days remaining in the grace period."""
        if not self.is_in_grace_period:
            return 0
        delta = self.grace_period_ends - timezone.now()
        return max(0, delta.days)

    def clear_grace_period(self):
        """Clear the grace period (license issue resolved)."""
        self.grace_period_started = None
        self.grace_period_ends = None
        self.grace_period_reason = ''
        self.grace_period_warnings_sent = 0
        self.grace_period_last_warning_at = None
        self.save(update_fields=[
            'grace_period_started',
            'grace_period_ends',
            'grace_period_reason',
            'grace_period_warnings_sent',
            'grace_period_last_warning_at',
            'updated_at',
        ])

    @classmethod
    def get_by_key(cls, license_key: str):
        """Get a license by its key."""
        try:
            return cls.objects.get(license_key=license_key)
        except cls.DoesNotExist:
            return None

    @classmethod
    def validate_key(cls, license_key: str) -> tuple[bool, str, 'License']:
        """
        Validate a license key and return (is_valid, error_message, license).
        """
        license_obj = cls.get_by_key(license_key)
        if not license_obj:
            return False, "Invalid license key", None

        is_valid, error = license_obj.validate()
        return is_valid, error, license_obj

    @classmethod
    def create_for_subscription(
        cls,
        organization,
        subscription,
        license_type: str = None,
        max_deployments: int = None,
        max_agents: int = None,
        max_users: int = None
    ):
        """
        Create a license based on subscription plan.
        """
        # Defaults based on plan
        plan_defaults = {
            'byoc': {
                'max_deployments': 1,
                'max_agents': 50,
                'max_users': 25,
                'features': {'ai_gateway': True},
            },
            'managed': {
                'max_deployments': 5,
                'max_agents': 200,
                'max_users': 100,
                'features': {'ai_gateway': True, 'custom_images': True, 'sso': True},
            },
            'enterprise': {
                'max_deployments': -1,  # Unlimited
                'max_agents': -1,
                'max_users': -1,
                'features': {'ai_gateway': True, 'custom_images': True, 'sso': True, 'dedicated_support': True},
            },
        }

        plan_code = subscription.plan_code if subscription else 'byoc'
        defaults = plan_defaults.get(plan_code, plan_defaults['byoc'])

        # Determine license type
        if license_type is None:
            license_type = cls.LicenseType.MANAGED

        # BYOC doesn't bill for infrastructure
        bill_infrastructure = license_type != cls.LicenseType.BYOC

        return cls.objects.create(
            tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
            subscription=subscription,
            license_type=license_type,
            max_deployments=max_deployments or defaults['max_deployments'],
            max_agents=max_agents or defaults['max_agents'],
            max_users=max_users or defaults['max_users'],
            features=defaults['features'],
            bill_infrastructure=bill_infrastructure,
        )

    # =========================================================================
    # License Hierarchy Methods
    # =========================================================================

    @property
    def is_child_license(self) -> bool:
        """Check if this is a child license (has a parent)."""
        return self.parent_license_id is not None

    @property
    def child_license_count(self) -> int:
        """Get the count of child licenses."""
        return self.child_licenses.filter(status=self.Status.ACTIVE).count()

    @property
    def can_add_child_license(self) -> bool:
        """Check if this license can add another child license."""
        if not self.is_parent_license:
            return False
        if self.max_child_licenses == -1:  # Unlimited
            return True
        return self.child_license_count < self.max_child_licenses

    def get_effective_features(self) -> dict:
        """
        Get the effective features for this license.

        For child licenses with inherit_entitlements=True, this merges
        parent features with any child-specific features.
        """
        if self.is_child_license and self.inherit_entitlements and self.parent_license:
            # Start with parent features
            effective = dict(self.parent_license.features)
            # Child can only have features that parent has (no escalation)
            for key, value in self.features.items():
                if key in effective:
                    # Child can only restrict, not expand
                    if isinstance(value, bool):
                        effective[key] = effective[key] and value
                    elif isinstance(value, (int, float)):
                        # For numeric limits, child gets the lesser value
                        effective[key] = min(effective[key], value)
                    else:
                        effective[key] = value
            return effective
        return dict(self.features)

    def get_effective_limits(self) -> dict:
        """
        Get effective resource limits considering parent license.

        For child licenses with inherit_entitlements=True, limits are
        capped by parent limits.
        """
        limits = {
            'max_deployments': self.max_deployments,
            'max_agents': self.max_agents,
            'max_users': self.max_users,
        }

        if self.is_child_license and self.inherit_entitlements and self.parent_license:
            parent = self.parent_license
            for key in limits:
                parent_limit = getattr(parent, key)
                if parent_limit == -1:  # Parent unlimited
                    continue
                if limits[key] == -1:  # Child unlimited but parent not
                    limits[key] = parent_limit
                else:
                    limits[key] = min(limits[key], parent_limit)

        return limits

    def validate_hierarchy_constraints(self) -> tuple[bool, str]:
        """
        Validate that license hierarchy constraints are met.

        Returns (is_valid, error_message).
        """
        # If this is a child, validate against parent
        if self.is_child_license and self.parent_license:
            parent = self.parent_license

            # Parent must be active
            if parent.status != self.Status.ACTIVE:
                return False, "Parent license is not active"

            # Parent must be a parent license
            if not parent.is_parent_license:
                return False, "Parent license is not configured as a parent"

            # Check if parent allows this child
            if parent.max_child_licenses != -1:
                current_children = parent.child_licenses.exclude(id=self.id).filter(
                    status=self.Status.ACTIVE
                ).count()
                if current_children >= parent.max_child_licenses:
                    return False, f"Parent license child limit reached ({parent.max_child_licenses})"

            # If inheriting, validate features don't exceed parent
            if self.inherit_entitlements:
                for key, value in self.features.items():
                    if key not in parent.features:
                        return False, f"Child license cannot have feature '{key}' that parent doesn't have"

        return True, ""


class LicensedUser(models.Model):
    """
    Tracks individual users for per-user licensing.

    Licensing enforcement:
    - Managed deployments: Hard limit - reject user creation if over limit
    - BYOC/Self-hosted: Soft tracking - count unique users per month for billing

    Users are tracked by their identifier (from Cognito/Auth0) and
    their activity determines if they count as an active seat.
    """

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        INACTIVE = 'inactive', 'Inactive'
        INVITED = 'invited', 'Invited (not yet active)'
        SUSPENDED = 'suspended', 'Suspended'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    license = models.ForeignKey(
        'zentinelle.License',
        on_delete=models.CASCADE,
        related_name='licensed_users'
    )
    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # User identification
    user_identifier = models.CharField(
        max_length=255,
        db_index=True,
        help_text='User ID from IdP (Cognito/Auth0)'
    )
    email = models.EmailField(blank=True)
    display_name = models.CharField(max_length=255, blank=True)

    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE
    )

    # Activity tracking
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(null=True, blank=True)
    activity_count = models.IntegerField(
        default=0,
        help_text='Number of activities this billing period'
    )

    # Billing
    is_billable = models.BooleanField(
        default=True,
        help_text='Should this user count towards seat billing?'
    )
    billing_started_at = models.DateTimeField(null=True, blank=True)
    billing_ended_at = models.DateTimeField(null=True, blank=True)

    # Metadata
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-last_active_at']
        unique_together = [('license', 'user_identifier')]
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['license', 'status']),
            models.Index(fields=['user_identifier']),
            models.Index(fields=['tenant_id', 'last_active_at']),
        ]

    def __str__(self):
        return f"{self.display_name or self.email or self.user_identifier} ({self.status})"

    def record_activity(self):
        """Record user activity - updates last_active_at and count."""
        self.last_active_at = timezone.now()
        self.activity_count += 1

        # Auto-activate if invited
        if self.status == self.Status.INVITED:
            self.status = self.Status.ACTIVE
            self.billing_started_at = timezone.now()

        self.save(update_fields=['last_active_at', 'activity_count', 'status', 'billing_started_at'])

    @classmethod
    def get_or_create_for_user(
        cls,
        license_obj,
        user_identifier: str,
        email: str = '',
        display_name: str = ''
    ):
        """
        Get or create a licensed user record.

        Called when a user is first seen in the system.
        """
        user, created = cls.objects.get_or_create(
            license=license_obj,
            user_identifier=user_identifier,
            defaults={
                'tenant_id': license_obj.tenant_id,  # TODO: decouple
                'email': email,
                'display_name': display_name,
                'billing_started_at': timezone.now(),
            }
        )

        if not created and (email or display_name):
            # Update info if provided
            if email and not user.email:
                user.email = email
            if display_name and not user.display_name:
                user.display_name = display_name
            user.save(update_fields=['email', 'display_name'])

        return user, created

    @classmethod
    def count_active_for_license(cls, license_obj) -> int:
        """Count active billable users for a license."""
        return cls.objects.filter(
            license=license_obj,
            status=cls.Status.ACTIVE,
            is_billable=True
        ).count()

    @classmethod
    def count_active_for_org(cls, organization) -> int:
        """Count active billable users for an organization."""
        return cls.objects.filter(
            tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
            status=cls.Status.ACTIVE,
            is_billable=True
        ).count()

    @classmethod
    def count_unique_for_period(cls, organization, period_start, period_end) -> int:
        """
        Count unique active users in a billing period.

        For BYOC customers, this is used to determine billing.
        A user counts if they were active at any point during the period.
        """
        return cls.objects.filter(
            tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
            is_billable=True,
            last_active_at__gte=period_start,
            last_active_at__lt=period_end
        ).count()


class MonthlyUserCount(models.Model):
    """
    Monthly snapshot of unique active users for billing.

    Generated at the end of each billing period, used for
    per-user billing especially for BYOC customers.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    license = models.ForeignKey(
        'zentinelle.License',
        on_delete=models.CASCADE,
        related_name='monthly_user_counts'
    )

    # Period
    year = models.IntegerField()
    month = models.IntegerField()
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()

    # Counts
    total_users = models.IntegerField(
        default=0,
        help_text='Total unique users who were active'
    )
    billable_users = models.IntegerField(
        default=0,
        help_text='Users that count towards billing'
    )
    new_users = models.IntegerField(
        default=0,
        help_text='Users who joined this month'
    )
    churned_users = models.IntegerField(
        default=0,
        help_text='Users who became inactive this month'
    )

    # Breakdown by tool (for per-tool billing)
    users_by_tool = models.JSONField(
        default=dict,
        blank=True,
        help_text='User counts per tool type'
    )

    # Billing
    calculated_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text='Calculated billing amount'
    )
    # Note: Field names prefixed with 'lago' are legacy. Now stores Stripe event IDs.
    lago_event_id = models.CharField(max_length=255, blank=True, help_text='Billing event ID (Stripe)')
    sent_to_lago_at = models.DateTimeField(null=True, blank=True, help_text='When sent to billing (Stripe)')

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-year', '-month']
        unique_together = [('tenant_id', 'year', 'month')]

    def __str__(self):
        return f"{self.tenant_id} - {self.year}/{self.month:02d}: {self.billable_users} users"

    @classmethod
    def generate_for_month(cls, organization, year: int, month: int):
        """
        Generate monthly user count for an organization.

        Called at the end of each billing period by a scheduled task.
        """
        from datetime import datetime
        from dateutil.relativedelta import relativedelta

        # Get license
        license_obj = License.objects.filter(
            tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
            status=License.Status.ACTIVE
        ).first()

        if not license_obj:
            return None

        # Calculate period
        period_start = timezone.make_aware(datetime(year, month, 1))
        period_end = period_start + relativedelta(months=1)

        # Count users active during period
        active_users = LicensedUser.objects.filter(
            tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
            last_active_at__gte=period_start,
            last_active_at__lt=period_end
        )

        total_users = active_users.count()
        billable_users = active_users.filter(is_billable=True).count()

        # Count new users (first seen in this period)
        new_users = active_users.filter(
            first_seen_at__gte=period_start,
            first_seen_at__lt=period_end
        ).count()

        # Count churned (were active last month, not this month)
        prev_period_start = period_start - relativedelta(months=1)
        prev_active = LicensedUser.objects.filter(
            tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
            last_active_at__gte=prev_period_start,
            last_active_at__lt=period_start
        ).values_list('user_identifier', flat=True)

        current_active = active_users.values_list('user_identifier', flat=True)
        churned_users = len(set(prev_active) - set(current_active))

        # Calculate billing amount
        included = license_obj.included_users
        extra_users = max(0, billable_users - included)
        calculated_amount = extra_users * license_obj.price_per_user

        # Create or update record
        record, _ = cls.objects.update_or_create(
            tenant_id=organization,  # TODO: decouple - callers should pass tenant_id
            year=year,
            month=month,
            defaults={
                'license': license_obj,
                'period_start': period_start,
                'period_end': period_end,
                'total_users': total_users,
                'billable_users': billable_users,
                'new_users': new_users,
                'churned_users': churned_users,
                'calculated_amount': calculated_amount,
            }
        )

        return record


class LicensedTool(models.Model):
    """
    Tracks licensed tools for per-tool billing (future).

    Allows charging differently for different tool types:
    - JupyterHub: $X per user
    - MLflow: $Y per user
    - AI Gateway: $Z per 1000 requests
    """

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        INACTIVE = 'inactive', 'Inactive'
        TRIAL = 'trial', 'Trial'

    class BillingType(models.TextChoices):
        PER_USER = 'per_user', 'Per User'
        PER_DEPLOYMENT = 'per_deployment', 'Per Deployment'
        USAGE_BASED = 'usage_based', 'Usage-based'
        INCLUDED = 'included', 'Included in Base'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    license = models.ForeignKey(
        'zentinelle.License',
        on_delete=models.CASCADE,
        related_name='licensed_tools'
    )

    # Tool identification
    tool_type = models.CharField(
        max_length=50,
        db_index=True,
        help_text='Tool type (jupyterhub, mlflow, airflow, ai_gateway, etc.)'
    )
    tool_name = models.CharField(
        max_length=100,
        blank=True,
        help_text='Display name for the tool'
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE
    )

    # Billing
    billing_type = models.CharField(
        max_length=20,
        choices=BillingType.choices,
        default=BillingType.INCLUDED
    )
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text='Price based on billing type'
    )
    included_quantity = models.IntegerField(
        default=0,
        help_text='Quantity included before additional charges'
    )

    # Limits
    max_instances = models.IntegerField(
        default=-1,
        help_text='Maximum instances of this tool (-1 = unlimited)'
    )

    # Validity
    enabled_at = models.DateTimeField(auto_now_add=True)
    disabled_at = models.DateTimeField(null=True, blank=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['tool_type']
        unique_together = [('license', 'tool_type')]

    def __str__(self):
        return f"{self.tool_name or self.tool_type} ({self.status})"

    @classmethod
    def get_for_license(cls, license_obj, tool_type: str):
        """Get licensed tool configuration."""
        try:
            return cls.objects.get(license=license_obj, tool_type=tool_type)
        except cls.DoesNotExist:
            return None

    @classmethod
    def is_tool_enabled(cls, license_obj, tool_type: str) -> bool:
        """Check if a tool is enabled for the license."""
        tool = cls.get_for_license(license_obj, tool_type)
        if tool:
            return tool.status == cls.Status.ACTIVE
        # Check if it's in the license features
        return tool_type in license_obj.features


# =============================================================================
# License Compliance Reporting
# =============================================================================


class LicenseComplianceReport(models.Model):
    """
    Compliance report for license usage tracking and auditing.

    Generated periodically or on-demand for enterprise customers.
    Tracks license usage, violations, and provides audit trails.
    """

    class ReportType(models.TextChoices):
        USAGE = 'usage', 'License Usage Summary'
        VIOLATIONS = 'violations', 'Compliance Violations'
        AUDIT_TRAIL = 'audit_trail', 'Audit Trail'
        FULL_COMPLIANCE = 'full_compliance', 'Full Compliance Report'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        GENERATING = 'generating', 'Generating'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Report metadata
    report_type = models.CharField(
        max_length=20,
        choices=ReportType.choices,
        db_index=True
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )

    # Report period
    period_start = models.DateTimeField(
        help_text='Start of reporting period'
    )
    period_end = models.DateTimeField(
        help_text='End of reporting period'
    )

    # Generation info
    generated_at = models.DateTimeField(null=True, blank=True)
    # TODO: decouple - generated_by FK removed (use user_id instead)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Report content
    report_data = models.JSONField(
        default=dict,
        blank=True,
        help_text='Report data in JSON format'
    )

    # Summary metrics (for quick access without parsing JSON)
    total_users = models.IntegerField(default=0)
    total_violations = models.IntegerField(default=0)
    compliance_score = models.FloatField(
        null=True,
        blank=True,
        help_text='Overall compliance score 0-100'
    )

    # PDF export
    pdf_url = models.URLField(
        blank=True,
        help_text='URL to generated PDF report'
    )
    pdf_generated_at = models.DateTimeField(null=True, blank=True)

    # Error tracking
    error_message = models.TextField(blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'report_type', '-created_at']),
            models.Index(fields=['tenant_id', 'status', '-created_at']),
            models.Index(fields=['period_start', 'period_end']),
        ]

    def __str__(self):
        return f"{self.tenant_id} - {self.get_report_type_display()} ({self.period_start.date()} to {self.period_end.date()})"


class LicenseComplianceViolation(models.Model):
    """
    Tracks license compliance violations.

    Violations can be:
    - Over seat limit: More users than licensed
    - Expired license: Using features after license expiration
    - Unauthorized feature: Using features not in license
    - Rate limit exceeded: Exceeding API/usage limits
    """

    class ViolationType(models.TextChoices):
        OVER_SEAT_LIMIT = 'over_seat_limit', 'Over Seat Limit'
        EXPIRED_LICENSE = 'expired_license', 'Expired License'
        UNAUTHORIZED_FEATURE = 'unauthorized_feature', 'Unauthorized Feature'
        RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded', 'Rate Limit Exceeded'
        DEPLOYMENT_LIMIT = 'deployment_limit', 'Deployment Limit Exceeded'
        AGENT_LIMIT = 'agent_limit', 'Agent Limit Exceeded'

    class Severity(models.TextChoices):
        INFO = 'info', 'Informational'
        WARNING = 'warning', 'Warning'
        CRITICAL = 'critical', 'Critical'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged'
        RESOLVED = 'resolved', 'Resolved'
        WAIVED = 'waived', 'Waived'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    license = models.ForeignKey(
        'zentinelle.License',
        on_delete=models.CASCADE,
        related_name='compliance_violations'
    )

    # Violation details
    violation_type = models.CharField(
        max_length=30,
        choices=ViolationType.choices,
        db_index=True
    )
    severity = models.CharField(
        max_length=20,
        choices=Severity.choices,
        default=Severity.WARNING
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True
    )

    # Violation context
    details = models.JSONField(
        default=dict,
        blank=True,
        help_text='Detailed violation information'
    )
    description = models.TextField(
        blank=True,
        help_text='Human-readable description of the violation'
    )

    # Limit information
    limit_value = models.IntegerField(
        null=True,
        blank=True,
        help_text='The configured limit'
    )
    actual_value = models.IntegerField(
        null=True,
        blank=True,
        help_text='The actual value that exceeded the limit'
    )

    # Timing
    detected_at = models.DateTimeField(db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    # Resolution
    # TODO: decouple - resolved_by FK removed (use user_id instead)
    resolution_notes = models.TextField(blank=True)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-detected_at']
        indexes = [
            models.Index(fields=['tenant_id', 'status', '-detected_at']),
            models.Index(fields=['license', 'violation_type', '-detected_at']),
            models.Index(fields=['severity', 'status', '-detected_at']),
        ]

    def __str__(self):
        return f"{self.tenant_id} - {self.get_violation_type_display()} [{self.get_severity_display()}]"

    @property
    def is_open(self) -> bool:
        return self.status == self.Status.OPEN

    @property
    def is_resolved(self) -> bool:
        return self.status in (self.Status.RESOLVED, self.Status.WAIVED)
