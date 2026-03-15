"""
Compliance & Input Monitoring models.

Provides configurable content scanning, policy enforcement, and audit logging
for AI interactions across the organization.

Architecture:
    Capability-Based Compliance - Focus on what we can observe/control
    ContentRule - Defines what to detect (secrets, PII, custom patterns, etc.)
    ContentScan - Records scan results for each interaction
    ComplianceAlert - Escalated violations requiring attention
    InteractionLog - Full interaction logs (configurable retention)
"""
import uuid
from decimal import Decimal

from django.db import models
from django.conf import settings
from django.utils import timezone
from zentinelle.models.base import Tracking


# ============================================================================
# Compliance Capabilities - What Zentinelle Can Actually Do
# ============================================================================

# These are the measurable capabilities - what we can observe and control.
# This is reference data, not database models - it defines what the product does.

COMPLIANCE_CAPABILITIES = {
    # ---------------------------------------------------------------------------
    # OBSERVABILITY - What we can detect/measure
    # ---------------------------------------------------------------------------
    'observe': {
        'pii_detection': {
            'name': 'PII Detection',
            'description': 'Detect personally identifiable information in prompts and responses',
            'policy_types': ['pii_filter'],
            'rule_types': ['pii_detection'],
            'supports': ['HIPAA', 'GDPR', 'CCPA', 'SOC2'],
        },
        'phi_detection': {
            'name': 'PHI Detection',
            'description': 'Detect protected health information',
            'policy_types': [],
            'rule_types': ['phi_detection'],
            'supports': ['HIPAA'],
        },
        'secret_detection': {
            'name': 'Secret/Credential Detection',
            'description': 'Detect API keys, passwords, tokens, and other credentials',
            'policy_types': [],
            'rule_types': ['secret_detection'],
            'supports': ['SOC2', 'ISO27001', 'PCI-DSS'],
        },
        'prompt_injection': {
            'name': 'Prompt Injection Detection',
            'description': 'Detect attempts to manipulate AI behavior via prompt injection',
            'policy_types': ['prompt_injection'],
            'rule_types': ['prompt_injection'],
            'supports': ['EU_AI_ACT', 'NIST_AI_RMF'],
        },
        'jailbreak_detection': {
            'name': 'Jailbreak Attempt Detection',
            'description': 'Detect attempts to bypass AI safety guardrails',
            'policy_types': [],
            'rule_types': ['jailbreak_attempt'],
            'supports': ['EU_AI_ACT', 'NIST_AI_RMF'],
        },
        'audit_logging': {
            'name': 'Audit Logging',
            'description': 'Complete audit trail of all AI interactions',
            'policy_types': ['audit_log'],
            'rule_types': [],
            'supports': ['SOC2', 'HIPAA', 'GDPR', 'ISO27001', 'EU_AI_ACT'],
        },
        'cost_tracking': {
            'name': 'Cost & Token Tracking',
            'description': 'Track token usage and estimated costs per interaction',
            'policy_types': ['cost_limit'],
            'rule_types': ['cost_threshold', 'token_limit'],
            'supports': ['SOC2'],
        },
        'usage_analytics': {
            'name': 'Usage Analytics',
            'description': 'Aggregated usage metrics by user, model, deployment',
            'policy_types': [],
            'rule_types': ['rate_anomaly'],
            'supports': ['SOC2', 'EU_AI_ACT'],
        },
        'model_tracking': {
            'name': 'Model Identification',
            'description': 'Track which AI models are being used',
            'policy_types': ['model_restriction'],
            'rule_types': [],
            'supports': ['EU_AI_ACT', 'NIST_AI_RMF', 'ISO42001'],
        },
    },

    # ---------------------------------------------------------------------------
    # CONTROLLABILITY - What we can enforce
    # ---------------------------------------------------------------------------
    'control': {
        'content_filtering': {
            'name': 'Content Filtering',
            'description': 'Block or redact sensitive content in real-time',
            'policy_types': ['content_filter', 'output_filter'],
            'rule_types': [],
            'enforcement': ['block', 'redact', 'warn'],
            'supports': ['HIPAA', 'GDPR', 'SOC2'],
        },
        'rate_limiting': {
            'name': 'Rate Limiting',
            'description': 'Enforce request rate limits per user/deployment',
            'policy_types': ['rate_limit'],
            'rule_types': [],
            'enforcement': ['block', 'throttle'],
            'supports': ['SOC2'],
        },
        'model_restriction': {
            'name': 'Model Restriction',
            'description': 'Restrict which AI models can be used',
            'policy_types': ['model_restriction'],
            'rule_types': [],
            'enforcement': ['block'],
            'supports': ['EU_AI_ACT', 'NIST_AI_RMF', 'ISO42001'],
        },
        'context_limits': {
            'name': 'Context Window Limits',
            'description': 'Limit context window size to control data exposure',
            'policy_types': ['context_limit'],
            'rule_types': ['token_limit'],
            'enforcement': ['truncate', 'block'],
            'supports': ['GDPR', 'HIPAA'],
        },
        'human_oversight': {
            'name': 'Human-in-the-Loop',
            'description': 'Require human approval for certain actions',
            'policy_types': ['human_oversight', 'approval_required'],
            'rule_types': [],
            'enforcement': ['require_approval'],
            'supports': ['EU_AI_ACT', 'NIST_AI_RMF'],
        },
        'agent_capabilities': {
            'name': 'Agent Capability Control',
            'description': 'Restrict what tools/actions agents can perform',
            'policy_types': ['agent_capability', 'tool_restriction'],
            'rule_types': [],
            'enforcement': ['block', 'require_approval'],
            'supports': ['EU_AI_ACT', 'NIST_AI_RMF'],
        },
        'agent_memory': {
            'name': 'Agent Memory Control',
            'description': 'Control agent memory/persistence scope',
            'policy_types': ['agent_memory', 'data_retention'],
            'rule_types': [],
            'enforcement': ['limit', 'clear'],
            'supports': ['GDPR', 'CCPA'],
        },
        'data_retention': {
            'name': 'Data Retention',
            'description': 'Automatic data expiration and deletion',
            'policy_types': ['data_retention'],
            'rule_types': [],
            'enforcement': ['expire', 'delete'],
            'supports': ['GDPR', 'CCPA', 'HIPAA'],
        },
    },
}


