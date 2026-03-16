"""
GraphQL Queries for Zentinelle GRC Portal.

Standalone version — no dependency on deployments, organization, or billing apps.
"""
import graphene
from graphene_django import DjangoConnectionField
from django.db.models import Q, Count

# Agent-level models (from zentinelle)
from zentinelle.models import (
    AgentEndpoint,
    Policy,
    PolicyRevision,
    Event,
    AuditLog,
    # AI Provider models
    AIProvider,
    # Platform API Keys
    APIKey,
    # Model Registry
    AIModel,
    OrganizationModelApproval,
    # Compliance & Monitoring
    ContentRule,
    ContentScan,
    ContentViolation,
    ComplianceAlert,
    InteractionLog,
    # Risk Management
    Risk,
    Incident,
    # Policy Documents
    PolicyDocument,
    # License Compliance
    LicenseComplianceReport,
    LicenseComplianceViolation,
)
from .types import (
    AgentEndpointType,
    PolicyType,
    PolicyRevisionType,
    EventType,
    AuditLogType,
    # AI Provider types
    AIProviderType,
    # Platform API Keys
    APIKeyType,
    # Model Registry
    AIModelType,
    OrganizationModelApprovalType,
    # Compliance & Monitoring types
    ContentRuleType,
    ContentScanType,
    ContentViolationType,
    ComplianceAlertType,
    InteractionLogType,
    # Risk Management types
    RiskType,
    IncidentType,
    # Retention
    RetentionPolicyType,
    LegalHoldType,
    # License Compliance types
    LicenseComplianceReportType,
    LicenseComplianceViolationGraphType,
    # Organization (stub types for standalone mode)
    OrganizationType,
    UpdateOrganizationSettingsPayload,
    # Notifications (stub types for standalone mode)
    NotificationType,
    NotificationConnection,
    # Impersonation (stub)
    # Billing (stubs)
    UsageMetricsType,
    UsageMetricsSummaryType,
    UsageAlertConnection,
    UsageAlertType,
    UsageTimeSeriesPointType,
    UsageByAgentType,
    UsageByEndpointType,
    ComplianceReportConnection,
    ComplianceReportType,
    EffectivePolicyConnection,
    EffectivePolicyType,
    DeploymentType,
    DeploymentConnection,
    PromptCategoryType,
    SystemPromptType,
    SystemPromptConnection,
    PolicyGraphNodeType,
    PolicyGraphEdgeType,
    PolicyGraphType,
)


# Import authorization helpers from centralized module
from .auth_helpers import filter_by_org, get_request_tenant_id, is_internal_admin


# Dashboard Stats Types
class AgentStatsType(graphene.ObjectType):
    total = graphene.Int()
    active = graphene.Int()
    inactive = graphene.Int()
    healthy = graphene.Int()
    unhealthy = graphene.Int()


class PolicyByTypeType(graphene.ObjectType):
    type = graphene.String()
    count = graphene.Int()


class PolicyStatsType(graphene.ObjectType):
    total = graphene.Int()
    enabled = graphene.Int()
    disabled = graphene.Int()
    by_type = graphene.List(PolicyByTypeType)


class DeploymentByEnvType(graphene.ObjectType):
    environment = graphene.String()
    count = graphene.Int()


class DeploymentStatsType(graphene.ObjectType):
    total = graphene.Int()
    active = graphene.Int()
    by_environment = graphene.List(DeploymentByEnvType)


class ApiUsageType(graphene.ObjectType):
    today = graphene.Int()
    this_week = graphene.Int()
    this_month = graphene.Int()
    trend = graphene.Float()


class RecentActivityType(graphene.ObjectType):
    id = graphene.String()
    type = graphene.String()
    description = graphene.String()
    timestamp = graphene.DateTime()
    actor = graphene.String()


class AlertType(graphene.ObjectType):
    id = graphene.String()
    severity = graphene.String()
    title = graphene.String()
    description = graphene.String()
    created_at = graphene.DateTime()




class ChecklistItemStatsType(graphene.ObjectType):
    """Inline checklist item for dashboard stats."""
    key = graphene.String()
    is_complete = graphene.Boolean()
    completed_at = graphene.DateTime()


class ChecklistStatsType(graphene.ObjectType):
    """Getting started checklist state embedded in dashboard stats."""
    items = graphene.List(ChecklistItemStatsType)
    completed_count = graphene.Int()
    total_count = graphene.Int()
    progress_percent = graphene.Float()
    is_all_complete = graphene.Boolean()
    dismissed = graphene.Boolean()


class DashboardStatsType(graphene.ObjectType):
    agents = graphene.Field(AgentStatsType)
    policies = graphene.Field(PolicyStatsType)
    deployments = graphene.Field(DeploymentStatsType)
    api_usage = graphene.Field(ApiUsageType)
    recent_activity = graphene.List(RecentActivityType)
    alerts = graphene.List(AlertType)
    checklist = graphene.Field(ChecklistStatsType)


# Compliance Types - Capability-Based Approach
class ComplianceCapabilityType(graphene.ObjectType):
    """A compliance capability that Zentinelle can measure/control."""
    id = graphene.String()
    name = graphene.String()
    description = graphene.String()
    capability_type = graphene.String()  # 'observe' or 'control'
    enabled = graphene.Boolean()
    supporting_policies = graphene.List(graphene.String)
    supporting_rules = graphene.List(graphene.String)
    enforcement_options = graphene.List(graphene.String)
    supports_frameworks = graphene.List(graphene.String)


class FrameworkCoverageType(graphene.ObjectType):
    """Coverage stats for a compliance framework."""
    id = graphene.String()
    name = graphene.String()
    description = graphene.String()
    # Required capabilities coverage
    required_covered = graphene.Int()
    required_total = graphene.Int()
    required_percentage = graphene.Float()
    missing_required = graphene.List(graphene.String)
    # Total coverage (required + recommended)
    total_covered = graphene.Int()
    total_count = graphene.Int()
    total_percentage = graphene.Float()
    missing_recommended = graphene.List(graphene.String)


class ComplianceOverviewType(graphene.ObjectType):
    """
    Capability-based compliance overview.

    Shows what Zentinelle can observe/control and how that maps to frameworks.
    """
    # Capabilities by type
    observe_capabilities = graphene.List(ComplianceCapabilityType)
    control_capabilities = graphene.List(ComplianceCapabilityType)

    # Summary stats
    capabilities_enabled = graphene.Int()
    capabilities_total = graphene.Int()

    # Framework coverage
    framework_coverage = graphene.List(FrameworkCoverageType)


# Legacy types kept for backwards compatibility
class ComplianceControlType(graphene.ObjectType):
    id = graphene.String()
    name = graphene.String()
    status = graphene.String()
    severity = graphene.String()
    description = graphene.String()


class ComplianceFrameworkType(graphene.ObjectType):
    id = graphene.String()
    name = graphene.String()
    description = graphene.String()
    enabled = graphene.Boolean()
    score = graphene.Int()
    status = graphene.String()
    last_checked = graphene.DateTime()
    controls = graphene.List(ComplianceControlType)


class ComplianceFindingType(graphene.ObjectType):
    id = graphene.String()
    title = graphene.String()
    severity = graphene.String()
    framework = graphene.String()
    control = graphene.String()
    status = graphene.String()
    found_at = graphene.DateTime()
    resolved_at = graphene.DateTime()


class ComplianceStatusType(graphene.ObjectType):
    overall_score = graphene.Int()
    last_assessment = graphene.DateTime()
    next_assessment = graphene.DateTime()
    frameworks = graphene.List(ComplianceFrameworkType)
    recent_findings = graphene.List(ComplianceFindingType)


# Event Sourcing Types
class EventEnvelopeType(graphene.ObjectType):
    """Event envelope with full metadata for event sourcing."""
    event_id = graphene.String()
    event_type = graphene.String()
    category = graphene.String()
    version = graphene.Int()
    aggregate_id = graphene.String()
    aggregate_type = graphene.String()
    sequence_number = graphene.Int()
    correlation_id = graphene.String()
    causation_id = graphene.String()
    timestamp = graphene.DateTime()
    payload = graphene.JSONString()
    metadata = graphene.JSONString()


class EventStreamType(graphene.ObjectType):
    """Stream of events for an aggregate."""
    aggregate_type = graphene.String()
    aggregate_id = graphene.String()
    events = graphene.List(EventEnvelopeType)
    last_sequence = graphene.Int()
    event_count = graphene.Int()


class DeadLetterEventType(graphene.ObjectType):
    """Event that failed processing and is in the dead letter queue."""
    id = graphene.String()
    event_type = graphene.String()
    category = graphene.String()
    error_message = graphene.String()
    retry_count = graphene.Int()
    received_at = graphene.DateTime()
    last_failed_at = graphene.DateTime()
    payload = graphene.JSONString()


class DeadLetterQueueStatsType(graphene.ObjectType):
    """Statistics about the dead letter queue."""
    total_count = graphene.Int()
    by_category = graphene.List(graphene.List(graphene.String))
    oldest_event = graphene.DateTime()


# Policy Options Types (for dynamic UI)
class PolicyTypeOptionType(graphene.ObjectType):
    """A policy type option with value, label, description, and config schema."""
    value = graphene.String()
    label = graphene.String()
    description = graphene.String()
    category = graphene.String()
    config_schema = graphene.JSONString()


class ScopeTypeOptionType(graphene.ObjectType):
    """A scope type option with value and label."""
    value = graphene.String()
    label = graphene.String()


class EnforcementOptionType(graphene.ObjectType):
    """An enforcement level option with value, label, and description."""
    value = graphene.String()
    label = graphene.String()
    description = graphene.String()


class PolicyOptionsType(graphene.ObjectType):
    """All policy form options from the backend."""
    policy_types = graphene.List(PolicyTypeOptionType)
    scope_types = graphene.List(ScopeTypeOptionType)
    enforcement_levels = graphene.List(EnforcementOptionType)


# Risk/Incident Options Types (for dynamic UI)
class LabelValueOptionType(graphene.ObjectType):
    """Generic option with value and label."""
    value = graphene.String()
    label = graphene.String()


class RiskOptionsType(graphene.ObjectType):
    """All risk form options from the backend."""
    categories = graphene.List(LabelValueOptionType)
    statuses = graphene.List(LabelValueOptionType)
    likelihoods = graphene.List(LabelValueOptionType)
    impacts = graphene.List(LabelValueOptionType)


class IncidentOptionsType(graphene.ObjectType):
    """All incident form options from the backend."""
    incident_types = graphene.List(LabelValueOptionType)
    severities = graphene.List(LabelValueOptionType)
    statuses = graphene.List(LabelValueOptionType)


class ContentRuleOptionsType(graphene.ObjectType):
    """All content rule form options from the backend."""
    rule_types = graphene.List(LabelValueOptionType)
    severities = graphene.List(LabelValueOptionType)
    enforcements = graphene.List(LabelValueOptionType)
    scan_modes = graphene.List(LabelValueOptionType)
    scope_types = graphene.List(LabelValueOptionType)


class RetentionOptionsType(graphene.ObjectType):
    """All retention policy form options from the backend."""
    entity_types = graphene.List(LabelValueOptionType)
    expiration_actions = graphene.List(LabelValueOptionType)
    compliance_requirements = graphene.List(LabelValueOptionType)


class LegalHoldOptionsType(graphene.ObjectType):
    """All legal hold form options from the backend."""
    hold_types = graphene.List(LabelValueOptionType)
    statuses = graphene.List(LabelValueOptionType)


# Note: AI Key Types (OrganizationAIKeyType, DeploymentAIKeyType, AIProviderStatusType,
# DeploymentAIProvidersType) are now in deployments.schema.queries

# AI Usage Types
class AIUsageRecordType(graphene.ObjectType):
    """Individual AI usage record."""
    id = graphene.ID()
    user_identifier = graphene.String()
    provider = graphene.String()
    provider_display = graphene.String()
    model = graphene.String()
    request_type = graphene.String()
    input_tokens = graphene.Int()
    output_tokens = graphene.Int()
    total_tokens = graphene.Int()
    input_cost_usd = graphene.Float()
    output_cost_usd = graphene.Float()
    total_cost_usd = graphene.Float()
    latency_ms = graphene.Int()
    timestamp = graphene.DateTime()


class AIUsageByProviderType(graphene.ObjectType):
    """Usage aggregated by provider."""
    provider = graphene.String()
    provider_display = graphene.String()
    total_requests = graphene.Int()
    total_tokens = graphene.Int()
    total_cost_usd = graphene.Float()


