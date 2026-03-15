"""
Risk and Incident Management Models for Zentinelle.

Provides AI-specific risk register and incident tracking capabilities.
"""
import uuid
from django.db import models
from django.conf import settings


class Risk(models.Model):
    """
    AI-specific risk tracking for the risk register.

    Tracks potential risks associated with AI systems including
    prompt injection, PII leakage, hallucination, etc.
    """

    class RiskCategory(models.TextChoices):
        SECURITY = 'security', 'Security'
        PRIVACY = 'privacy', 'Privacy'
        COMPLIANCE = 'compliance', 'Compliance'
        OPERATIONAL = 'operational', 'Operational'
        REPUTATIONAL = 'reputational', 'Reputational'
        FINANCIAL = 'financial', 'Financial'
        ETHICAL = 'ethical', 'Ethical'

    class RiskStatus(models.TextChoices):
        IDENTIFIED = 'identified', 'Identified'
        ASSESSED = 'assessed', 'Assessed'
        MITIGATING = 'mitigating', 'Mitigating'
        ACCEPTED = 'accepted', 'Accepted'
        TRANSFERRED = 'transferred', 'Transferred'
        CLOSED = 'closed', 'Closed'

    class Likelihood(models.IntegerChoices):
        RARE = 1, 'Rare'
        UNLIKELY = 2, 'Unlikely'
        POSSIBLE = 3, 'Possible'
        LIKELY = 4, 'Likely'
        ALMOST_CERTAIN = 5, 'Almost Certain'

    class Impact(models.IntegerChoices):
        NEGLIGIBLE = 1, 'Negligible'
        MINOR = 2, 'Minor'
        MODERATE = 3, 'Moderate'
        MAJOR = 4, 'Major'
        SEVERE = 5, 'Severe'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Risk identification
    name = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(
        max_length=20,
        choices=RiskCategory.choices,
        default=RiskCategory.SECURITY,
    )
    status = models.CharField(
        max_length=20,
        choices=RiskStatus.choices,
        default=RiskStatus.IDENTIFIED,
    )

    # Risk assessment (5x5 matrix)
    likelihood = models.IntegerField(
        choices=Likelihood.choices,
        default=Likelihood.POSSIBLE,
    )
    impact = models.IntegerField(
        choices=Impact.choices,
        default=Impact.MODERATE,
    )

    # Computed risk score (likelihood * impact)
    @property
    def risk_score(self) -> int:
        return self.likelihood * self.impact

    @property
    def risk_level(self) -> str:
        score = self.risk_score
        if score >= 15:
            return 'critical'
        elif score >= 10:
            return 'high'
        elif score >= 5:
            return 'medium'
        return 'low'

    # Ownership
    # TODO: decouple - owner FK removed (use user_id/ext_user_id instead)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Mitigation
    mitigation_plan = models.TextField(blank=True, default='')
    mitigation_status = models.CharField(max_length=255, blank=True, default='')
    residual_likelihood = models.IntegerField(
        choices=Likelihood.choices,
        null=True,
        blank=True,
    )
    residual_impact = models.IntegerField(
        choices=Impact.choices,
        null=True,
        blank=True,
    )

    @property
    def residual_risk_score(self) -> int:
        if self.residual_likelihood and self.residual_impact:
            return self.residual_likelihood * self.residual_impact
        return self.risk_score

    # Related entities
    affected_endpoints = models.ManyToManyField(
        'zentinelle.AgentEndpoint',
        blank=True,
        related_name='associated_risks',
    )
    # TODO: decouple - affected_deployments M2M removed
    related_policies = models.ManyToManyField(
        'zentinelle.Policy',
        blank=True,
        related_name='mitigating_risks',
    )

    # Review tracking
    last_reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewer_id = models.CharField(max_length=255, blank=True, default="")
    next_review_date = models.DateField(null=True, blank=True)

    # Additional metadata
    tags = models.JSONField(default=list, blank=True)
    external_references = models.JSONField(default=list, blank=True)

    # Timestamps
    identified_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Order by likelihood * impact effect: higher values first
        ordering = ['-likelihood', '-impact', '-created_at']
        verbose_name = 'Risk'
        verbose_name_plural = 'Risks'

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"