# Framework reference - what frameworks care about what capabilities
FRAMEWORK_REQUIREMENTS = {
    'HIPAA': {
        'name': 'HIPAA',
        'description': 'Health Insurance Portability and Accountability Act',
        'required_capabilities': [
            'phi_detection', 'pii_detection', 'audit_logging',
            'content_filtering', 'data_retention', 'context_limits',
        ],
        'recommended_capabilities': [
            'secret_detection', 'rate_limiting',
        ],
    },
    'GDPR': {
        'name': 'GDPR',
        'description': 'General Data Protection Regulation',
        'required_capabilities': [
            'pii_detection', 'audit_logging', 'data_retention',
            'content_filtering', 'agent_memory',
        ],
        'recommended_capabilities': [
            'context_limits', 'human_oversight',
        ],
    },
    'SOC2': {
        'name': 'SOC 2 Type II',
        'description': 'Service Organization Control 2',
        'required_capabilities': [
            'audit_logging', 'secret_detection', 'rate_limiting',
        ],
        'recommended_capabilities': [
            'pii_detection', 'cost_tracking', 'usage_analytics', 'content_filtering',
        ],
    },
    'EU_AI_ACT': {
        'name': 'EU AI Act',
        'description': 'European Union Artificial Intelligence Act',
        'required_capabilities': [
            'audit_logging', 'model_tracking', 'human_oversight',
            'agent_capabilities', 'prompt_injection', 'jailbreak_detection',
        ],
        'recommended_capabilities': [
            'usage_analytics', 'model_restriction',
        ],
    },
    'NIST_AI_RMF': {
        'name': 'NIST AI RMF',
        'description': 'NIST AI Risk Management Framework',
        'required_capabilities': [
            'model_tracking', 'human_oversight', 'agent_capabilities',
            'prompt_injection', 'jailbreak_detection',
        ],
        'recommended_capabilities': [
            'audit_logging', 'usage_analytics', 'model_restriction',
        ],
    },
    'CCPA': {
        'name': 'CCPA',
        'description': 'California Consumer Privacy Act',
        'required_capabilities': [
            'pii_detection', 'data_retention', 'agent_memory',
        ],
        'recommended_capabilities': [
            'audit_logging', 'content_filtering',
        ],
    },
    'ISO27001': {
        'name': 'ISO 27001',
        'description': 'Information Security Management',
        'required_capabilities': [
            'audit_logging', 'secret_detection',
        ],
        'recommended_capabilities': [
            'rate_limiting', 'pii_detection',
        ],
    },
    'ISO42001': {
        'name': 'ISO 42001',
        'description': 'AI Management System',
        'required_capabilities': [
            'model_tracking', 'model_restriction',
        ],
        'recommended_capabilities': [
            'audit_logging', 'human_oversight', 'agent_capabilities',
        ],
    },
    'PCI-DSS': {
        'name': 'PCI DSS',
        'description': 'Payment Card Industry Data Security Standard',
        'required_capabilities': [
            'secret_detection', 'audit_logging',
        ],
        'recommended_capabilities': [
            'pii_detection', 'content_filtering',
        ],
    },
}