class AIUsageByUserType(graphene.ObjectType):
    """Usage aggregated by user."""
    user_identifier = graphene.String()
    total_requests = graphene.Int()
    total_tokens = graphene.Int()
    total_cost_usd = graphene.Float()


class AIUsageByModelType(graphene.ObjectType):
    """Usage aggregated by model."""
    provider = graphene.String()
    model = graphene.String()
    total_requests = graphene.Int()
    total_tokens = graphene.Int()
    total_cost_usd = graphene.Float()


class AIUsageSummaryType(graphene.ObjectType):
    """Summary of AI usage for an organization."""
    # Time period
    period_start = graphene.DateTime()
    period_end = graphene.DateTime()

    # Totals
    total_requests = graphene.Int()
    total_tokens = graphene.Int()
    total_input_tokens = graphene.Int()
    total_output_tokens = graphene.Int()
    total_cost_usd = graphene.Float()

    # Breakdowns
    by_provider = graphene.List(AIUsageByProviderType)
    by_user = graphene.List(AIUsageByUserType)
    by_model = graphene.List(AIUsageByModelType)

    # Top users
    top_users = graphene.List(AIUsageByUserType)

    # Recent records
    recent_records = graphene.List(AIUsageRecordType)


# AI Budget Types
class AIBudgetStatusType(graphene.ObjectType):
    """AI budget status for an organization."""
    # Budget limits
    budget_usd = graphene.Float(description="Monthly budget in USD (null = unlimited)")
    spent_usd = graphene.Float(description="Amount spent this period")
    remaining_usd = graphene.Float(description="Remaining budget")
    percentage_used = graphene.Float(description="Percentage of budget used")

    # Status flags
    has_budget = graphene.Boolean(description="Whether budget is configured")
    is_exceeded = graphene.Boolean(description="Whether budget is exceeded")
    should_block = graphene.Boolean(description="Whether requests should be blocked")

    # Policy
    overage_policy = graphene.String(description="What happens when budget exceeded")
    overage_policy_display = graphene.String()
    has_payment_method = graphene.Boolean(description="Whether payment method on file")

    # Alerts
    alert_threshold = graphene.Int(description="Alert threshold percentage")
    alert_sent = graphene.Boolean(description="Whether alert sent this period")

    # Period
    period_start = graphene.DateTime(description="Start of current billing period")

    # Per-provider limits (optional)
    provider_limits = graphene.JSONString(description="Per-provider budget limits")


# Monitoring Stats Types
class ViolationByTypeType(graphene.ObjectType):
    rule_type = graphene.String()
    count = graphene.Int()


class ViolationBySeverityType(graphene.ObjectType):
    severity = graphene.String()
    count = graphene.Int()


class MonitoringStatsType(graphene.ObjectType):
    """Aggregated monitoring statistics."""
    # Interaction stats
    total_interactions = graphene.Int()
    interactions_today = graphene.Int()
    interactions_this_hour = graphene.Int()

    # Scan stats
    total_scans = graphene.Int()
    scans_with_violations = graphene.Int()
    scans_blocked = graphene.Int()

    # Violation breakdowns
    violations_by_type = graphene.List(ViolationByTypeType)
    violations_by_severity = graphene.List(ViolationBySeverityType)

    # Token and cost
    total_tokens_today = graphene.Int()
    total_cost_today = graphene.Float()

    # Performance
    avg_latency_ms = graphene.Float()
    avg_scan_duration_ms = graphene.Float()


# Risk Stats Types
class RiskByLevelType(graphene.ObjectType):
    level = graphene.String()
    count = graphene.Int()


class RiskByCategoryType(graphene.ObjectType):
    category = graphene.String()
    count = graphene.Int()


class IncidentBySeverityType(graphene.ObjectType):
    severity = graphene.String()
    count = graphene.Int()


class IncidentByStatusType(graphene.ObjectType):
    status = graphene.String()
    count = graphene.Int()


class RiskStatsType(graphene.ObjectType):
    """Aggregated risk and incident statistics."""
    # Risk stats
    total_risks = graphene.Int()
    open_risks = graphene.Int()
    critical_risks = graphene.Int()
    high_risks = graphene.Int()
    risks_by_level = graphene.List(RiskByLevelType)
    risks_by_category = graphene.List(RiskByCategoryType)

    # Incident stats
    total_incidents = graphene.Int()
    open_incidents = graphene.Int()
    incidents_today = graphene.Int()
    incidents_by_severity = graphene.List(IncidentBySeverityType)
    incidents_by_status = graphene.List(IncidentByStatusType)

    # SLA stats
    sla_met_count = graphene.Int()
    sla_breached_count = graphene.Int()


# Tool Usage Stats Types
class ToolUsageByModelType(graphene.ObjectType):
    """AI usage breakdown by model."""
    model = graphene.String()
    provider = graphene.String()
    requests = graphene.Int()
    input_tokens = graphene.Int()
    output_tokens = graphene.Int()
    total_tokens = graphene.Int()


class ToolUsageStatsType(graphene.ObjectType):
    """Usage statistics for a tool in PLATFORM mode."""
    tool_type = graphene.String()
    tool_type_display = graphene.String()

    # Period info
    period_start = graphene.DateTime()
    period_end = graphene.DateTime()

    # Request counts
    total_requests = graphene.Int()
    requests_today = graphene.Int()
    requests_this_week = graphene.Int()
    requests_this_month = graphene.Int()

    # Token counts
    total_input_tokens = graphene.Int()
    total_output_tokens = graphene.Int()
    total_tokens = graphene.Int()

    # Cost estimates (for PLATFORM mode billing)
    estimated_cost = graphene.Float()

    # Breakdown by model
    by_model = graphene.List(ToolUsageByModelType)

    # Unique users
    unique_users = graphene.Int()
    unique_users_today = graphene.Int()


# License Compliance Types
class LicenseUsageSummaryType(graphene.ObjectType):
    """Summary of license usage."""
    current_users = graphene.Int()
    max_users = graphene.Int()
    users_percent = graphene.Float()
    current_deployments = graphene.Int()
    max_deployments = graphene.Int()
    deployments_percent = graphene.Float()
    current_agents = graphene.Int()
    max_agents = graphene.Int()
    agents_percent = graphene.Float()
    is_over_limit = graphene.Boolean()
    over_limit_details = graphene.List(graphene.String)


class LicenseComplianceSummaryType(graphene.ObjectType):
    """Summary of license compliance status."""
    status = graphene.String()  # 'compliant', 'non_compliant', 'no_license'
    compliance_score = graphene.Float()
    has_violations = graphene.Boolean()
    open_violations = graphene.Int()
    # License info
    license_type = graphene.String()
    license_valid_until = graphene.DateTime()
    is_expired = graphene.Boolean()
    # Usage summary
    usage = graphene.Field(LicenseUsageSummaryType)


class LicenseViolationSummaryType(graphene.ObjectType):
    """Summary of violations."""
    total_count = graphene.Int()
    open_count = graphene.Int()
    resolved_count = graphene.Int()
    by_type = graphene.JSONString()
    by_severity = graphene.JSONString()


class SimulatePolicyResultType(graphene.ObjectType):
    """Result of a policy simulation dry-run."""
    total_events = graphene.Int()
    would_block = graphene.Int()
    would_warn = graphene.Int()
    would_pass = graphene.Int()
    impact_percent = graphene.Float()
    blocked_samples = graphene.List(graphene.JSONString)
    simulated_policy_type = graphene.String()
    lookback_days = graphene.Int()