class Incident(models.Model):
    """
    Incident management for policy violations and security events.

    Tracks incidents from detection through resolution with SLA monitoring.
    """

    class Severity(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        CRITICAL = 'critical', 'Critical'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        INVESTIGATING = 'investigating', 'Investigating'
        MITIGATING = 'mitigating', 'Mitigating'
        RESOLVED = 'resolved', 'Resolved'
        CLOSED = 'closed', 'Closed'

    class IncidentType(models.TextChoices):
        POLICY_VIOLATION = 'policy_violation', 'Policy Violation'
        SECURITY_BREACH = 'security_breach', 'Security Breach'
        DATA_LEAK = 'data_leak', 'Data Leak'
        SERVICE_DISRUPTION = 'service_disruption', 'Service Disruption'
        COMPLIANCE_BREACH = 'compliance_breach', 'Compliance Breach'
        COST_OVERRUN = 'cost_overrun', 'Cost Overrun'
        HARMFUL_OUTPUT = 'harmful_output', 'Harmful Output'
        OTHER = 'other', 'Other'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Incident identification
    title = models.CharField(max_length=255)
    description = models.TextField()
    incident_type = models.CharField(
        max_length=30,
        choices=IncidentType.choices,
        default=IncidentType.POLICY_VIOLATION,
    )
    severity = models.CharField(
        max_length=10,
        choices=Severity.choices,
        default=Severity.MEDIUM,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
    )

    # Assignment
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="",
                               help_text="Assigned to (user_id)")
    reporter_id = models.CharField(max_length=255, blank=True, default="",
                                   help_text="Reported by (user_id)")

    # Related entities
    endpoint = models.ForeignKey(
        'zentinelle.AgentEndpoint',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incidents',
    )
    # TODO: decouple - deployment FK removed
    deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )
    related_risk = models.ForeignKey(
        'Risk',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incidents',
    )
    triggering_policy = models.ForeignKey(
        'zentinelle.Policy',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='triggered_incidents',
    )
    triggering_alert = models.ForeignKey(
        'zentinelle.ComplianceAlert',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incidents',
    )

    # User context
    affected_user = models.CharField(max_length=255, blank=True, default='')
    affected_user_count = models.IntegerField(default=1)

    # Investigation
    root_cause = models.TextField(blank=True, default='')
    impact_assessment = models.TextField(blank=True, default='')

    # Resolution
    resolution = models.TextField(blank=True, default='')
    remediation_actions = models.JSONField(default=list, blank=True)
    lessons_learned = models.TextField(blank=True, default='')

    # Timeline
    occurred_at = models.DateTimeField()
    detected_at = models.DateTimeField(auto_now_add=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    # SLA tracking
    @property
    def time_to_acknowledge(self):
        """Time between detection and acknowledgement."""
        if self.acknowledged_at:
            return self.acknowledged_at - self.detected_at
        return None

    @property
    def time_to_resolve(self):
        """Time between detection and resolution."""
        if self.resolved_at:
            return self.resolved_at - self.detected_at
        return None

    @property
    def sla_status(self) -> str:
        """Check SLA compliance based on severity."""
        from django.utils import timezone
        from datetime import timedelta

        sla_targets = {
            'critical': timedelta(hours=1),
            'high': timedelta(hours=4),
            'medium': timedelta(hours=24),
            'low': timedelta(hours=72),
        }

        target = sla_targets.get(self.severity, timedelta(hours=24))

        if self.resolved_at:
            if self.time_to_resolve <= target:
                return 'met'
            return 'breached'

        elapsed = timezone.now() - self.detected_at
        if elapsed <= target:
            return 'on_track'
        return 'at_risk'

    # Metadata
    tags = models.JSONField(default=list, blank=True)
    evidence = models.JSONField(default=list, blank=True)
    timeline_events = models.JSONField(default=list, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-severity', '-detected_at']
        verbose_name = 'Incident'
        verbose_name_plural = 'Incidents'

    def __str__(self):
        return f"[{self.get_severity_display()}] {self.title}"

    def add_timeline_event(self, event_type: str, description: str, user=None):
        """Add an event to the incident timeline."""
        from django.utils import timezone

        event = {
            'timestamp': timezone.now().isoformat(),
            'type': event_type,
            'description': description,
            'user': user.username if user else None,
        }
        self.timeline_events.append(event)
        self.save(update_fields=['timeline_events', 'updated_at'])