def get_capability_status(organization):
    """
    Get the status of each capability for an organization.

    Returns dict of capability_id -> {enabled: bool, policies: [...], rules: [...]}

    This is the core function for the compliance dashboard - it checks what's
    actually configured and returns coverage status.
    """
    from zentinelle.models.policy import Policy
    from zentinelle.models.compliance import ContentRule

    # Get org's enabled policies and rules
    policies = Policy.objects.filter(
        organization=organization,
        enabled=True
    ).values_list('policy_type', flat=True)
    policy_types = set(policies)

    rules = ContentRule.objects.filter(
        organization=organization,
        enabled=True
    ).values_list('rule_type', flat=True)
    rule_types = set(rules)

    status = {}

    # Check observability capabilities
    for cap_id, cap in COMPLIANCE_CAPABILITIES['observe'].items():
        has_policy = bool(set(cap['policy_types']) & policy_types)
        has_rule = bool(set(cap['rule_types']) & rule_types)
        status[cap_id] = {
            'enabled': has_policy or has_rule,
            'type': 'observe',
            'name': cap['name'],
            'description': cap['description'],
            'supporting_policies': list(set(cap['policy_types']) & policy_types),
            'supporting_rules': list(set(cap['rule_types']) & rule_types),
            'supports_frameworks': cap['supports'],
        }

    # Check controllability capabilities
    for cap_id, cap in COMPLIANCE_CAPABILITIES['control'].items():
        has_policy = bool(set(cap['policy_types']) & policy_types)
        has_rule = bool(set(cap.get('rule_types', [])) & rule_types)
        status[cap_id] = {
            'enabled': has_policy or has_rule,
            'type': 'control',
            'name': cap['name'],
            'description': cap['description'],
            'supporting_policies': list(set(cap['policy_types']) & policy_types),
            'supporting_rules': list(set(cap.get('rule_types', [])) & rule_types),
            'enforcement_options': cap.get('enforcement', []),
            'supports_frameworks': cap['supports'],
        }

    return status


def get_framework_coverage(organization):
    """
    Get compliance framework coverage for an organization.

    Returns dict of framework_id -> {
        covered: int,
        total: int,
        percentage: float,
        missing_required: [...],
        missing_recommended: [...],
    }
    """
    capability_status = get_capability_status(organization)
    enabled_caps = {k for k, v in capability_status.items() if v['enabled']}

    coverage = {}
    for fw_id, fw in FRAMEWORK_REQUIREMENTS.items():
        required = set(fw['required_capabilities'])
        recommended = set(fw.get('recommended_capabilities', []))

        covered_required = required & enabled_caps
        covered_recommended = recommended & enabled_caps

        total_required = len(required)
        total_all = total_required + len(recommended)
        covered_all = len(covered_required) + len(covered_recommended)

        coverage[fw_id] = {
            'name': fw['name'],
            'description': fw['description'],
            # Required coverage
            'required_covered': len(covered_required),
            'required_total': total_required,
            'required_percentage': (len(covered_required) / total_required * 100)
                if total_required > 0 else 100,
            'missing_required': list(required - enabled_caps),
            # Total coverage
            'total_covered': covered_all,
            'total_count': total_all,
            'total_percentage': (covered_all / total_all * 100) if total_all > 0 else 100,
            'missing_recommended': list(recommended - enabled_caps),
        }

    return coverage


# ============================================================================
# Content Rules & Scanning
# ============================================================================