class Query(graphene.ObjectType):
    """Zentinelle GraphQL queries."""

    # Policy Options (for dynamic UI)
    policy_options = graphene.Field(PolicyOptionsType)

    # Risk/Incident Options (for dynamic UI)
    risk_options = graphene.Field(RiskOptionsType)
    incident_options = graphene.Field(IncidentOptionsType)
    content_rule_options = graphene.Field(ContentRuleOptionsType)
    retention_options = graphene.Field(RetentionOptionsType)
    legal_hold_options = graphene.Field(LegalHoldOptionsType)

    # Compliance - Capability-Based
    compliance_overview = graphene.Field(ComplianceOverviewType)

    # Compliance - Legacy
    compliance_status = graphene.Field(ComplianceStatusType)

    # Note: Deployment queries (deployment, deployments, junohub_config, junohub_configs,
    # terraform_provision, terraform_provisions, organization_ai_keys, deployment_ai_keys,
    # deployment_ai_providers) are now in deployments.schema.queries.DeploymentsQuery

    # Deployments (stub — managed/cloud feature, not available in standalone)
    deployment = graphene.Field(DeploymentType, id=graphene.ID())
    deployments = graphene.Field(
        DeploymentConnection,
        search=graphene.String(),
        environment=graphene.String(),
        first=graphene.Int(),
        after=graphene.String(),
        global_view=graphene.Boolean(),
    )

    # Endpoints
    endpoint = graphene.Field(AgentEndpointType, id=graphene.ID())
    endpoints = DjangoConnectionField(
        AgentEndpointType,
        search=graphene.String(),
        status=graphene.String(),
        agent_type=graphene.String(),
        deployment_id=graphene.ID(),
    )

    # Policies
    policy = graphene.Field(PolicyType, id=graphene.ID())
    policies = DjangoConnectionField(
        PolicyType,
        search=graphene.String(),
        policy_type=graphene.String(),
        scope_type=graphene.String(),
    )
    policy_revisions = graphene.List(
        PolicyRevisionType,
        policy_id=graphene.UUID(required=True),
        description="Return all revisions for a given policy, ordered by version descending.",
    )

    # Events
    events = DjangoConnectionField(
        EventType,
        event_type=graphene.String(),
        category=graphene.String(),
        endpoint_id=graphene.ID(),
        user_id=graphene.String(),
    )

    # Audit Logs
    audit_logs = DjangoConnectionField(
        AuditLogType,
        search=graphene.String(),
        actor=graphene.String(),
        action=graphene.String(),
        resource=graphene.String(),
        resource_type=graphene.String(),
        resource_id=graphene.String(),
        start_date=graphene.DateTime(),
        end_date=graphene.DateTime(),
    )

    # Dashboard Stats
    dashboard_stats = graphene.Field(DashboardStatsType)

    # AI Providers
    ai_provider = graphene.Field(AIProviderType, id=graphene.ID(), slug=graphene.String())
    ai_providers = DjangoConnectionField(
        AIProviderType,
        active_only=graphene.Boolean(),
        supports_managed_keys=graphene.Boolean(),
    )

    # Platform API Keys
    api_key = graphene.Field(APIKeyType, id=graphene.ID())
    api_keys = DjangoConnectionField(
        APIKeyType,
        search=graphene.String(),
        status=graphene.String(),
    )

    # Note: AI Key Management queries (organization_ai_keys, deployment_ai_keys,
    # deployment_ai_providers) are now in deployments.schema.queries.DeploymentsQuery

    # AI Usage
    ai_usage_summary = graphene.Field(
        AIUsageSummaryType,
        organization_id=graphene.ID(required=True, description="Organization UUID or Relay global ID"),
        deployment_id=graphene.UUID(),
        days=graphene.Int(default_value=30, description="Number of days to look back"),
        description="Get AI usage summary for organization or deployment"
    )

    # AI Budget Status
    ai_budget_status = graphene.Field(
        AIBudgetStatusType,
        organization_id=graphene.ID(required=True, description="Organization UUID or Relay global ID"),
        description="Get AI budget status for organization"
    )

    # Model Registry
    ai_model = graphene.Field(AIModelType, id=graphene.ID())
    ai_models = DjangoConnectionField(
        AIModelType,
        search=graphene.String(),
        provider_slug=graphene.String(),
        model_type=graphene.String(),
        risk_level=graphene.String(),
        available_only=graphene.Boolean(),
    )
    model_approval = graphene.Field(OrganizationModelApprovalType, id=graphene.ID())
    model_approvals = DjangoConnectionField(
        OrganizationModelApprovalType,
        status=graphene.String(),
        provider_slug=graphene.String(),
    )

    # Event Sourcing
    event_stream = graphene.Field(
        EventStreamType,
        aggregate_type=graphene.String(required=True),
        aggregate_id=graphene.String(required=True),
        from_sequence=graphene.Int(),
    )
    events_by_correlation = graphene.List(
        EventEnvelopeType,
        correlation_id=graphene.String(required=True),
    )
    dead_letter_queue = graphene.List(
        DeadLetterEventType,
        limit=graphene.Int(),
    )
    dead_letter_queue_stats = graphene.Field(DeadLetterQueueStatsType)

    # Content Rules & Monitoring
    content_rule = graphene.Field(ContentRuleType, id=graphene.ID())
    content_rules = DjangoConnectionField(
        ContentRuleType,
        search=graphene.String(),
        rule_type=graphene.String(),
        severity=graphene.String(),
        enforcement=graphene.String(),
        enabled=graphene.Boolean(),
    )
    content_scan = graphene.Field(ContentScanType, id=graphene.ID())
    content_scans = DjangoConnectionField(
        ContentScanType,
        user_identifier=graphene.String(),
        endpoint_id=graphene.ID(),
        has_violations=graphene.Boolean(),
        content_type=graphene.String(),
        start_date=graphene.DateTime(),
        end_date=graphene.DateTime(),
    )
    content_violations = DjangoConnectionField(
        ContentViolationType,
        rule_type=graphene.String(),
        severity=graphene.String(),
        start_date=graphene.DateTime(),
        end_date=graphene.DateTime(),
    )
    compliance_alerts = DjangoConnectionField(
        ComplianceAlertType,
        status=graphene.String(),
        severity=graphene.String(),
        alert_type=graphene.String(),
    )
    interaction_log = graphene.Field(InteractionLogType, id=graphene.ID())
    interaction_logs = DjangoConnectionField(
        InteractionLogType,
        user_identifier=graphene.String(),
        endpoint_id=graphene.ID(),
        ai_provider=graphene.String(),
        ai_model=graphene.String(),
        interaction_type=graphene.String(),
        has_violations=graphene.Boolean(),
        start_date=graphene.DateTime(),
        end_date=graphene.DateTime(),
    )

    # Monitoring Stats
    monitoring_stats = graphene.Field('zentinelle.schema.queries.MonitoringStatsType')

    # Risk Management
    risk = graphene.Field(RiskType, id=graphene.ID())
    risks = DjangoConnectionField(
        RiskType,
        search=graphene.String(),
        category=graphene.String(),
        status=graphene.String(),
        risk_level=graphene.String(),
    )
    incident = graphene.Field(IncidentType, id=graphene.ID())
    incidents = DjangoConnectionField(
        IncidentType,
        search=graphene.String(),
        incident_type=graphene.String(),
        severity=graphene.String(),
        status=graphene.String(),
        start_date=graphene.DateTime(),
        end_date=graphene.DateTime(),
    )
    risk_stats = graphene.Field('zentinelle.schema.queries.RiskStatsType')

    # Retention Policies
    retention_policy = graphene.Field(RetentionPolicyType, id=graphene.ID())
    retention_policies = DjangoConnectionField(
        RetentionPolicyType,
        search=graphene.String(),
        entity_type=graphene.String(),
        enabled=graphene.Boolean(),
    )

    # Legal Holds
    legal_hold = graphene.Field(LegalHoldType, id=graphene.ID())
    legal_holds = DjangoConnectionField(
        LegalHoldType,
        hold_type=graphene.String(),
        status=graphene.String(),
    )

    # Policy Documents
    policy_document = graphene.Field(
        'zentinelle.schema.mutations.policy_document.PolicyDocumentType',
        id=graphene.ID()
    )
    policy_documents = graphene.List(
        'zentinelle.schema.mutations.policy_document.PolicyDocumentType',
        search=graphene.String(),
        status=graphene.String(),
    )

    # License Compliance
    license_compliance_summary = graphene.Field(
        LicenseComplianceSummaryType,
        organization_id=graphene.UUID(),
        description="Get license compliance summary for an organization"
    )
    license_compliance_report = graphene.Field(
        LicenseComplianceReportType,
        id=graphene.ID()
    )
    license_compliance_reports = DjangoConnectionField(
        LicenseComplianceReportType,
        report_type=graphene.String(),
        status=graphene.String(),
        start_date=graphene.DateTime(),
        end_date=graphene.DateTime(),
    )
    license_compliance_violation = graphene.Field(
        LicenseComplianceViolationGraphType,
        id=graphene.ID()
    )
    license_compliance_violations = DjangoConnectionField(
        LicenseComplianceViolationGraphType,
        violation_type=graphene.String(),
        severity=graphene.String(),
        status=graphene.String(),
    )
    license_violation_summary = graphene.Field(
        LicenseViolationSummaryType,
        organization_id=graphene.UUID(),
        days=graphene.Int(default_value=30),
        description="Get violation summary for an organization"
    )

    # Policy Simulation (#27)
    simulate_policy = graphene.Field(
        SimulatePolicyResultType,
        policy_type=graphene.String(required=True),
        config=graphene.JSONString(required=True),
        enforcement=graphene.String(),
        lookback_days=graphene.Int(),
        description="Dry-run a proposed policy config against historical events",
    )

    # Organization settings (standalone stub)
    my_organization = graphene.Field(OrganizationType)

    # Notifications (stub)
    notifications = graphene.Field(
        NotificationConnection,
        first=graphene.Int(),
        after=graphene.String(),
        status=graphene.String(),
    )

    usage_metrics = graphene.Field(
        UsageMetricsType,
        start_date=graphene.DateTime(),
        end_date=graphene.DateTime(),
        granularity=graphene.String(),
    )
    # System Prompts (stub — prompt library not yet implemented in standalone)
    prompt_categories = graphene.List(
        PromptCategoryType,
        active_only=graphene.Boolean(),
    )
    system_prompts = graphene.Field(
        SystemPromptConnection,
        first=graphene.Int(),
        after=graphene.String(),
        search=graphene.String(),
        category_slug=graphene.String(),
        system_prompt_type=graphene.String(),
        provider=graphene.String(),
        tag_slugs=graphene.List(graphene.String),
        featured_only=graphene.Boolean(),
        verified_only=graphene.Boolean(),
        favorites_only=graphene.Boolean(),
    )
    system_prompt = graphene.Field(
        SystemPromptType,
        id=graphene.UUID(),
        slug=graphene.String(),
    )

    # Usage Alerts (stub)
    usage_alerts = graphene.Field(
        UsageAlertConnection,
        alert_type=graphene.String(),
        severity=graphene.String(),
        acknowledged=graphene.Boolean(),
        resolved=graphene.Boolean(),
        first=graphene.Int(),
        after=graphene.String(),
    )

    # Compliance Reports (stub)
    compliance_reports = graphene.Field(
        ComplianceReportConnection,
        first=graphene.Int(),
        after=graphene.String(),
    )

    # Effective Policies (stub — computed policy inheritance for a context)
    effective_policies = graphene.Field(
        EffectivePolicyConnection,
        deployment_id=graphene.ID(),
        endpoint_id=graphene.ID(),
        user_id=graphene.String(),
        first=graphene.Int(),
        after=graphene.String(),
    )

    # Policy relationship graph
    policy_graph = graphene.Field(
        PolicyGraphType,
        policy_type=graphene.String(),
        endpoint_status=graphene.String(),
        risk_severity=graphene.String(),
        include_incidents=graphene.Boolean(),
    )

    # Resolvers
    @staticmethod
    def resolve_policy_options(root, info):
        """Return all policy form options for dynamic UI."""
        from zentinelle.models.policy import Policy, POLICY_CONFIG_SCHEMAS

        # Policy type descriptions and categories
        policy_type_info = {
            # AI Behavior
            'system_prompt': {
                'description': 'Define system prompts for AI services',
                'category': 'AI Behavior',
            },
            'ai_guardrail': {
                'description': 'Set AI safety guardrails and content filters',
                'category': 'AI Behavior',
            },
            # LLM Controls
            'model_restriction': {
                'description': 'Control which LLM providers and models can be used',
                'category': 'LLM Controls',
            },
            'context_limit': {
                'description': 'Set token limits for input, output, and context',
                'category': 'LLM Controls',
            },
            'output_filter': {
                'description': 'Filter and control LLM response content',
                'category': 'LLM Controls',
            },
            # Agent Controls
            'agent_capability': {
                'description': 'Define what actions agents are allowed to perform',
                'category': 'Agent Controls',
            },
            'agent_memory': {
                'description': 'Control agent memory and context retention',
                'category': 'Agent Controls',
            },
            'human_oversight': {
                'description': 'Require human approval for sensitive actions',
                'category': 'Agent Controls',
            },
            # Resources
            'resource_quota': {
                'description': 'Limit compute resources and server usage',
                'category': 'Resources',
            },
            'budget_limit': {
                'description': 'Set spending limits and budget alerts',
                'category': 'Resources',
            },
            'rate_limit': {
                'description': 'Limit API request rates',
                'category': 'Resources',
            },
            # Security
            'tool_permission': {
                'description': 'Control which tools agents can use',
                'category': 'Security',
            },
            'network_policy': {
                'description': 'Control outbound network access',
                'category': 'Security',
            },
            'secret_access': {
                'description': 'Manage access to secrets and credentials',
                'category': 'Security',
            },
            'data_access': {
                'description': 'Control database and data source access',
                'category': 'Security',
            },
            # Compliance
            'audit_policy': {
                'description': 'Configure audit logging behavior',
                'category': 'Compliance',
            },
            'session_policy': {
                'description': 'Set session timeouts and MFA requirements',
                'category': 'Compliance',
            },
            'data_retention': {
                'description': 'Configure data retention periods',
                'category': 'Compliance',
            },
        }

        # Enforcement level descriptions
        enforcement_descriptions = {
            'enforce': 'Block actions that violate this policy',
            'audit': 'Allow but log violations for review',
            'disabled': 'Policy is inactive',
        }

        # Build policy types list
        policy_types = []
        for value, label in Policy.PolicyType.choices:
            info_dict = policy_type_info.get(value, {})
            config_schema = POLICY_CONFIG_SCHEMAS.get(value, {})
            # Convert Python types to JSON-serializable format
            serialized_schema = {
                k: str(v.__name__) if isinstance(v, type) else str(v)
                for k, v in config_schema.items()
            }
            policy_types.append(PolicyTypeOptionType(
                value=value,
                label=label,
                description=info_dict.get('description', ''),
                category=info_dict.get('category', 'Other'),
                config_schema=serialized_schema,
            ))

        # Build scope types list
        scope_types = [
            ScopeTypeOptionType(value=value, label=label)
            for value, label in Policy.ScopeType.choices
        ]

        # Build enforcement levels list
        enforcement_levels = [
            EnforcementOptionType(
                value=value,
                label=label,
                description=enforcement_descriptions.get(value, ''),
            )
            for value, label in Policy.Enforcement.choices
        ]

        return PolicyOptionsType(
            policy_types=policy_types,
            scope_types=scope_types,
            enforcement_levels=enforcement_levels,
        )

    @staticmethod
    def resolve_risk_options(root, info):
        """Return all risk form options for dynamic UI."""
        from zentinelle.models import Risk

        categories = [
            LabelValueOptionType(value=value, label=label)
            for value, label in Risk.RiskCategory.choices
        ]

        statuses = [
            LabelValueOptionType(value=value, label=label)
            for value, label in Risk.RiskStatus.choices
        ]

        likelihoods = [
            LabelValueOptionType(value=str(value), label=label)
            for value, label in Risk.Likelihood.choices
        ]

        impacts = [
            LabelValueOptionType(value=str(value), label=label)
            for value, label in Risk.Impact.choices
        ]

        return RiskOptionsType(
            categories=categories,
            statuses=statuses,
            likelihoods=likelihoods,
            impacts=impacts,
        )

    @staticmethod
    def resolve_incident_options(root, info):
        """Return all incident form options for dynamic UI."""
        from zentinelle.models import Incident

        incident_types = [
            LabelValueOptionType(value=value, label=label)
            for value, label in Incident.IncidentType.choices
        ]

        severities = [
            LabelValueOptionType(value=value, label=label)
            for value, label in Incident.Severity.choices
        ]

        statuses = [
            LabelValueOptionType(value=value, label=label)
            for value, label in Incident.Status.choices
        ]

        return IncidentOptionsType(
            incident_types=incident_types,
            severities=severities,
            statuses=statuses,
        )

    @staticmethod
    def resolve_content_rule_options(root, info):
        """Return all content rule form options for dynamic UI."""
        from zentinelle.models import ContentRule

        rule_types = [
            LabelValueOptionType(value=value, label=label)
            for value, label in ContentRule.RuleType.choices
        ]

        severities = [
            LabelValueOptionType(value=value, label=label)
            for value, label in ContentRule.Severity.choices
        ]

        enforcements = [
            LabelValueOptionType(value=value, label=label)
            for value, label in ContentRule.Enforcement.choices
        ]

        scan_modes = [
            LabelValueOptionType(value=value, label=label)
            for value, label in ContentRule.ScanMode.choices
        ]

        scope_types = [
            LabelValueOptionType(value=value, label=label)
            for value, label in ContentRule.ScopeType.choices
        ]

        return ContentRuleOptionsType(
            rule_types=rule_types,
            severities=severities,
            enforcements=enforcements,
            scan_modes=scan_modes,
            scope_types=scope_types,
        )

    @staticmethod
    def resolve_retention_options(root, info):
        """Return all retention policy form options for dynamic UI."""
        from zentinelle.models import RetentionPolicy

        entity_types = [
            LabelValueOptionType(value=value, label=label)
            for value, label in RetentionPolicy.EntityType.choices
        ]

        expiration_actions = [
            LabelValueOptionType(value=value, label=label)
            for value, label in RetentionPolicy.ExpirationAction.choices
        ]

        compliance_requirements = [
            LabelValueOptionType(value=value, label=label)
            for value, label in RetentionPolicy.ComplianceRequirement.choices
        ]

        return RetentionOptionsType(
            entity_types=entity_types,
            expiration_actions=expiration_actions,
            compliance_requirements=compliance_requirements,
        )

    @staticmethod
    def resolve_legal_hold_options(root, info):
        """Return all legal hold form options for dynamic UI."""
        from zentinelle.models import LegalHold

        hold_types = [
            LabelValueOptionType(value=value, label=label)
            for value, label in LegalHold.HoldType.choices
        ]

        statuses = [
            LabelValueOptionType(value=value, label=label)
            for value, label in LegalHold.HoldStatus.choices
        ]

        return LegalHoldOptionsType(
            hold_types=hold_types,
            statuses=statuses,
        )

    @staticmethod
    def resolve_deployment(root, info, id=None):
        """Stub resolver — deployments not available in standalone mode."""
        return None

    @staticmethod
    def resolve_deployments(root, info, search=None, environment=None, first=None, after=None, global_view=None):
        """Stub resolver — deployments not available in standalone mode."""
        return None

    @staticmethod
    def resolve_endpoint(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        qs = filter_by_org(
            AgentEndpoint.objects.all(),
            info.context.user
        )
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_endpoints(root, info, search=None, status=None, agent_type=None, deployment_id=None, **kwargs):
        if not info.context.user.is_authenticated:
            return AgentEndpoint.objects.none()

        qs = filter_by_org(
            AgentEndpoint.objects.all(),
            info.context.user
        )
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(agent_id__icontains=search))
        if status:
            qs = qs.filter(status=status)
        if agent_type:
            qs = qs.filter(agent_type=agent_type)
        if deployment_id:
            qs = qs.filter(deployment_id=deployment_id)
        return qs

    @staticmethod
    def resolve_policy(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        qs = filter_by_org(Policy.objects.all(), info.context.user)
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_policies(root, info, search=None, policy_type=None, scope_type=None, **kwargs):
        if not info.context.user.is_authenticated:
            return Policy.objects.none()

        qs = filter_by_org(Policy.objects.all(), info.context.user)
        if search:
            qs = qs.filter(Q(name__icontains=search))
        if policy_type:
            qs = qs.filter(policy_type=policy_type)
        if scope_type:
            qs = qs.filter(scope_type=scope_type)
        return qs

    @staticmethod
    def resolve_policy_revisions(root, info, policy_id, **kwargs):
        """Return all revisions for a given policy, ordered by version descending."""
        if not info.context.user.is_authenticated:
            return PolicyRevision.objects.none()
        # Ensure the caller can see the parent policy
        policy_qs = filter_by_org(Policy.objects.all(), info.context.user)
        if not policy_qs.filter(id=policy_id).exists():
            return PolicyRevision.objects.none()
        return PolicyRevision.objects.filter(policy_id=policy_id).order_by('-version')

    @staticmethod
    def resolve_simulate_policy(
        root, info, policy_type, config, enforcement='enforce', lookback_days=7, **kwargs
    ):
        """Dry-run a proposed policy against historical events."""
        if not info.context.user.is_authenticated:
            return None

        from zentinelle.services.policy_simulator import simulate_policy
        import json

        tenant_id = get_request_tenant_id(info.context.user)
        if not tenant_id:
            return None

        # config may arrive as a JSON string (graphene.JSONString input)
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except (ValueError, TypeError):
                config = {}

        policy_config = {
            'policy_type': policy_type,
            'config': config,
            'enforcement': enforcement,
        }

        result = simulate_policy(tenant_id, policy_config, lookback_days=lookback_days)
        return SimulatePolicyResultType(
            total_events=result['total_events'],
            would_block=result['would_block'],
            would_warn=result['would_warn'],
            would_pass=result['would_pass'],
            impact_percent=result['impact_percent'],
            blocked_samples=[str(s) for s in result['blocked_samples']],
            simulated_policy_type=result['simulated_policy_type'],
            lookback_days=result['lookback_days'],
        )

    @staticmethod
    def resolve_events(root, info, event_type=None, category=None, endpoint_id=None, user_id=None, **kwargs):
        if not info.context.user.is_authenticated:
            return Event.objects.none()

        qs = filter_by_org(Event.objects.all(), info.context.user).order_by('-occurred_at')
        if event_type:
            qs = qs.filter(event_type=event_type)
        if category:
            qs = qs.filter(event_category=category)
        if endpoint_id:
            qs = qs.filter(endpoint_id=endpoint_id)
        if user_id:
            qs = qs.filter(user_identifier=user_id)
        return qs

    @staticmethod
    def resolve_audit_logs(
        root, info,
        search=None, actor=None, action=None,
        resource=None, resource_type=None, resource_id=None,
        start_date=None, end_date=None,
        **kwargs
    ):
        if not info.context.user.is_authenticated:
            return AuditLog.objects.none()

        qs = filter_by_org(AuditLog.objects.all(), info.context.user).order_by('-timestamp')
        if search:
            qs = qs.filter(
                Q(resource_name__icontains=search) |
                Q(resource_type__icontains=search) |
                Q(action__icontains=search) |
                Q(ext_user_id__icontains=search)
            )
        if actor:
            qs = qs.filter(Q(ext_user_id__icontains=actor) | Q(api_key_prefix__icontains=actor))
        if action:
            qs = qs.filter(action=action)
        if resource:
            qs = qs.filter(resource_type=resource)
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        if resource_id:
            qs = qs.filter(resource_id=resource_id)
        if start_date:
            qs = qs.filter(timestamp__gte=start_date)
        if end_date:
            qs = qs.filter(timestamp__lte=end_date)
        return qs

    # Note: resolve_junohub_config, resolve_junohub_configs, resolve_terraform_provision,
    # and resolve_terraform_provisions are now in deployments.schema.queries.DeploymentsQuery

    @staticmethod
    def resolve_dashboard_stats(root, info):
        """Resolve dashboard statistics from real data."""
        if not info.context.user.is_authenticated:
            return None

        from django.utils import timezone
        from datetime import timedelta

        user = info.context.user
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=7)
        month_start = today_start - timedelta(days=30)

        # Agent stats - filtered by org
        agents = filter_by_org(
            AgentEndpoint.objects.all(),
            user
        )
        agent_stats = AgentStatsType(
            total=agents.count(),
            active=agents.filter(status=AgentEndpoint.Status.ACTIVE).count(),
            inactive=agents.exclude(status=AgentEndpoint.Status.ACTIVE).count(),
            healthy=agents.filter(health='healthy').count(),
            unhealthy=agents.exclude(health='healthy').count(),
        )

        # Policy stats - filtered by org
        policies = filter_by_org(Policy.objects.all(), user)
        policy_type_counts = policies.values('policy_type').annotate(count=Count('id'))
        policy_stats = PolicyStatsType(
            total=policies.count(),
            enabled=policies.filter(enabled=True).count(),
            disabled=policies.filter(enabled=False).count(),
            by_type=[
                PolicyByTypeType(type=item['policy_type'], count=item['count'])
                for item in policy_type_counts
            ],
        )

        # Deployment stats - not available in standalone mode
        deployment_stats = DeploymentStatsType(
            total=0,
            active=0,
            by_environment=[],
        )

        # API Usage - from Events - filtered by org
        events_base = filter_by_org(Event.objects.all(), user)
        events_today = events_base.filter(occurred_at__gte=today_start).count()
        events_week = events_base.filter(occurred_at__gte=week_start).count()
        events_month = events_base.filter(occurred_at__gte=month_start).count()

        # Calculate week-over-week trend (compare this week to last week)
        last_week_start = week_start - timedelta(days=7)
        events_last_week = events_base.filter(
            occurred_at__gte=last_week_start,
            occurred_at__lt=week_start
        ).count()

        if events_last_week > 0:
            trend = ((events_week - events_last_week) / events_last_week) * 100
        elif events_week > 0:
            trend = 100.0  # Infinite increase (from 0 to some value)
        else:
            trend = 0.0  # No change (both are 0)

        api_usage = ApiUsageType(
            today=events_today,
            this_week=events_week,
            this_month=events_month,
            trend=round(trend, 1),
        )

        # Recent activity from audit logs - filtered by org
        recent_logs = filter_by_org(AuditLog.objects.all(), user).order_by('-timestamp')[:10]
        recent_activity = [
            RecentActivityType(
                id=str(log.id),
                type=log.action,
                description=f"{log.action} {log.resource_type}: {log.resource_name}",
                timestamp=log.timestamp,
                actor=log.ext_user_id or 'System',
            )
            for log in recent_logs
        ]

        # Alerts - for now return empty list
        alerts = []

        # Getting started checklist - not available in standalone mode
        checklist_stats = None

        return DashboardStatsType(
            agents=agent_stats,
            policies=policy_stats,
            deployments=deployment_stats,
            api_usage=api_usage,
            recent_activity=recent_activity,
            alerts=alerts,
            checklist=checklist_stats,
        )

    # ==========================================================================
    # AI Provider Resolvers
    # ==========================================================================

    @staticmethod
    def resolve_ai_provider(root, info, id=None, slug=None):
        if not info.context.user.is_authenticated:
            return None
        if id:
            return AIProvider.objects.filter(id=id).first()
        if slug:
            return AIProvider.objects.filter(slug=slug).first()
        return None

    @staticmethod
    def resolve_ai_providers(root, info, active_only=None, supports_managed_keys=None, **kwargs):
        if not info.context.user.is_authenticated:
            return AIProvider.objects.none()

        qs = AIProvider.objects.all().order_by('name')
        if active_only:
            qs = qs.filter(is_active=True)
        if supports_managed_keys:
            qs = qs.filter(supports_managed_keys=True)
        return qs

    # ==========================================================================
    # Platform API Key Resolvers
    # ==========================================================================

    @staticmethod
    def resolve_api_key(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return None
        if is_internal_admin(user):
            return APIKey.objects.filter(id=id).first()
        return APIKey.objects.filter(id=id, tenant_id=tenant_id).first()

    @staticmethod
    def resolve_api_keys(root, info, search=None, status=None, **kwargs):
        if not info.context.user.is_authenticated:
            return APIKey.objects.none()

        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return APIKey.objects.none()

        qs = filter_by_org(APIKey.objects.all(), user).order_by('-created_at')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if status:
            qs = qs.filter(status=status)
        return qs

    # ==========================================================================
    # Model Registry Resolvers
    # ==========================================================================

    @staticmethod
    def resolve_ai_model(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        # AI Models are global, no org filtering needed
        return AIModel.objects.filter(id=id, is_available=True).first()

    @staticmethod
    def resolve_ai_models(
        root, info, search=None, provider_slug=None, model_type=None,
        risk_level=None, available_only=None, **kwargs
    ):
        if not info.context.user.is_authenticated:
            return AIModel.objects.none()

        qs = AIModel.objects.filter(is_global=True).select_related('provider')

        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(model_id__icontains=search) |
                Q(description__icontains=search)
            )
        if provider_slug:
            qs = qs.filter(provider__slug=provider_slug)
        if model_type:
            qs = qs.filter(model_type=model_type)
        if risk_level:
            qs = qs.filter(risk_level=risk_level)
        if available_only:
            qs = qs.filter(is_available=True, deprecated=False)

        return qs.order_by('provider__name', 'name')

    @staticmethod
    def resolve_model_approval(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return None
        qs = filter_by_org(
            OrganizationModelApproval.objects.select_related('model', 'model__provider'),
            user
        )
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_model_approvals(root, info, status=None, provider_slug=None, **kwargs):
        if not info.context.user.is_authenticated:
            return OrganizationModelApproval.objects.none()

        user = info.context.user
        qs = filter_by_org(
            OrganizationModelApproval.objects.select_related('model', 'model__provider'),
            user
        )

        if status:
            qs = qs.filter(status=status)
        if provider_slug:
            qs = qs.filter(model__provider__slug=provider_slug)

        return qs.order_by('model__provider__name', 'model__name')

    # ==========================================================================
    # Compliance Resolvers
    # ==========================================================================

    @staticmethod
    def resolve_compliance_overview(root, info):
        """
        Get capability-based compliance overview.

        Shows what Zentinelle can observe/control and maps to framework coverage.
        """
        if not info.context.user.is_authenticated:
            return None

        from zentinelle.models.compliance import (
            COMPLIANCE_CAPABILITIES,
            FRAMEWORK_REQUIREMENTS,
            get_capability_status,
            get_framework_coverage,
        )

        # Get user's tenant
        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            # Return empty/default state
            observe_caps = []
            control_caps = []
            for cap_id, cap in COMPLIANCE_CAPABILITIES['observe'].items():
                observe_caps.append(ComplianceCapabilityType(
                    id=cap_id,
                    name=cap['name'],
                    description=cap['description'],
                    capability_type='observe',
                    enabled=False,
                    supporting_policies=[],
                    supporting_rules=[],
                    enforcement_options=[],
                    supports_frameworks=cap['supports'],
                ))
            for cap_id, cap in COMPLIANCE_CAPABILITIES['control'].items():
                control_caps.append(ComplianceCapabilityType(
                    id=cap_id,
                    name=cap['name'],
                    description=cap['description'],
                    capability_type='control',
                    enabled=False,
                    supporting_policies=[],
                    supporting_rules=[],
                    enforcement_options=cap.get('enforcement', []),
                    supports_frameworks=cap['supports'],
                ))

            fw_coverage = []
            for fw_id, fw in FRAMEWORK_REQUIREMENTS.items():
                required = fw['required_capabilities']
                recommended = fw.get('recommended_capabilities', [])
                fw_coverage.append(FrameworkCoverageType(
                    id=fw_id,
                    name=fw['name'],
                    description=fw['description'],
                    required_covered=0,
                    required_total=len(required),
                    required_percentage=0.0,
                    missing_required=required,
                    total_covered=0,
                    total_count=len(required) + len(recommended),
                    total_percentage=0.0,
                    missing_recommended=recommended,
                ))

            return ComplianceOverviewType(
                observe_capabilities=observe_caps,
                control_capabilities=control_caps,
                capabilities_enabled=0,
                capabilities_total=len(observe_caps) + len(control_caps),
                framework_coverage=fw_coverage,
            )

        org = tenant_id

        # Get capability status for this org
        capability_status = get_capability_status(org)

        # Build observe capabilities list
        observe_caps = []
        for cap_id, status in capability_status.items():
            if status['type'] == 'observe':
                observe_caps.append(ComplianceCapabilityType(
                    id=cap_id,
                    name=status['name'],
                    description=status['description'],
                    capability_type='observe',
                    enabled=status['enabled'],
                    supporting_policies=status['supporting_policies'],
                    supporting_rules=status['supporting_rules'],
                    enforcement_options=[],
                    supports_frameworks=status['supports_frameworks'],
                ))

        # Build control capabilities list
        control_caps = []
        for cap_id, status in capability_status.items():
            if status['type'] == 'control':
                control_caps.append(ComplianceCapabilityType(
                    id=cap_id,
                    name=status['name'],
                    description=status['description'],
                    capability_type='control',
                    enabled=status['enabled'],
                    supporting_policies=status['supporting_policies'],
                    supporting_rules=status['supporting_rules'],
                    enforcement_options=status.get('enforcement_options', []),
                    supports_frameworks=status['supports_frameworks'],
                ))

        # Count enabled
        enabled_count = sum(1 for s in capability_status.values() if s['enabled'])
        total_count = len(capability_status)

        # Get framework coverage
        coverage = get_framework_coverage(org)
        fw_coverage = []
        for fw_id, cov in coverage.items():
            fw_coverage.append(FrameworkCoverageType(
                id=fw_id,
                name=cov['name'],
                description=cov['description'],
                required_covered=cov['required_covered'],
                required_total=cov['required_total'],
                required_percentage=cov['required_percentage'],
                missing_required=cov['missing_required'],
                total_covered=cov['total_covered'],
                total_count=cov['total_count'],
                total_percentage=cov['total_percentage'],
                missing_recommended=cov['missing_recommended'],
            ))

        return ComplianceOverviewType(
            observe_capabilities=observe_caps,
            control_capabilities=control_caps,
            capabilities_enabled=enabled_count,
            capabilities_total=total_count,
            framework_coverage=fw_coverage,
        )

    @staticmethod
    def resolve_compliance_status(root, info):
        """Get compliance status overview."""
        if not info.context.user.is_authenticated:
            return None

        from django.utils import timezone
        from datetime import timedelta
        from zentinelle.models import ComplianceAlert, ContentRule, ContentViolation

        user = info.context.user
        now = timezone.now()

        # Get violation counts by severity - filtered by org
        violations_last_30_days = filter_by_org(
            ContentViolation.objects.filter(created_at__gte=now - timedelta(days=30)),
            user
        )
        critical_count = violations_last_30_days.filter(severity='critical').count()
        high_count = violations_last_30_days.filter(severity='high').count()

        # Calculate overall score (100 - deductions)
        # Critical: -20 each, High: -10 each, Medium: -5 each
        deductions = min(100, (critical_count * 20) + (high_count * 10))
        overall_score = max(0, 100 - deductions)

        # Build frameworks list with sample security frameworks
        frameworks = [
            ComplianceFrameworkType(
                id='soc2',
                name='SOC 2 Type II',
                description='Service Organization Control 2 compliance',
                enabled=True,
                score=overall_score,
                status='compliant' if overall_score >= 80 else 'partial' if overall_score >= 50 else 'non_compliant',
                last_checked=now - timedelta(hours=6),
                controls=[
                    ComplianceControlType(
                        id='cc6.1',
                        name='CC6.1 - Access Control',
                        status='passed' if critical_count == 0 else 'failed',
                        severity='high',
                        description='Logical and physical access controls'
                    ),
                    ComplianceControlType(
                        id='cc6.6',
                        name='CC6.6 - Encryption',
                        status='passed',
                        severity='medium',
                        description='Data encryption in transit and at rest'
                    ),
                    ComplianceControlType(
                        id='cc7.2',
                        name='CC7.2 - Monitoring',
                        status='passed',
                        severity='medium',
                        description='Security event monitoring and alerting'
                    ),
                ],
            ),
            ComplianceFrameworkType(
                id='gdpr',
                name='GDPR',
                description='General Data Protection Regulation',
                enabled=True,
                score=overall_score + 5 if overall_score < 95 else 100,
                status='compliant' if overall_score >= 75 else 'partial',
                last_checked=now - timedelta(hours=12),
                controls=[
                    ComplianceControlType(
                        id='gdpr-6',
                        name='Article 6 - Lawfulness',
                        status='passed',
                        severity='high',
                        description='Lawful basis for processing'
                    ),
                    ComplianceControlType(
                        id='gdpr-32',
                        name='Article 32 - Security',
                        status='passed',
                        severity='high',
                        description='Security of processing'
                    ),
                ],
            ),
            ComplianceFrameworkType(
                id='hipaa',
                name='HIPAA',
                description='Health Insurance Portability and Accountability Act',
                enabled=False,
                score=0,
                status='not_applicable',
                last_checked=None,
                controls=[],
            ),
        ]

        # Get recent findings from compliance alerts - filtered by org
        recent_alerts = filter_by_org(ComplianceAlert.objects.all(), user).order_by('-created_at')[:10]
        recent_findings = [
            ComplianceFindingType(
                id=str(alert.id),
                title=alert.title,
                severity=alert.severity,
                framework='SOC 2',
                control=alert.alert_type,
                status='open' if alert.status == 'open' else 'resolved',
                found_at=alert.first_violation_at,
                resolved_at=alert.resolved_at,
            )
            for alert in recent_alerts
        ]

        return ComplianceStatusType(
            overall_score=overall_score,
            last_assessment=now - timedelta(hours=6),
            next_assessment=now + timedelta(days=7),
            frameworks=frameworks,
            recent_findings=recent_findings,
        )

    @staticmethod
    def resolve_event_stream(root, info, aggregate_type, aggregate_id, from_sequence=0):
        """Get event stream for an aggregate."""
        if not info.context.user.is_authenticated:
            return None

        from zentinelle.services.event_store import event_store

        events = []
        last_seq = 0
        for envelope in event_store.get_stream(aggregate_type, aggregate_id, from_sequence):
            events.append(EventEnvelopeType(
                event_id=envelope.event_id,
                event_type=envelope.event_type,
                category=envelope.category,
                version=envelope.version,
                aggregate_id=envelope.aggregate_id,
                aggregate_type=envelope.aggregate_type,
                sequence_number=envelope.sequence_number,
                correlation_id=envelope.correlation_id,
                causation_id=envelope.causation_id,
                timestamp=envelope.timestamp,
                payload=envelope.payload,
                metadata=envelope.metadata,
            ))
            last_seq = envelope.sequence_number

        return EventStreamType(
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            events=events,
            last_sequence=last_seq,
            event_count=len(events),
        )

    @staticmethod
    def resolve_events_by_correlation(root, info, correlation_id):
        """Get all events in a correlation chain."""
        if not info.context.user.is_authenticated:
            return []

        from zentinelle.services.event_store import event_store

        envelopes = event_store.get_events_by_correlation(correlation_id)
        return [
            EventEnvelopeType(
                event_id=e.event_id,
                event_type=e.event_type,
                category=e.category,
                version=e.version,
                aggregate_id=e.aggregate_id,
                aggregate_type=e.aggregate_type,
                sequence_number=e.sequence_number,
                correlation_id=e.correlation_id,
                causation_id=e.causation_id,
                timestamp=e.timestamp,
                payload=e.payload,
                metadata=e.metadata,
            )
            for e in envelopes
        ]

    @staticmethod
    def resolve_dead_letter_queue(root, info, limit=50):
        """Get events in the dead letter queue."""
        if not info.context.user.is_authenticated:
            return []

        from zentinelle.services.event_store import dead_letter_queue

        # Get tenant from user context
        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return []

        events = dead_letter_queue.get_dlq_events(tenant_id, limit=limit)
        return [
            DeadLetterEventType(
                id=str(e.id),
                event_type=e.event_type,
                category=e.event_category,
                error_message=e.error_message,
                retry_count=e.retry_count,
                received_at=e.received_at,
                last_failed_at=e.processed_at,
                payload=e.payload,
            )
            for e in events
        ]

    @staticmethod
    def resolve_dead_letter_queue_stats(root, info):
        """Get statistics about the dead letter queue."""
        if not info.context.user.is_authenticated:
            return None

        from django.db.models import Count, Min

        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return DeadLetterQueueStatsType(
                total_count=0,
                by_category=[],
                oldest_event=None,
            )

        dlq_events = filter_by_org(
            Event.objects.filter(
                status=Event.Status.FAILED,
                retry_count__gte=5,
            ),
            user
        )

        stats = dlq_events.aggregate(
            total=Count('id'),
            oldest=Min('received_at'),
        )

        by_category = dlq_events.values('event_category').annotate(
            count=Count('id')
        )

        return DeadLetterQueueStatsType(
            total_count=stats['total'] or 0,
            by_category=[
                [cat['event_category'], str(cat['count'])]
                for cat in by_category
            ],
            oldest_event=stats['oldest'],
        )

    # ==========================================================================
    # Content Monitoring Resolvers
    # ==========================================================================

    @staticmethod
    def resolve_content_rule(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        user = info.context.user
        qs = filter_by_org(ContentRule.objects.all(), user)
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_content_rules(
        root, info, search=None, rule_type=None, severity=None,
        enforcement=None, enabled=None, **kwargs
    ):
        if not info.context.user.is_authenticated:
            return ContentRule.objects.none()

        user = info.context.user
        qs = filter_by_org(ContentRule.objects.all(), user)

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if rule_type:
            qs = qs.filter(rule_type=rule_type)
        if severity:
            qs = qs.filter(severity=severity)
        if enforcement:
            qs = qs.filter(enforcement=enforcement)
        if enabled is not None:
            qs = qs.filter(enabled=enabled)

        return qs.order_by('-priority', 'name')

    @staticmethod
    def resolve_content_scan(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        user = info.context.user
        qs = filter_by_org(ContentScan.objects.all(), user)
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_content_scans(
        root, info, user_identifier=None, endpoint_id=None,
        has_violations=None, content_type=None,
        start_date=None, end_date=None, **kwargs
    ):
        if not info.context.user.is_authenticated:
            return ContentScan.objects.none()

        user = info.context.user
        qs = filter_by_org(ContentScan.objects.all(), user)

        if user_identifier:
            qs = qs.filter(user_identifier=user_identifier)
        if endpoint_id:
            qs = qs.filter(endpoint_id=endpoint_id)
        if has_violations is not None:
            qs = qs.filter(has_violations=has_violations)
        if content_type:
            qs = qs.filter(content_type=content_type)
        if start_date:
            qs = qs.filter(created_at__gte=start_date)
        if end_date:
            qs = qs.filter(created_at__lte=end_date)

        return qs.order_by('-created_at')

    @staticmethod
    def resolve_content_violations(
        root, info, rule_type=None, severity=None,
        start_date=None, end_date=None, **kwargs
    ):
        if not info.context.user.is_authenticated:
            return ContentViolation.objects.none()

        user = info.context.user
        qs = filter_by_org(
            ContentViolation.objects.all(), user,
            org_field='scan__tenant_id'
        )

        if rule_type:
            qs = qs.filter(rule_type=rule_type)
        if severity:
            qs = qs.filter(severity=severity)
        if start_date:
            qs = qs.filter(created_at__gte=start_date)
        if end_date:
            qs = qs.filter(created_at__lte=end_date)

        return qs.order_by('-created_at')

    @staticmethod
    def resolve_compliance_alerts(
        root, info, status=None, severity=None, alert_type=None, **kwargs
    ):
        if not info.context.user.is_authenticated:
            return ComplianceAlert.objects.none()

        user = info.context.user
        qs = filter_by_org(ComplianceAlert.objects.all(), user)

        if status:
            qs = qs.filter(status=status)
        if severity:
            qs = qs.filter(severity=severity)
        if alert_type:
            qs = qs.filter(alert_type=alert_type)

        return qs.order_by('-created_at')

    @staticmethod
    def resolve_interaction_log(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        user = info.context.user
        qs = filter_by_org(InteractionLog.objects.all(), user)
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_interaction_logs(
        root, info, user_identifier=None, endpoint_id=None,
        ai_provider=None, ai_model=None, interaction_type=None,
        has_violations=None, start_date=None, end_date=None, **kwargs
    ):
        if not info.context.user.is_authenticated:
            return InteractionLog.objects.none()

        user = info.context.user
        qs = filter_by_org(
            InteractionLog.objects.select_related('endpoint', 'scan'),
            user
        )

        if user_identifier:
            qs = qs.filter(user_identifier=user_identifier)
        if endpoint_id:
            qs = qs.filter(endpoint_id=endpoint_id)
        if ai_provider:
            qs = qs.filter(ai_provider=ai_provider)
        if ai_model:
            qs = qs.filter(ai_model=ai_model)
        if interaction_type:
            qs = qs.filter(interaction_type=interaction_type)
        if has_violations is not None:
            qs = qs.filter(scan__has_violations=has_violations)
        if start_date:
            qs = qs.filter(occurred_at__gte=start_date)
        if end_date:
            qs = qs.filter(occurred_at__lte=end_date)

        return qs.order_by('-occurred_at')

    @staticmethod
    def resolve_monitoring_stats(root, info):
        """Get aggregated monitoring statistics."""
        if not info.context.user.is_authenticated:
            return None

        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Avg, Sum

        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return None

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        hour_ago = now - timedelta(hours=1)

        # Interaction stats
        interactions = filter_by_org(InteractionLog.objects.all(), user)
        total_interactions = interactions.count()
        interactions_today = interactions.filter(occurred_at__gte=today_start).count()
        interactions_this_hour = interactions.filter(occurred_at__gte=hour_ago).count()

        # Scan stats
        scans = filter_by_org(ContentScan.objects.all(), user)
        total_scans = scans.count()
        scans_with_violations = scans.filter(has_violations=True).count()
        scans_blocked = scans.filter(was_blocked=True).count()

        # Violation breakdowns
        violations_today = filter_by_org(
            ContentViolation.objects.filter(created_at__gte=today_start),
            user,
            org_field='scan__tenant_id'
        )

        by_type = violations_today.values('rule_type').annotate(
            count=Count('id')
        )
        violations_by_type = [
            ViolationByTypeType(rule_type=v['rule_type'], count=v['count'])
            for v in by_type
        ]

        by_severity = violations_today.values('severity').annotate(
            count=Count('id')
        )
        violations_by_severity = [
            ViolationBySeverityType(severity=v['severity'], count=v['count'])
            for v in by_severity
        ]

        # Token and cost stats
        today_interactions = interactions.filter(occurred_at__gte=today_start)
        token_stats = today_interactions.aggregate(
            total_tokens=Sum('total_tokens'),
            total_cost=Sum('estimated_cost_usd'),
            avg_latency=Avg('latency_ms'),
        )

        # Scan duration
        scan_stats = scans.filter(created_at__gte=today_start).aggregate(
            avg_scan=Avg('scan_duration_ms')
        )

        return MonitoringStatsType(
            total_interactions=total_interactions,
            interactions_today=interactions_today,
            interactions_this_hour=interactions_this_hour,
            total_scans=total_scans,
            scans_with_violations=scans_with_violations,
            scans_blocked=scans_blocked,
            violations_by_type=violations_by_type,
            violations_by_severity=violations_by_severity,
            total_tokens_today=token_stats['total_tokens'] or 0,
            total_cost_today=float(token_stats['total_cost'] or 0),
            avg_latency_ms=token_stats['avg_latency'] or 0,
            avg_scan_duration_ms=scan_stats['avg_scan'] or 0,
        )

    # ==========================================================================
    # Risk Management Resolvers
    # ==========================================================================

    @staticmethod
    def resolve_risk(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        user = info.context.user
        qs = filter_by_org(Risk.objects.all(), user)
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_risks(
        root, info, search=None, category=None, status=None, risk_level=None, **kwargs
    ):
        if not info.context.user.is_authenticated:
            return Risk.objects.none()

        user = info.context.user
        qs = filter_by_org(Risk.objects.all(), user)

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if category:
            qs = qs.filter(category=category)
        if status:
            qs = qs.filter(status=status)
        if risk_level:
            # Filter by computed risk level
            if risk_level == 'critical':
                qs = qs.filter(likelihood__gte=3, impact__gte=5) | qs.filter(likelihood__gte=5, impact__gte=3)
            elif risk_level == 'high':
                qs = qs.filter(likelihood__gte=2, impact__gte=4)
            elif risk_level == 'medium':
                qs = qs.filter(likelihood__gte=2, impact__gte=2)

        return qs.order_by('-likelihood', '-impact', '-created_at')

    @staticmethod
    def resolve_incident(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        user = info.context.user
        qs = filter_by_org(Incident.objects.all(), user)
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_incidents(
        root, info, search=None, incident_type=None, severity=None, status=None,
        start_date=None, end_date=None, **kwargs
    ):
        if not info.context.user.is_authenticated:
            return Incident.objects.none()

        user = info.context.user
        qs = filter_by_org(Incident.objects.all(), user)

        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
        if incident_type:
            qs = qs.filter(incident_type=incident_type)
        if severity:
            qs = qs.filter(severity=severity)
        if status:
            qs = qs.filter(status=status)
        if start_date:
            qs = qs.filter(detected_at__gte=start_date)
        if end_date:
            qs = qs.filter(detected_at__lte=end_date)

        return qs.order_by('-severity', '-detected_at')

    @staticmethod
    def resolve_risk_stats(root, info):
        """Get aggregated risk and incident statistics."""
        from django.utils import timezone
        from datetime import timedelta

        user = info.context.user

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Risk stats
        risks = filter_by_org(Risk.objects.all(), user)
        total_risks = risks.count()
        open_risks = risks.exclude(status__in=['closed', 'accepted']).count()

        # Count by risk level (computed)
        critical_risks = 0
        high_risks = 0
        for r in risks:
            if r.risk_level == 'critical':
                critical_risks += 1
            elif r.risk_level == 'high':
                high_risks += 1

        # By category
        by_category = risks.values('category').annotate(count=Count('id'))
        risks_by_category = [
            RiskByCategoryType(category=r['category'], count=r['count'])
            for r in by_category
        ]

        # By level (we need to compute this)
        level_counts = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        for r in risks:
            level_counts[r.risk_level] = level_counts.get(r.risk_level, 0) + 1
        risks_by_level = [
            RiskByLevelType(level=level, count=count)
            for level, count in level_counts.items()
        ]

        # Incident stats
        incidents = filter_by_org(Incident.objects.all(), user)
        total_incidents = incidents.count()
        open_incidents = incidents.exclude(status__in=['resolved', 'closed']).count()
        incidents_today = incidents.filter(detected_at__gte=today_start).count()

        # By severity
        by_severity = incidents.values('severity').annotate(count=Count('id'))
        incidents_by_severity = [
            IncidentBySeverityType(severity=i['severity'], count=i['count'])
            for i in by_severity
        ]

        # By status
        by_status = incidents.values('status').annotate(count=Count('id'))
        incidents_by_status = [
            IncidentByStatusType(status=i['status'], count=i['count'])
            for i in by_status
        ]

        # SLA stats
        resolved_incidents = incidents.filter(status__in=['resolved', 'closed'])
        sla_met = 0
        sla_breached = 0
        for inc in resolved_incidents:
            if inc.sla_status == 'met':
                sla_met += 1
            elif inc.sla_status == 'breached':
                sla_breached += 1

        return RiskStatsType(
            total_risks=total_risks,
            open_risks=open_risks,
            critical_risks=critical_risks,
            high_risks=high_risks,
            risks_by_level=risks_by_level,
            risks_by_category=risks_by_category,
            total_incidents=total_incidents,
            open_incidents=open_incidents,
            incidents_today=incidents_today,
            incidents_by_severity=incidents_by_severity,
            incidents_by_status=incidents_by_status,
            sla_met_count=sla_met,
            sla_breached_count=sla_breached,
        )

    # Retention Policy resolvers
    @staticmethod
    def resolve_retention_policy(root, info, id=None):
        if not info.context.user.is_authenticated:
            return None
        from zentinelle.models import RetentionPolicy
        qs = filter_by_org(RetentionPolicy.objects.all(), info.context.user)
        return qs.filter(id=id).first() if id else None

    @staticmethod
    def resolve_retention_policies(root, info, search=None, entity_type=None, enabled=None, **kwargs):
        from zentinelle.models import RetentionPolicy
        if not info.context.user.is_authenticated:
            return RetentionPolicy.objects.none()
        qs = filter_by_org(RetentionPolicy.objects.all(), info.context.user)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        if enabled is not None:
            qs = qs.filter(enabled=enabled)
        return qs

    # Legal Hold resolvers
    @staticmethod
    def resolve_legal_hold(root, info, id=None):
        if not info.context.user.is_authenticated:
            return None
        from zentinelle.models import LegalHold
        qs = filter_by_org(LegalHold.objects.all(), info.context.user)
        return qs.filter(id=id).first() if id else None

    @staticmethod
    def resolve_legal_holds(root, info, hold_type=None, status=None, **kwargs):
        from zentinelle.models import LegalHold
        if not info.context.user.is_authenticated:
            return LegalHold.objects.none()
        qs = filter_by_org(LegalHold.objects.all(), info.context.user)
        if hold_type:
            qs = qs.filter(hold_type=hold_type)
        if status:
            qs = qs.filter(status=status)
        return qs

    # Policy Document resolvers
    @staticmethod
    def resolve_policy_document(root, info, id):
        if not info.context.user.is_authenticated:
            return None
        user = info.context.user
        qs = filter_by_org(PolicyDocument.objects.all(), user)
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_policy_documents(root, info, search=None, status=None, **kwargs):
        if not info.context.user.is_authenticated:
            return []

        user = info.context.user
        qs = filter_by_org(PolicyDocument.objects.all(), user)

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if status:
            qs = qs.filter(status=status)

        return qs.order_by('-created_at')

    # Note: resolve_organization_ai_keys, resolve_deployment_ai_keys, and
    # resolve_deployment_ai_providers are now in deployments.schema.queries.DeploymentsQuery

    @staticmethod
    def resolve_ai_usage_summary(root, info, organization_id, deployment_id=None, days=30, **kwargs):
        """Get AI usage summary. Not available in standalone mode (requires billing app)."""
        return None

    @staticmethod
    def _resolve_ai_usage_summary_DISABLED(root, info, organization_id, deployment_id=None, days=30, **kwargs):
        """DISABLED: Original resolver depends on billing.models.AIUsage."""
        if not info.context.user.is_authenticated:
            return None

        org_id_str = str(organization_id)
        try:
            import uuid
            uuid.UUID(org_id_str)
        except ValueError:
            try:
                from graphql_relay import from_global_id
                _, org_id_str = from_global_id(org_id_str)
                organization_id = org_id_str
            except Exception:
                return None

        user = info.context.user
        # DISABLED: org_ids check removed (standalone mode)
        if False:
            return None

        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Sum, Count
        AIUsage = None  # billing.models.AIUsage not available

        now = timezone.now()
        period_start = now - timedelta(days=days)

        # Base query
        qs = AIUsage.objects.filter(
            organization_id=organization_id,
            timestamp__gte=period_start,
        )

        if deployment_id:
            qs = qs.filter(deployment_id=deployment_id)

        # Totals
        totals = qs.aggregate(
            total_requests=Count('id'),
            total_tokens=Sum('total_tokens'),
            total_input_tokens=Sum('input_tokens'),
            total_output_tokens=Sum('output_tokens'),
            total_cost=Sum('total_cost_usd'),
        )

        # By provider
        by_provider_qs = qs.values('provider').annotate(
            total_requests=Count('id'),
            total_tokens=Sum('total_tokens'),
            total_cost=Sum('total_cost_usd'),
        ).order_by('-total_cost')

        by_provider = [
            AIUsageByProviderType(
                provider=p['provider'],
                provider_display=AIUsage.Provider(p['provider']).label if p['provider'] else 'Unknown',
                total_requests=p['total_requests'] or 0,
                total_tokens=p['total_tokens'] or 0,
                total_cost_usd=float(p['total_cost'] or 0),
            )
            for p in by_provider_qs
        ]

        # By user
        by_user_qs = qs.values('user_identifier').annotate(
            total_requests=Count('id'),
            total_tokens=Sum('total_tokens'),
            total_cost=Sum('total_cost_usd'),
        ).order_by('-total_cost')[:20]

        by_user = [
            AIUsageByUserType(
                user_identifier=u['user_identifier'],
                total_requests=u['total_requests'] or 0,
                total_tokens=u['total_tokens'] or 0,
                total_cost_usd=float(u['total_cost'] or 0),
            )
            for u in by_user_qs
        ]

        # By model
        by_model_qs = qs.values('provider', 'model').annotate(
            total_requests=Count('id'),
            total_tokens=Sum('total_tokens'),
            total_cost=Sum('total_cost_usd'),
        ).order_by('-total_cost')[:20]

        by_model = [
            AIUsageByModelType(
                provider=m['provider'],
                model=m['model'],
                total_requests=m['total_requests'] or 0,
                total_tokens=m['total_tokens'] or 0,
                total_cost_usd=float(m['total_cost'] or 0),
            )
            for m in by_model_qs
        ]

        # Top users (same as by_user but limited to top 10)
        top_users = by_user[:10]

        # Recent records
        recent_qs = qs.order_by('-timestamp')[:50]
        recent_records = [
            AIUsageRecordType(
                id=r.id,
                user_identifier=r.user_identifier,
                provider=r.provider,
                provider_display=r.get_provider_display(),
                model=r.model,
                request_type=r.request_type,
                input_tokens=r.input_tokens,
                output_tokens=r.output_tokens,
                total_tokens=r.total_tokens,
                input_cost_usd=float(r.input_cost_usd),
                output_cost_usd=float(r.output_cost_usd),
                total_cost_usd=float(r.total_cost_usd),
                latency_ms=r.latency_ms,
                timestamp=r.timestamp,
            )
            for r in recent_qs
        ]

        return AIUsageSummaryType(
            period_start=period_start,
            period_end=now,
            total_requests=totals['total_requests'] or 0,
            total_tokens=totals['total_tokens'] or 0,
            total_input_tokens=totals['total_input_tokens'] or 0,
            total_output_tokens=totals['total_output_tokens'] or 0,
            total_cost_usd=float(totals['total_cost'] or 0),
            by_provider=by_provider,
            by_user=by_user,
            by_model=by_model,
            top_users=top_users,
            recent_records=recent_records,
        )

    @staticmethod
    def resolve_ai_budget_status(root, info, organization_id, **kwargs):
        """Get AI budget status. Not available in standalone mode (requires organization app)."""
        return None

    # ==========================================================================
    # License Compliance Resolvers
    # ==========================================================================

    @staticmethod
    def resolve_license_compliance_summary(root, info, organization_id=None):
        """Get license compliance summary. Not available in standalone mode (requires organization app)."""
        return None

    @staticmethod
    def _resolve_license_compliance_summary_DISABLED(root, info, organization_id=None):
        """DISABLED: Original resolver depends on organization.models."""
        if not info.context.user.is_authenticated:
            return None

        return None  # organization.models not available

        user = info.context.user
        membership = None
        if not membership:
            return None

        if organization_id:
            org_ids = get_user_org_ids(user)
            if org_ids is not None and str(organization_id) not in [str(oid) for oid in org_ids]:
                return None
            org = Organization.objects.filter(id=organization_id).first()
        else:
            org = membership.organization

        if not org:
            return None

        # Get compliance summary from service
        summary = license_compliance_service.get_compliance_summary(org)

        # Build usage object
        usage = None
        if 'usage' in summary:
            u = summary['usage']
            usage = LicenseUsageSummaryType(
                current_users=u.get('users', 0),
                max_users=u.get('max_users', 0),
                users_percent=(u.get('users', 0) / u.get('max_users', 1) * 100) if u.get('max_users', 0) > 0 else 0,
                current_deployments=u.get('deployments', 0),
                max_deployments=u.get('max_deployments', 0),
                deployments_percent=(u.get('deployments', 0) / u.get('max_deployments', 1) * 100) if u.get('max_deployments', 0) > 0 else 0,
                current_agents=0,  # Could add agents to summary
                max_agents=0,
                agents_percent=0,
                is_over_limit=False,
                over_limit_details=[],
            )

        license_info = summary.get('license', {})
        return LicenseComplianceSummaryType(
            status=summary.get('status', 'unknown'),
            compliance_score=summary.get('compliance_score', 0),
            has_violations=summary.get('has_violations', False),
            open_violations=summary.get('open_violations', 0),
            license_type=license_info.get('type'),
            license_valid_until=license_info.get('valid_until'),
            is_expired=license_info.get('is_expired', False),
            usage=usage,
        )

    @staticmethod
    def resolve_license_compliance_report(root, info, id):
        """Get a single compliance report by ID."""
        if not info.context.user.is_authenticated:
            return None

        user = info.context.user
        qs = filter_by_org(LicenseComplianceReport.objects.all(), user)
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_license_compliance_reports(root, info, report_type=None, status=None, start_date=None, end_date=None, **kwargs):
        """Get compliance reports for organization."""
        if not info.context.user.is_authenticated:
            return LicenseComplianceReport.objects.none()

        user = info.context.user
        qs = filter_by_org(LicenseComplianceReport.objects.all(), user)

        if report_type:
            qs = qs.filter(report_type=report_type)
        if status:
            qs = qs.filter(status=status)
        if start_date:
            qs = qs.filter(period_start__gte=start_date)
        if end_date:
            qs = qs.filter(period_end__lte=end_date)

        return qs.order_by('-created_at')

    @staticmethod
    def resolve_license_compliance_violation(root, info, id):
        """Get a single compliance violation by ID."""
        if not info.context.user.is_authenticated:
            return None

        user = info.context.user
        qs = filter_by_org(LicenseComplianceViolation.objects.all(), user)
        return qs.filter(id=id).first()

    @staticmethod
    def resolve_license_compliance_violations(root, info, violation_type=None, severity=None, status=None, **kwargs):
        """Get compliance violations for organization."""
        if not info.context.user.is_authenticated:
            return LicenseComplianceViolation.objects.none()

        user = info.context.user
        qs = filter_by_org(LicenseComplianceViolation.objects.all(), user)

        if violation_type:
            qs = qs.filter(violation_type=violation_type)
        if severity:
            qs = qs.filter(severity=severity)
        if status:
            qs = qs.filter(status=status)

        return qs.order_by('-detected_at')

    @staticmethod
    def resolve_license_violation_summary(root, info, organization_id=None, days=30):
        """Get violation summary. Not available in standalone mode (requires organization app)."""
        return None

    @staticmethod
    def _resolve_license_violation_summary_DISABLED(root, info, organization_id=None, days=30):
        """DISABLED: Original resolver depends on organization.models."""
        if not info.context.user.is_authenticated:
            return None

        from django.utils import timezone
        from datetime import timedelta

        user = info.context.user
        membership = user.memberships.filter(is_active=True).first()
        if not membership:
            return None

        # Use specified org or user's current org
        if organization_id:
            org_ids = get_user_org_ids(user)
            if org_ids is not None and str(organization_id) not in [str(oid) for oid in org_ids]:
                return None
            org = Organization.objects.filter(id=organization_id).first()
        else:
            org = membership.organization

        if not org:
            return None

        # Get violations in period
        period_start = timezone.now() - timedelta(days=days)
        violations = LicenseComplianceViolation.objects.filter(
            organization=org,
            detected_at__gte=period_start
        )

        # Group by type
        by_type = {}
        for vt in LicenseComplianceViolation.ViolationType.choices:
            count = violations.filter(violation_type=vt[0]).count()
            if count > 0:
                by_type[vt[0]] = count

        # Group by severity
        by_severity = {}
        for sev in LicenseComplianceViolation.Severity.choices:
            count = violations.filter(severity=sev[0]).count()
            if count > 0:
                by_severity[sev[0]] = count

        return LicenseViolationSummaryType(
            total_count=violations.count(),
            open_count=violations.filter(status=LicenseComplianceViolation.Status.OPEN).count(),
            resolved_count=violations.filter(status__in=[
                LicenseComplianceViolation.Status.RESOLVED,
                LicenseComplianceViolation.Status.WAIVED
            ]).count(),
            by_type=by_type,
            by_severity=by_severity,
        )

    @staticmethod
    def resolve_my_organization(root, info):
        """Return a stub organization object for the current tenant."""
        import os
        from datetime import datetime
        tenant_id = get_request_tenant_id(info.context.user) or "default"
        return OrganizationType(
            id=tenant_id,
            name="My Organization",
            slug=tenant_id,
            tier="standard",
            website="",
            deployment_model="standalone",
            zentinelle_tier="community",
            ai_budget_usd=None,
            ai_budget_spent_usd=0.0,
            overage_policy="block",
            ai_budget_alert_threshold=0.8,
            settings={},
            created_at=None,
        )

    @staticmethod
    def resolve_notifications(root, info, first=None, after=None, status=None):
        from zentinelle.models.notification import Notification
        tenant_id = get_request_tenant_id(info.context.user)
        qs = Notification.objects.filter(tenant_id=tenant_id)
        if status:
            qs = qs.filter(status=status)
        return qs

    @staticmethod
    def resolve_usage_metrics(root, info, start_date=None, end_date=None, granularity=None):
        from zentinelle.models import InteractionLog, AgentEndpoint
        from django.db.models import Sum, Count
        from django.db.models.functions import TruncDay
        from django.utils import timezone
        from datetime import timedelta

        if not info.context.user.is_authenticated:
            return UsageMetricsType(
                summary=UsageMetricsSummaryType(total_api_calls=0, total_tokens=0, total_cost=0.0, active_agents=0, storage_used_mb=0.0),
                time_series=[], by_agent=[], by_endpoint=[],
            )

        tenant_id = get_request_tenant_id(info.context.user)

        end_dt = timezone.now()
        start_dt = end_dt - timedelta(days=30)
        if start_date:
            start_dt = start_date if timezone.is_aware(start_date) else timezone.make_aware(start_date)
        if end_date:
            end_dt = end_date if timezone.is_aware(end_date) else timezone.make_aware(end_date)

        logs = InteractionLog.objects.filter(
            tenant_id=tenant_id,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        )

        agg = logs.aggregate(
            total_api_calls=Count('id'),
            total_tokens=Sum('total_tokens'),
            total_cost=Sum('estimated_cost_usd'),
        )

        active_agents = AgentEndpoint.objects.filter(tenant_id=tenant_id, status='active').count()

        by_agent_qs = (
            logs.values('endpoint__agent_id', 'endpoint__name')
            .annotate(api_calls=Count('id'), tokens=Sum('total_tokens'), cost=Sum('estimated_cost_usd'))
            .order_by('-api_calls')[:10]
        )
        by_agent = [
            UsageByAgentType(
                agent_id=row['endpoint__agent_id'] or '',
                agent_name=row['endpoint__name'] or row['endpoint__agent_id'] or 'Unknown',
                api_calls=row['api_calls'] or 0,
                tokens=row['tokens'] or 0,
                cost=float(row['cost'] or 0),
            )
            for row in by_agent_qs
        ]

        ts_qs = (
            logs.annotate(day=TruncDay('created_at'))
            .values('day')
            .annotate(api_calls=Count('id'), tokens=Sum('total_tokens'), cost=Sum('estimated_cost_usd'))
            .order_by('day')
        )
        time_series = [
            UsageTimeSeriesPointType(
                date=row['day'].strftime('%Y-%m-%d'),
                api_calls=row['api_calls'] or 0,
                tokens=row['tokens'] or 0,
                cost=float(row['cost'] or 0),
            )
            for row in ts_qs
        ]

        return UsageMetricsType(
            summary=UsageMetricsSummaryType(
                total_api_calls=agg['total_api_calls'] or 0,
                total_tokens=agg['total_tokens'] or 0,
                total_cost=float(agg['total_cost'] or 0),
                active_agents=active_agents,
                storage_used_mb=0.0,
            ),
            time_series=time_series,
            by_agent=by_agent,
            by_endpoint=[],
        )

    @staticmethod
    def resolve_prompt_categories(root, info, active_only=None):
        from zentinelle.models import PromptCategory
        qs = PromptCategory.objects.all()
        if active_only:
            qs = qs.filter(is_active=True)
        return list(qs)

    @staticmethod
    def resolve_system_prompts(
        root, info,
        first=None, after=None,
        search=None, category_slug=None, system_prompt_type=None,
        provider=None, tag_slugs=None, featured_only=None, verified_only=None,
        favorites_only=None,
    ):
        from zentinelle.models import SystemPrompt
        from django.db.models import Q

        if not info.context.user.is_authenticated:
            return SystemPrompt.objects.none()

        tenant_id = get_request_tenant_id(info.context.user)

        # Public library prompts + this tenant's own prompts
        qs = SystemPrompt.objects.filter(
            Q(visibility='public', status='active') |
            Q(tenant_id=tenant_id)
        ).distinct()

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if category_slug:
            qs = qs.filter(category__slug=category_slug)
        if system_prompt_type:
            qs = qs.filter(prompt_type=system_prompt_type)
        if provider:
            qs = qs.filter(compatible_providers__contains=[provider])
        if tag_slugs:
            qs = qs.filter(tags__slug__in=tag_slugs).distinct()
        if featured_only:
            qs = qs.filter(is_featured=True)
        if verified_only:
            qs = qs.filter(is_verified=True)

        return qs.order_by('-is_featured', '-created_at')

    @staticmethod
    def resolve_system_prompt(root, info, id=None, slug=None):
        from zentinelle.models import SystemPrompt
        from django.db.models import Q

        if not info.context.user.is_authenticated:
            return None

        tenant_id = get_request_tenant_id(info.context.user)
        visible = Q(visibility='public', status='active') | Q(tenant_id=tenant_id)

        try:
            if id:
                return SystemPrompt.objects.filter(visible, pk=id).first()
            if slug:
                return SystemPrompt.objects.filter(visible, slug=slug).first()
        except Exception:
            return None
        return None

    @staticmethod
    def resolve_usage_alerts(root, info, alert_type=None, severity=None, acknowledged=None, resolved=None, first=None, after=None):
        from zentinelle.models import InteractionLog, Policy
        from django.db.models import Sum
        from django.utils import timezone
        from datetime import timedelta
        import uuid as _uuid

        if not info.context.user.is_authenticated:
            return []

        tenant_id = get_request_tenant_id(info.context.user)
        if not tenant_id:
            return []

        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        alerts = []

        # Check budget-limit policies vs current month usage
        budget_policies = Policy.objects.filter(
            tenant_id=tenant_id,
            policy_type='BUDGET_LIMIT',
            enabled=True,
        )
        if budget_policies.exists():
            current_cost = (
                InteractionLog.objects.filter(tenant_id=tenant_id, created_at__gte=month_start)
                .aggregate(total=Sum('estimated_cost_usd'))['total'] or 0
            )
            for policy in budget_policies:
                config = policy.config or {}
                threshold = config.get('monthly_limit_usd', 0)
                if not threshold:
                    continue
                threshold = float(threshold)
                current = float(current_cost)
                ratio = current / threshold if threshold else 0
                if ratio >= 0.8:
                    sev = 'critical' if ratio >= 1.0 else 'warning'
                    if severity and sev != severity:
                        continue
                    if acknowledged is not None and acknowledged:
                        continue  # No stored acknowledgements — skip filter
                    if resolved is not None and resolved:
                        continue
                    alerts.append(UsageAlertType(
                        id=str(_uuid.uuid5(_uuid.NAMESPACE_DNS, f"{tenant_id}_{policy.id}_budget")),
                        alert_type='budget_threshold',
                        alert_type_display='Budget Threshold',
                        severity=sev,
                        severity_display=sev.title(),
                        title=f"Monthly budget {'exceeded' if ratio >= 1.0 else 'approaching'} ({ratio * 100:.0f}%)",
                        message=f"Spend ${current:.2f} vs ${threshold:.2f} limit for {policy.name}",
                        threshold_value=threshold,
                        current_value=current,
                        acknowledged=False,
                        resolved=False,
                        created_at=now,
                    ))

        return alerts

    @staticmethod
    def resolve_compliance_reports(root, info, first=None, after=None):
        from zentinelle.models import ComplianceAssessment

        if not info.context.user.is_authenticated:
            return ComplianceAssessment.objects.none()

        tenant_id = get_request_tenant_id(info.context.user)
        return ComplianceAssessment.objects.filter(tenant_id=tenant_id).order_by('-assessed_at')

    @staticmethod
    def resolve_effective_policies(root, info, deployment_id=None, endpoint_id=None, user_id=None, first=None, after=None):
        import json
        from zentinelle.models import Policy

        if not info.context.user.is_authenticated:
            return []

        tenant_id = get_request_tenant_id(info.context.user)
        if not tenant_id:
            return []

        qs = Policy.objects.filter(tenant_id=tenant_id, enabled=True)
        if endpoint_id:
            qs = qs.filter(scope_type__in=['organization', 'sub_organization', 'deployment', 'endpoint'])
        if deployment_id and not endpoint_id:
            qs = qs.filter(scope_type__in=['organization', 'sub_organization', 'deployment'])

        SCOPE_PRIORITY = {'user': 1, 'endpoint': 2, 'deployment': 3, 'sub_organization': 4, 'organization': 5}

        results = []
        for p in qs.order_by('policy_type', 'scope_type'):
            results.append(EffectivePolicyType(
                id=str(p.id),
                name=p.name,
                description=getattr(p, 'description', '') or '',
                policy_type=p.policy_type,
                scope_type=p.scope_type,
                scope_name=p.scope_id or p.scope_type,
                config=json.dumps(p.config) if p.config else '{}',
                priority=SCOPE_PRIORITY.get(p.scope_type, 10),
                enforcement='hard' if not getattr(p, 'fail_open', True) else 'soft',
                enabled=p.enabled,
                inherited_from=None,
                overrides=None,
            ))
        return results

    @staticmethod
    def resolve_policy_graph(root, info, policy_type=None, endpoint_status=None, risk_severity=None, include_incidents=False):
        import json
        from zentinelle.models import Policy, AgentEndpoint, Risk, Incident

        if not info.context.user.is_authenticated:
            return PolicyGraphType(nodes=[], edges=[], node_count=0, edge_count=0)

        tenant_id = get_request_tenant_id(info.context.user)
        if not tenant_id:
            return PolicyGraphType(nodes=[], edges=[], node_count=0, edge_count=0)

        TEAL   = '#08D4B8'
        BLUE   = '#3B5CAA'
        ORANGE = '#FFB547'
        RED    = '#EE5D50'
        DARK_RED = '#E31A1A'

        nodes = []
        edges = []

        # --- Endpoints ---
        ep_qs = AgentEndpoint.objects.filter(tenant_id=tenant_id)
        if endpoint_status:
            ep_qs = ep_qs.filter(status=endpoint_status)
        endpoints = list(ep_qs[:60])
        endpoint_node_ids = {str(ep.id): ep for ep in endpoints}

        for ep in endpoints:
            nodes.append(PolicyGraphNodeType(
                id=f"endpoint:{ep.id}",
                node_type='endpoint',
                label=ep.name or ep.agent_id,
                sub_label=ep.status,
                status=ep.status,
                color=TEAL,
                meta=json.dumps({
                    'agent_id': ep.agent_id,
                    'health': ep.health,
                    'status': ep.status,
                    'href': f'/agents',
                }),
            ))

        # --- Policies ---
        pol_qs = Policy.objects.filter(tenant_id=tenant_id, enabled=True)
        if policy_type:
            pol_qs = pol_qs.filter(policy_type=policy_type)
        policies = list(pol_qs.select_related('scope_endpoint')[:120])

        for pol in policies:
            nodes.append(PolicyGraphNodeType(
                id=f"policy:{pol.id}",
                node_type='policy',
                label=pol.name,
                sub_label=pol.policy_type.replace('_', ' ').title(),
                status='active',
                color=BLUE,
                meta=json.dumps({
                    'policy_type': pol.policy_type,
                    'scope_type': pol.scope_type,
                    'enforcement': pol.enforcement,
                    'href': '/policies',
                }),
            ))

            if pol.scope_type == 'endpoint' and pol.scope_endpoint_id:
                target_id = f"endpoint:{pol.scope_endpoint_id}"
                if str(pol.scope_endpoint_id) in endpoint_node_ids:
                    edges.append(PolicyGraphEdgeType(
                        source=f"policy:{pol.id}",
                        target=target_id,
                        relationship='scoped_to',
                        label='enforces',
                    ))
            elif pol.scope_type == 'organization':
                # Connect org-wide policies to up to 8 endpoints to avoid clutter
                for ep in endpoints[:8]:
                    edges.append(PolicyGraphEdgeType(
                        source=f"policy:{pol.id}",
                        target=f"endpoint:{ep.id}",
                        relationship='org_wide',
                        label='org',
                    ))

        # --- Risks ---
        risk_qs = Risk.objects.filter(tenant_id=tenant_id).prefetch_related('affected_endpoints')
        if risk_severity:
            impact_map = {'low': 1, 'medium': 3, 'high': 4, 'critical': 5}
            min_impact = impact_map.get(risk_severity.lower(), 1)
            risk_qs = risk_qs.filter(impact__gte=min_impact)
        risks = list(risk_qs[:40])

        for risk in risks:
            score = (risk.likelihood or 1) * (risk.impact or 1)
            risk_color = DARK_RED if score >= 20 else RED if score >= 12 else ORANGE
            nodes.append(PolicyGraphNodeType(
                id=f"risk:{risk.id}",
                node_type='risk',
                label=risk.title,
                sub_label=f"L{risk.likelihood}×I{risk.impact}",
                status=risk.status,
                color=risk_color,
                meta=json.dumps({
                    'likelihood': risk.likelihood,
                    'impact': risk.impact,
                    'status': risk.status,
                    'score': score,
                    'href': '/risk',
                }),
            ))

            for ep in risk.affected_endpoints.all():
                if str(ep.id) in endpoint_node_ids:
                    edges.append(PolicyGraphEdgeType(
                        source=f"endpoint:{ep.id}",
                        target=f"risk:{risk.id}",
                        relationship='affects',
                        label='exposes',
                    ))

        # --- Incidents (optional) ---
        if include_incidents:
            inc_qs = Incident.objects.filter(
                tenant_id=tenant_id,
                status__in=['open', 'investigating'],
            ).select_related('risk')[:25]
            risk_ids_in_graph = {f"risk:{r.id}" for r in risks}
            for inc in inc_qs:
                nodes.append(PolicyGraphNodeType(
                    id=f"incident:{inc.id}",
                    node_type='incident',
                    label=inc.title,
                    sub_label=inc.severity,
                    status=inc.status,
                    color=DARK_RED,
                    meta=json.dumps({
                        'severity': inc.severity,
                        'status': inc.status,
                        'href': '/risk',
                    }),
                ))
                if inc.risk_id and f"risk:{inc.risk_id}" in risk_ids_in_graph:
                    edges.append(PolicyGraphEdgeType(
                        source=f"risk:{inc.risk_id}",
                        target=f"incident:{inc.id}",
                        relationship='triggered',
                        label='triggered',
                    ))

        return PolicyGraphType(
            nodes=nodes,
            edges=edges,
            node_count=len(nodes),
            edge_count=len(edges),
        )