class ContentRule(Tracking):
    """
    Configurable content detection rule.

    Rules can detect:
    - Secrets (API keys, passwords, tokens)
    - PII (names, SSNs, credit cards, emails, phone numbers)
    - PHI (health information, medical records)
    - Custom patterns (proprietary code, internal URLs, project names)
    - Behavioral patterns (prompt injection, jailbreaks, off-topic usage)

    Rules can be scoped to:
    - Organization (default for all)
    - Sub-organization (team-specific)
    - Deployment (specific AI tool)
    - User (individual overrides)
    """

    class RuleType(models.TextChoices):
        # Content patterns
        SECRET_DETECTION = 'secret_detection', 'Secret/Credential Detection'
        PII_DETECTION = 'pii_detection', 'PII Detection'
        PHI_DETECTION = 'phi_detection', 'PHI Detection'
        PROFANITY_FILTER = 'profanity_filter', 'Profanity Filter'
        CUSTOM_PATTERN = 'custom_pattern', 'Custom Pattern (Regex)'
        KEYWORD_BLOCK = 'keyword_block', 'Keyword Blocklist'

        # Behavioral patterns
        PROMPT_INJECTION = 'prompt_injection', 'Prompt Injection Detection'
        JAILBREAK_ATTEMPT = 'jailbreak_attempt', 'Jailbreak Attempt Detection'
        OFF_TOPIC = 'off_topic', 'Off-Topic/Personal Use Detection'
        POLICY_VIOLATION = 'policy_violation', 'Policy Violation'

        # Usage patterns
        COST_THRESHOLD = 'cost_threshold', 'Cost Threshold Alert'
        RATE_ANOMALY = 'rate_anomaly', 'Usage Rate Anomaly'
        TOKEN_LIMIT = 'token_limit', 'Token Limit Exceeded'

    class Severity(models.TextChoices):
        INFO = 'info', 'Info'
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        CRITICAL = 'critical', 'Critical'

    class Enforcement(models.TextChoices):
        BLOCK = 'block', 'Block (Prevent action)'
        WARN = 'warn', 'Warn (Allow but notify user)'
        LOG_ONLY = 'log_only', 'Log Only (Silent)'
        REDACT = 'redact', 'Redact (Remove sensitive content)'
        REQUIRE_APPROVAL = 'require_approval', 'Require Approval'

    class ScanMode(models.TextChoices):
        REALTIME = 'realtime', 'Real-time (Inline)'
        ASYNC = 'async', 'Async (Background)'
        BOTH = 'both', 'Both (Real-time + Async analysis)'

    class ScopeType(models.TextChoices):
        ORGANIZATION = 'organization', 'Organization-wide'
        SUB_ORGANIZATION = 'sub_organization', 'Team/Division'
        DEPLOYMENT = 'deployment', 'Specific Deployment'
        ENDPOINT = 'endpoint', 'Specific Endpoint'
        USER = 'user', 'Specific User'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Scope
    scope_type = models.CharField(
        max_length=20,
        choices=ScopeType.choices,
        default=ScopeType.ORGANIZATION
    )
    # TODO: decouple - scope_sub_organization FK removed
    # TODO: decouple - scope_deployment FK removed
    scope_deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )
    scope_endpoint = models.ForeignKey(
        'zentinelle.AgentEndpoint',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='content_rules'
    )
    # TODO: decouple - scope_user FK removed (use user_id instead)
    scope_user_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External user ID for user-scoped rules'
    )

    # Rule definition
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    rule_type = models.CharField(max_length=30, choices=RuleType.choices)

    # Rule configuration (schema depends on rule_type)
    config = models.JSONField(
        default=dict,
        help_text='Rule-specific configuration (patterns, thresholds, etc.)'
    )

    # Behavior
    severity = models.CharField(
        max_length=20,
        choices=Severity.choices,
        default=Severity.MEDIUM
    )
    enforcement = models.CharField(
        max_length=20,
        choices=Enforcement.choices,
        default=Enforcement.LOG_ONLY
    )
    scan_mode = models.CharField(
        max_length=20,
        choices=ScanMode.choices,
        default=ScanMode.REALTIME
    )

    # What to scan
    scan_input = models.BooleanField(default=True, help_text='Scan user input/prompts')
    scan_output = models.BooleanField(default=False, help_text='Scan AI responses')
    scan_context = models.BooleanField(default=False, help_text='Scan conversation context')

    # Priority (higher = evaluated first)
    priority = models.IntegerField(default=0)
    enabled = models.BooleanField(default=True)

    # Notifications
    notify_user = models.BooleanField(default=False, help_text='Notify user on violation')
    notify_admins = models.BooleanField(default=True, help_text='Notify admins on violation')
    webhook_url = models.URLField(blank=True, help_text='Webhook for violations')

    # Created by
    # TODO: decouple - created_by FK removed (use user_id/ext_user_id instead)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    class Meta:
        verbose_name = 'Content Rule'
        verbose_name_plural = 'Content Rules'
        ordering = ['tenant_id', '-priority', 'name']
        indexes = [
            models.Index(fields=['tenant_id', 'rule_type', 'enabled']),
            models.Index(fields=['scope_type', 'enabled']),
            models.Index(fields=['enforcement', 'enabled']),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_rule_type_display()})"


class ContentScan(Tracking):
    """
    Records the result of scanning content against rules.

    Created for each interaction that is scanned, whether violations
    are found or not (based on org retention settings).
    """

    class ScanStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SCANNING = 'scanning', 'Scanning'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'

    class ContentType(models.TextChoices):
        USER_INPUT = 'user_input', 'User Input/Prompt'
        AI_OUTPUT = 'ai_output', 'AI Response'
        CONTEXT = 'context', 'Conversation Context'
        FILE_UPLOAD = 'file_upload', 'File Upload'
        TOOL_CALL = 'tool_call', 'Tool/Function Call'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Context
    endpoint = models.ForeignKey(
        'zentinelle.AgentEndpoint',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='content_scans'
    )
    # TODO: decouple - deployment FK removed
    deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )
    user_identifier = models.CharField(
        max_length=255,
        db_index=True,
        help_text='Username or user ID'
    )

    # What was scanned
    content_type = models.CharField(max_length=20, choices=ContentType.choices)
    content_hash = models.CharField(
        max_length=64,
        db_index=True,
        help_text='SHA-256 hash of content for deduplication'
    )
    content_length = models.IntegerField(help_text='Character count')
    content_preview = models.TextField(
        blank=True,
        help_text='First N characters (configurable)'
    )

    # Full content (optional, based on retention settings)
    content_stored = models.BooleanField(default=False)
    content_encrypted = models.BinaryField(
        null=True,
        blank=True,
        help_text='Encrypted full content (if retention enabled)'
    )

    # Scan results
    status = models.CharField(
        max_length=20,
        choices=ScanStatus.choices,
        default=ScanStatus.PENDING
    )
    scan_mode = models.CharField(
        max_length=20,
        choices=ContentRule.ScanMode.choices,
        default=ContentRule.ScanMode.REALTIME
    )
    scanned_at = models.DateTimeField(null=True, blank=True)
    scan_duration_ms = models.IntegerField(null=True, blank=True)

    # Violations found
    has_violations = models.BooleanField(default=False, db_index=True)
    violation_count = models.IntegerField(default=0)
    max_severity = models.CharField(
        max_length=20,
        choices=ContentRule.Severity.choices,
        null=True,
        blank=True
    )

    # Action taken
    action_taken = models.CharField(
        max_length=20,
        choices=ContentRule.Enforcement.choices,
        null=True,
        blank=True
    )
    was_blocked = models.BooleanField(default=False)
    was_redacted = models.BooleanField(default=False)
    redacted_content = models.TextField(
        blank=True,
        help_text='Content after redaction (if applicable)'
    )

    # Token/cost tracking
    token_count = models.IntegerField(null=True, blank=True)
    estimated_cost_usd = models.DecimalField(
        max_digits=10,
        decimal_places=6,
        null=True,
        blank=True
    )

    # Request metadata
    session_id = models.CharField(max_length=255, blank=True, db_index=True)
    request_id = models.CharField(max_length=255, blank=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Content Scan'
        verbose_name_plural = 'Content Scans'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'has_violations', '-created_at']),
            models.Index(fields=['user_identifier', '-created_at']),
            models.Index(fields=['endpoint', '-created_at']),
            models.Index(fields=['tenant_id', 'content_type', '-created_at']),
        ]

    def __str__(self):
        status = "VIOLATION" if self.has_violations else "OK"
        return f"Scan {self.id} [{status}] - {self.user_identifier}"


class ContentViolation(Tracking):
    """
    Individual violation found during a content scan.

    One scan can have multiple violations (e.g., both PII and secrets found).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    scan = models.ForeignKey(
        ContentScan,
        on_delete=models.CASCADE,
        related_name='violations'
    )
    rule = models.ForeignKey(
        ContentRule,
        on_delete=models.SET_NULL,
        null=True,
        related_name='violations'
    )

    # What was detected
    rule_type = models.CharField(max_length=30, choices=ContentRule.RuleType.choices)
    severity = models.CharField(max_length=20, choices=ContentRule.Severity.choices)
    enforcement = models.CharField(max_length=20, choices=ContentRule.Enforcement.choices)

    # Detection details
    matched_pattern = models.CharField(
        max_length=500,
        blank=True,
        help_text='Pattern that matched (for regex rules)'
    )
    matched_text = models.TextField(
        blank=True,
        help_text='Text that matched (redacted if sensitive)'
    )
    match_start = models.IntegerField(null=True, blank=True)
    match_end = models.IntegerField(null=True, blank=True)
    confidence = models.FloatField(
        null=True,
        blank=True,
        help_text='Detection confidence 0.0-1.0 (for ML-based detection)'
    )

    # Additional context
    category = models.CharField(
        max_length=100,
        blank=True,
        help_text='Subcategory (e.g., "aws_key", "credit_card", "ssn")'
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text='Additional detection metadata'
    )

    # Action taken for this violation
    was_blocked = models.BooleanField(default=False)
    was_redacted = models.BooleanField(default=False)
    user_notified = models.BooleanField(default=False)
    admin_notified = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Content Violation'
        verbose_name_plural = 'Content Violations'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['rule_type', '-created_at']),
            models.Index(fields=['severity', '-created_at']),
            models.Index(fields=['category', '-created_at']),
        ]

    def __str__(self):
        return f"Violation: {self.rule_type} [{self.severity}]"


class ComplianceAlert(Tracking):
    """
    Escalated compliance alerts requiring admin attention.

    Created when violations exceed thresholds or for critical issues.
    """

    class AlertType(models.TextChoices):
        SINGLE_VIOLATION = 'single_violation', 'Single Violation'
        REPEATED_VIOLATIONS = 'repeated_violations', 'Repeated Violations'
        THRESHOLD_EXCEEDED = 'threshold_exceeded', 'Threshold Exceeded'
        ANOMALY_DETECTED = 'anomaly_detected', 'Anomaly Detected'
        CRITICAL_VIOLATION = 'critical_violation', 'Critical Violation'
        # Monitoring task alert types
        COMPLIANCE_DRIFT = 'compliance_drift', 'Compliance Drift'
        VIOLATION_SPIKE = 'violation_spike', 'Violation Rate Spike'
        POLICY_HEALTH = 'policy_health', 'Policy Health Issue'
        REPEAT_VIOLATIONS = 'repeat_violations', 'Repeat Violations by User'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged'
        INVESTIGATING = 'investigating', 'Investigating'
        RESOLVED = 'resolved', 'Resolved'
        FALSE_POSITIVE = 'false_positive', 'False Positive'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Alert details
    alert_type = models.CharField(max_length=30, choices=AlertType.choices)
    severity = models.CharField(
        max_length=20,
        choices=ContentRule.Severity.choices
    )
    title = models.CharField(max_length=500)
    description = models.TextField()

    # Context
    user_identifier = models.CharField(max_length=255, blank=True, default='', db_index=True)
    endpoint = models.ForeignKey(
        'zentinelle.AgentEndpoint',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )

    # Additional metadata for monitoring alerts
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text='Additional alert context (framework, capability, policy_type, etc.)'
    )

    # Related violations
    violation_count = models.IntegerField(default=1)
    first_violation_at = models.DateTimeField(null=True, blank=True)
    last_violation_at = models.DateTimeField(null=True, blank=True)

    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.CharField(max_length=255, blank=True, default="",
                                       help_text="user_id who acknowledged")
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="",
                               help_text="user_id who resolved (or last acted)")

    # Linked scans
    scans = models.ManyToManyField(ContentScan, related_name='alerts')

    class Meta:
        verbose_name = 'Compliance Alert'
        verbose_name_plural = 'Compliance Alerts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant_id', 'status', '-created_at']),
            models.Index(fields=['severity', 'status', '-created_at']),
            models.Index(fields=['user_identifier', '-created_at']),
        ]

    def __str__(self):
        return f"Alert: {self.title} [{self.severity}]"


class InteractionLog(Tracking):
    """
    Full interaction log with configurable retention.

    Stores complete prompts and responses for audit purposes.
    Retention is configurable per org via policies.
    """

    class InteractionType(models.TextChoices):
        CHAT = 'chat', 'Chat/Conversation'
        COMPLETION = 'completion', 'Completion'
        EMBEDDING = 'embedding', 'Embedding'
        FUNCTION_CALL = 'function_call', 'Function/Tool Call'
        IMAGE_GEN = 'image_gen', 'Image Generation'
        CODE_GEN = 'code_gen', 'Code Generation'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Context
    endpoint = models.ForeignKey(
        'zentinelle.AgentEndpoint',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='interaction_logs'
    )
    # TODO: decouple - deployment FK removed
    deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )
    user_identifier = models.CharField(max_length=255, db_index=True)

    # Interaction details
    interaction_type = models.CharField(max_length=20, choices=InteractionType.choices)
    session_id = models.CharField(max_length=255, blank=True, db_index=True)
    request_id = models.CharField(max_length=255, blank=True, db_index=True)

    # AI provider info
    ai_provider = models.CharField(max_length=50, blank=True)
    ai_model = models.CharField(max_length=100, blank=True)

    # Content (encrypted for security)
    input_content = models.TextField(blank=True)
    input_token_count = models.IntegerField(null=True, blank=True)

    output_content = models.TextField(blank=True)
    output_token_count = models.IntegerField(null=True, blank=True)

    # System prompt (if captured)
    system_prompt = models.TextField(blank=True)

    # Tool calls
    tool_calls = models.JSONField(
        default=list,
        blank=True,
        help_text='Tool/function calls made during interaction'
    )

    # Performance
    latency_ms = models.IntegerField(null=True, blank=True)

    # Cost
    total_tokens = models.IntegerField(null=True, blank=True)
    estimated_cost_usd = models.DecimalField(
        max_digits=10,
        decimal_places=6,
        null=True,
        blank=True
    )

    # Classification (populated by async analysis)
    classification = models.JSONField(
        default=dict,
        blank=True,
        help_text='Content classification (work/personal, topic, etc.)'
    )
    is_work_related = models.BooleanField(null=True, blank=True)
    topics = models.JSONField(default=list, blank=True)

    # Compliance scan reference
    scan = models.ForeignKey(
        ContentScan,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='interaction_logs'
    )

    # Request metadata
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    # Occurred timestamp (when the interaction happened)
    occurred_at = models.DateTimeField()

    class Meta:
        verbose_name = 'Interaction Log'
        verbose_name_plural = 'Interaction Logs'
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['tenant_id', '-occurred_at']),
            models.Index(fields=['user_identifier', '-occurred_at']),
            models.Index(fields=['endpoint', '-occurred_at']),
            models.Index(fields=['ai_provider', 'ai_model', '-occurred_at']),
            models.Index(fields=['is_work_related', '-occurred_at']),
        ]

    def __str__(self):
        return f"Interaction {self.id} - {self.user_identifier} @ {self.occurred_at}"

    @property
    def total_cost(self) -> Decimal:
        return self.estimated_cost_usd or Decimal('0')


class UsageSummary(Tracking):
    """
    Aggregated usage summary for reporting.

    Pre-computed for dashboard performance.
    """

    class Period(models.TextChoices):
        HOURLY = 'hourly', 'Hourly'
        DAILY = 'daily', 'Daily'
        WEEKLY = 'weekly', 'Weekly'
        MONTHLY = 'monthly', 'Monthly'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Aggregation scope
    period = models.CharField(max_length=20, choices=Period.choices)
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()

    # Optional breakdown dimensions
    user_identifier = models.CharField(max_length=255, blank=True, db_index=True)
    endpoint_id = models.UUIDField(null=True, blank=True)
    deployment_id = models.UUIDField(null=True, blank=True)
    ai_provider = models.CharField(max_length=50, blank=True)
    ai_model = models.CharField(max_length=100, blank=True)

    # Counts
    interaction_count = models.IntegerField(default=0)
    scan_count = models.IntegerField(default=0)
    violation_count = models.IntegerField(default=0)
    blocked_count = models.IntegerField(default=0)

    # Tokens
    input_tokens = models.BigIntegerField(default=0)
    output_tokens = models.BigIntegerField(default=0)
    total_tokens = models.BigIntegerField(default=0)

    # Cost
    estimated_cost_usd = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal('0')
    )

    # Violation breakdown
    violations_by_type = models.JSONField(
        default=dict,
        blank=True,
        help_text='Count by rule_type'
    )
    violations_by_severity = models.JSONField(
        default=dict,
        blank=True,
        help_text='Count by severity'
    )

    # Classification breakdown
    work_related_count = models.IntegerField(default=0)
    personal_count = models.IntegerField(default=0)
    unclassified_count = models.IntegerField(default=0)

    class Meta:
        verbose_name = 'Usage Summary'
        verbose_name_plural = 'Usage Summaries'
        ordering = ['-period_start']
        indexes = [
            models.Index(fields=['tenant_id', 'period', '-period_start']),
            models.Index(fields=['user_identifier', 'period', '-period_start']),
        ]
        unique_together = [
            ['tenant_id', 'period', 'period_start', 'user_identifier',
             'endpoint_id', 'deployment_id', 'ai_provider', 'ai_model']
        ]

    def __str__(self):
        return f"Usage: {self.tenant_id} - {self.period} @ {self.period_start}"


class ComplianceAssessment(Tracking):
    """
    Snapshot of compliance posture at a point in time.

    Tracks historical compliance scores for trend analysis.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Assessment metadata
    framework_id = models.CharField(
        max_length=50,
        blank=True,
        help_text='Framework ID if targeting specific framework, empty for all'
    )
    # TODO: decouple - triggered_by FK removed (use user_id instead)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    assessment_type = models.CharField(
        max_length=20,
        choices=[
            ('manual', 'Manual'),
            ('scheduled', 'Scheduled'),
            ('auto', 'Automatic'),
        ],
        default='manual'
    )

    # Overall scores
    overall_score = models.FloatField(help_text='Weighted average across frameworks (0-100)')
    capabilities_enabled = models.IntegerField()
    capabilities_total = models.IntegerField()

    # Framework coverage snapshot
    framework_scores = models.JSONField(
        default=dict,
        help_text='Scores by framework: {framework_id: {score, covered, total, gaps}}'
    )

    # Gap summary
    total_gaps = models.IntegerField(default=0)
    critical_gaps = models.IntegerField(default=0)
    high_gaps = models.IntegerField(default=0)

    # Status
    status = models.CharField(
        max_length=20,
        choices=[
            ('completed', 'Completed'),
            ('in_progress', 'In Progress'),
            ('failed', 'Failed'),
        ],
        default='completed'
    )
    error_message = models.TextField(blank=True)

    # Timestamp
    assessed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Compliance Assessment'
        verbose_name_plural = 'Compliance Assessments'
        ordering = ['-assessed_at']
        indexes = [
            models.Index(fields=['tenant_id', '-assessed_at']),
            models.Index(fields=['framework_id', '-assessed_at']),
        ]

    def __str__(self):
        return f"Assessment: {self.tenant_id} - {self.overall_score:.1f}% @ {self.assessed_at}"


# ============================================================================
# Rule Configuration Schemas (for reference)
# ============================================================================

CONTENT_RULE_SCHEMAS = {
    'secret_detection': {
        'detect_aws_keys': bool,
        'detect_gcp_keys': bool,
        'detect_azure_keys': bool,
        'detect_api_keys': bool,
        'detect_passwords': bool,
        'detect_tokens': bool,
        'detect_private_keys': bool,
        'detect_connection_strings': bool,
        'custom_patterns': list,  # Additional regex patterns
    },
    'pii_detection': {
        'detect_names': bool,
        'detect_emails': bool,
        'detect_phones': bool,
        'detect_ssn': bool,
        'detect_credit_cards': bool,
        'detect_addresses': bool,
        'detect_dob': bool,
        'detect_passport': bool,
        'sensitivity_threshold': float,  # 0.0-1.0
    },
    'phi_detection': {
        'detect_medical_records': bool,
        'detect_diagnoses': bool,
        'detect_medications': bool,
        'detect_provider_info': bool,
        'hipaa_strict_mode': bool,
    },
    'custom_pattern': {
        'patterns': list,  # List of regex patterns
        'match_mode': str,  # 'any' or 'all'
        'case_sensitive': bool,
    },
    'keyword_block': {
        'keywords': list,  # Exact keywords
        'phrases': list,  # Multi-word phrases
        'case_sensitive': bool,
    },
    'prompt_injection': {
        'detect_ignore_instructions': bool,
        'detect_role_switching': bool,
        'detect_system_prompt_extraction': bool,
        'detect_encoding_attacks': bool,
        'sensitivity': str,  # 'low', 'medium', 'high'
    },
    'jailbreak_attempt': {
        'detect_dan_prompts': bool,
        'detect_roleplay_attacks': bool,
        'detect_hypothetical_framing': bool,
        'detect_token_smuggling': bool,
        'custom_signatures': list,
    },
    'off_topic': {
        'allowed_topics': list,
        'blocked_topics': list,
        'work_keywords': list,
        'personal_keywords': list,
        'use_ml_classification': bool,
    },
    'cost_threshold': {
        'daily_limit_usd': float,
        'weekly_limit_usd': float,
        'monthly_limit_usd': float,
        'per_request_limit_usd': float,
        'alert_at_percent': int,
    },
    'rate_anomaly': {
        'baseline_window_hours': int,
        'anomaly_multiplier': float,
        'min_requests_for_baseline': int,
    },
    'token_limit': {
        'max_input_tokens': int,
        'max_output_tokens': int,
        'max_total_tokens': int,
        'per_request_limit': int,
    },
}
