"""
GraphQL Queries for Zentinelle GRC Portal.

Standalone version — no dependency on deployments, organization, or billing apps.
"""
import uuid
from datetime import datetime
from typing import Optional

import strawberry
from strawberry.scalars import JSON
from django.db.models import Q, Count
from zentinelle.schema.mutations.policy_document import PolicyDocumentType

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
    AgentGroupType,
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
    NotificationType,
    UsageMetricsType,
    UsageMetricsSummaryType,
    UsageAlertType,
    UsageTimeSeriesPointType,
    UsageByAgentType,
    ComplianceReportType,
    EffectivePolicyType,
    PromptCategoryType,
    SystemPromptType,
    PolicyGraphNodeType,
    PolicyGraphEdgeType,
    PolicyGraphType,
    ClientCoveIntegrationType,
    AuditAnalyticsType,
    AuditTimelinePointType,
    AuditEventCountType,
    AuditTopAgentType,
)


# Import authorization helpers from centralized module
from .auth_helpers import filter_by_org, get_request_tenant_id, is_internal_admin


# Dashboard Stats Types
@strawberry.type
class AgentStatsType:
    total: int = 0
    active: int = 0
    inactive: int = 0
    healthy: int = 0
    unhealthy: int = 0


@strawberry.type
class PolicyByTypeType:
    type: Optional[str] = None
    count: int = 0


@strawberry.type
class PolicyStatsType:
    total: int = 0
    enabled: int = 0
    disabled: int = 0
    by_type: list[PolicyByTypeType] = strawberry.field(default_factory=list)


@strawberry.type
class ApiUsageType:
    today: int = 0
    this_week: int = 0
    this_month: int = 0
    trend: float = 0.0


@strawberry.type
class RecentActivityType:
    id: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    timestamp: Optional[datetime] = None
    actor: Optional[str] = None


@strawberry.type
class AlertType:
    id: Optional[str] = None
    severity: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None


@strawberry.type
class ChecklistItemStatsType:
    """Inline checklist item for dashboard stats."""
    key: Optional[str] = None
    is_complete: bool = False
    completed_at: Optional[datetime] = None


@strawberry.type
class ChecklistStatsType:
    """Getting started checklist state embedded in dashboard stats."""
    items: list[ChecklistItemStatsType] = strawberry.field(default_factory=list)
    completed_count: int = 0
    total_count: int = 0
    progress_percent: float = 0.0
    is_all_complete: bool = False
    dismissed: bool = False


@strawberry.type
class DashboardStatsType:
    agents: Optional[AgentStatsType] = None
    policies: Optional[PolicyStatsType] = None
    api_usage: Optional[ApiUsageType] = None
    recent_activity: list[RecentActivityType] = strawberry.field(default_factory=list)
    alerts: list[AlertType] = strawberry.field(default_factory=list)
    checklist: Optional[ChecklistStatsType] = None


# Compliance Types - Capability-Based Approach
@strawberry.type
class ComplianceCapabilityType:
    """A compliance capability that Zentinelle can measure/control."""
    id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    capability_type: Optional[str] = None  # 'observe' or 'control'
    enabled: bool = False
    supporting_policies: list[str] = strawberry.field(default_factory=list)
    supporting_rules: list[str] = strawberry.field(default_factory=list)
    enforcement_options: list[str] = strawberry.field(default_factory=list)
    supports_frameworks: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class FrameworkCoverageType:
    """Coverage stats for a compliance framework."""
    id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    # Required capabilities coverage
    required_covered: int = 0
    required_total: int = 0
    required_percentage: float = 0.0
    missing_required: list[str] = strawberry.field(default_factory=list)
    # Total coverage (required + recommended)
    total_covered: int = 0
    total_count: int = 0
    total_percentage: float = 0.0
    missing_recommended: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class ComplianceOverviewType:
    """
    Capability-based compliance overview.

    Shows what Zentinelle can observe/control and how that maps to frameworks.
    """
    # Capabilities by type
    observe_capabilities: list[ComplianceCapabilityType] = strawberry.field(default_factory=list)
    control_capabilities: list[ComplianceCapabilityType] = strawberry.field(default_factory=list)

    # Summary stats
    capabilities_enabled: int = 0
    capabilities_total: int = 0

    # Framework coverage
    framework_coverage: list[FrameworkCoverageType] = strawberry.field(default_factory=list)


# Legacy types kept for backwards compatibility
@strawberry.type
class ComplianceControlType:
    id: Optional[str] = None
    name: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None


@strawberry.type
class ComplianceFrameworkType:
    id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: bool = False
    score: int = 0
    status: Optional[str] = None
    last_checked: Optional[datetime] = None
    controls: list[ComplianceControlType] = strawberry.field(default_factory=list)


@strawberry.type
class ComplianceFindingType:
    id: Optional[str] = None
    title: Optional[str] = None
    severity: Optional[str] = None
    framework: Optional[str] = None
    control: Optional[str] = None
    status: Optional[str] = None
    found_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


@strawberry.type
class ComplianceStatusType:
    overall_score: int = 0
    last_assessment: Optional[datetime] = None
    next_assessment: Optional[datetime] = None
    frameworks: list[ComplianceFrameworkType] = strawberry.field(default_factory=list)
    recent_findings: list[ComplianceFindingType] = strawberry.field(default_factory=list)


# Event Sourcing Types
@strawberry.type
class EventEnvelopeType:
    """Event envelope with full metadata for event sourcing."""
    event_id: Optional[str] = None
    event_type: Optional[str] = None
    category: Optional[str] = None
    version: int = 0
    aggregate_id: Optional[str] = None
    aggregate_type: Optional[str] = None
    sequence_number: int = 0
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    payload: Optional[JSON] = None
    metadata: Optional[JSON] = None


@strawberry.type
class EventStreamType:
    """Stream of events for an aggregate."""
    aggregate_type: Optional[str] = None
    aggregate_id: Optional[str] = None
    events: list[EventEnvelopeType] = strawberry.field(default_factory=list)
    last_sequence: int = 0
    event_count: int = 0


@strawberry.type
class DeadLetterEventType:
    """Event that failed processing and is in the dead letter queue."""
    id: Optional[str] = None
    event_type: Optional[str] = None
    category: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    received_at: Optional[datetime] = None
    last_failed_at: Optional[datetime] = None
    payload: Optional[JSON] = None


@strawberry.type
class DeadLetterQueueStatsType:
    """Statistics about the dead letter queue."""
    total_count: int = 0
    by_category: list[list[str]] = strawberry.field(default_factory=list)
    oldest_event: Optional[datetime] = None


# Policy Options Types (for dynamic UI)
@strawberry.type
class PolicyTypeOptionType:
    """A policy type option with value, label, description, and config schema."""
    value: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    config_schema: Optional[JSON] = None


@strawberry.type
class ScopeTypeOptionType:
    """A scope type option with value and label."""
    value: Optional[str] = None
    label: Optional[str] = None


@strawberry.type
class EnforcementOptionType:
    """An enforcement level option with value, label, and description."""
    value: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None


@strawberry.type
class PolicyOptionsType:
    """All policy form options from the backend."""
    policy_types: list[PolicyTypeOptionType] = strawberry.field(default_factory=list)
    scope_types: list[ScopeTypeOptionType] = strawberry.field(default_factory=list)
    enforcement_levels: list[EnforcementOptionType] = strawberry.field(default_factory=list)


# Risk/Incident Options Types (for dynamic UI)
@strawberry.type
class LabelValueOptionType:
    """Generic option with value and label."""
    value: Optional[str] = None
    label: Optional[str] = None


@strawberry.type
class RiskOptionsType:
    """All risk form options from the backend."""
    categories: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    statuses: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    likelihoods: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    impacts: list[LabelValueOptionType] = strawberry.field(default_factory=list)


@strawberry.type
class IncidentOptionsType:
    """All incident form options from the backend."""
    incident_types: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    severities: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    statuses: list[LabelValueOptionType] = strawberry.field(default_factory=list)


@strawberry.type
class ContentRuleOptionsType:
    """All content rule form options from the backend."""
    rule_types: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    severities: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    enforcements: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    scan_modes: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    scope_types: list[LabelValueOptionType] = strawberry.field(default_factory=list)


@strawberry.type
class RetentionOptionsType:
    """All retention policy form options from the backend."""
    entity_types: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    expiration_actions: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    compliance_requirements: list[LabelValueOptionType] = strawberry.field(default_factory=list)


@strawberry.type
class LegalHoldOptionsType:
    """All legal hold form options from the backend."""
    hold_types: list[LabelValueOptionType] = strawberry.field(default_factory=list)
    statuses: list[LabelValueOptionType] = strawberry.field(default_factory=list)


# Note: AI Key Types (OrganizationAIKeyType, DeploymentAIKeyType, AIProviderStatusType,
# DeploymentAIProvidersType) are now in deployments.schema.queries

# AI Usage Types
@strawberry.type
class AIUsageRecordType:
    """Individual AI usage record."""
    id: Optional[strawberry.ID] = None
    user_identifier: Optional[str] = None
    provider: Optional[str] = None
    provider_display: Optional[str] = None
    model: Optional[str] = None
    request_type: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    input_cost_usd: float = 0.0
    output_cost_usd: float = 0.0
    total_cost_usd: float = 0.0
    latency_ms: int = 0
    timestamp: Optional[datetime] = None


@strawberry.type
class AIUsageByProviderType:
    """Usage aggregated by provider."""
    provider: Optional[str] = None
    provider_display: Optional[str] = None
    total_requests: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0


@strawberry.type
class AIUsageByUserType:
    """Usage aggregated by user."""
    user_identifier: Optional[str] = None
    total_requests: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0


@strawberry.type
class AIUsageByModelType:
    """Usage aggregated by model."""
    provider: Optional[str] = None
    model: Optional[str] = None
    total_requests: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0


@strawberry.type
class AIUsageSummaryType:
    """Summary of AI usage for an organization."""
    # Time period
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None

    # Totals
    total_requests: int = 0
    total_tokens: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cost_usd: float = 0.0

    # Breakdowns
    by_provider: list[AIUsageByProviderType] = strawberry.field(default_factory=list)
    by_user: list[AIUsageByUserType] = strawberry.field(default_factory=list)
    by_model: list[AIUsageByModelType] = strawberry.field(default_factory=list)

    # Top users
    top_users: list[AIUsageByUserType] = strawberry.field(default_factory=list)

    # Recent records
    recent_records: list[AIUsageRecordType] = strawberry.field(default_factory=list)


# AI Budget Types
@strawberry.type
class AIBudgetStatusType:
    """AI budget status for an organization."""
    # Budget limits
    budget_usd: Optional[float] = strawberry.field(default=None, description="Monthly budget in USD (null = unlimited)")
    spent_usd: float = strawberry.field(default=0.0, description="Amount spent this period")
    remaining_usd: float = strawberry.field(default=0.0, description="Remaining budget")
    percentage_used: float = strawberry.field(default=0.0, description="Percentage of budget used")

    # Status flags
    has_budget: bool = strawberry.field(default=False, description="Whether budget is configured")
    is_exceeded: bool = strawberry.field(default=False, description="Whether budget is exceeded")
    should_block: bool = strawberry.field(default=False, description="Whether requests should be blocked")

    # Policy
    overage_policy: Optional[str] = strawberry.field(default=None, description="What happens when budget exceeded")
    overage_policy_display: Optional[str] = None
    has_payment_method: bool = strawberry.field(default=False, description="Whether payment method on file")

    # Alerts
    alert_threshold: int = strawberry.field(default=0, description="Alert threshold percentage")
    alert_sent: bool = strawberry.field(default=False, description="Whether alert sent this period")

    # Period
    period_start: Optional[datetime] = strawberry.field(default=None, description="Start of current billing period")

    # Per-provider limits (optional)
    provider_limits: Optional[JSON] = strawberry.field(default=None, description="Per-provider budget limits")


# Monitoring Stats Types
@strawberry.type
class ViolationByTypeType:
    rule_type: Optional[str] = None
    count: int = 0


@strawberry.type
class ViolationBySeverityType:
    severity: Optional[str] = None
    count: int = 0


@strawberry.type
class MonitoringStatsType:
    """Aggregated monitoring statistics."""
    # Interaction stats
    total_interactions: int = 0
    interactions_today: int = 0
    interactions_this_hour: int = 0

    # Scan stats
    total_scans: int = 0
    scans_with_violations: int = 0
    scans_blocked: int = 0

    # Violation breakdowns
    violations_by_type: list[ViolationByTypeType] = strawberry.field(default_factory=list)
    violations_by_severity: list[ViolationBySeverityType] = strawberry.field(default_factory=list)

    # Token and cost
    total_tokens_today: int = 0
    total_cost_today: float = 0.0

    # Performance
    avg_latency_ms: float = 0.0
    avg_scan_duration_ms: float = 0.0


# Risk Stats Types
@strawberry.type
class RiskByLevelType:
    level: Optional[str] = None
    count: int = 0


@strawberry.type
class RiskByCategoryType:
    category: Optional[str] = None
    count: int = 0


@strawberry.type
class IncidentBySeverityType:
    severity: Optional[str] = None
    count: int = 0


@strawberry.type
class IncidentByStatusType:
    status: Optional[str] = None
    count: int = 0


@strawberry.type
class RiskStatsType:
    """Aggregated risk and incident statistics."""
    # Risk stats
    total_risks: int = 0
    open_risks: int = 0
    critical_risks: int = 0
    high_risks: int = 0
    risks_by_level: list[RiskByLevelType] = strawberry.field(default_factory=list)
    risks_by_category: list[RiskByCategoryType] = strawberry.field(default_factory=list)

    # Incident stats
    total_incidents: int = 0
    open_incidents: int = 0
    incidents_today: int = 0
    incidents_by_severity: list[IncidentBySeverityType] = strawberry.field(default_factory=list)
    incidents_by_status: list[IncidentByStatusType] = strawberry.field(default_factory=list)

    # SLA stats
    sla_met_count: int = 0
    sla_breached_count: int = 0


# Tool Usage Stats Types
@strawberry.type
class ToolUsageByModelType:
    """AI usage breakdown by model."""
    model: Optional[str] = None
    provider: Optional[str] = None
    requests: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


@strawberry.type
class ToolUsageStatsType:
    """Usage statistics for a tool in PLATFORM mode."""
    tool_type: Optional[str] = None
    tool_type_display: Optional[str] = None

    # Period info
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None

    # Request counts
    total_requests: int = 0
    requests_today: int = 0
    requests_this_week: int = 0
    requests_this_month: int = 0

    # Token counts
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0

    # Cost estimates (for PLATFORM mode billing)
    estimated_cost: float = 0.0

    # Breakdown by model
    by_model: list[ToolUsageByModelType] = strawberry.field(default_factory=list)

    # Unique users
    unique_users: int = 0
    unique_users_today: int = 0


# License Compliance Types
@strawberry.type
class LicenseUsageSummaryType:
    """Summary of license usage."""
    current_users: int = 0
    max_users: int = 0
    users_percent: float = 0.0
    current_deployments: int = 0
    max_deployments: int = 0
    deployments_percent: float = 0.0
    current_agents: int = 0
    max_agents: int = 0
    agents_percent: float = 0.0
    is_over_limit: bool = False
    over_limit_details: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class LicenseComplianceSummaryType:
    """Summary of license compliance status."""
    status: Optional[str] = None  # 'compliant', 'non_compliant', 'no_license'
    compliance_score: float = 0.0
    has_violations: bool = False
    open_violations: int = 0
    # License info
    license_type: Optional[str] = None
    license_valid_until: Optional[datetime] = None
    is_expired: bool = False
    # Usage summary
    usage: Optional[LicenseUsageSummaryType] = None


@strawberry.type
class LicenseViolationSummaryType:
    """Summary of violations."""
    total_count: int = 0
    open_count: int = 0
    resolved_count: int = 0
    by_type: Optional[JSON] = None
    by_severity: Optional[JSON] = None


@strawberry.type
class SimulatePolicyResultType:
    """Result of a policy simulation dry-run."""
    total_events: int = 0
    would_block: int = 0
    would_warn: int = 0
    would_pass: int = 0
    impact_percent: float = 0.0
    blocked_samples: list[str] = strawberry.field(default_factory=list)
    simulated_policy_type: Optional[str] = None
    lookback_days: int = 0


@strawberry.type
class Query:
    """Zentinelle GraphQL queries."""

    # Policy Options (for dynamic UI)
    @strawberry.field
    def policy_options(self, info: strawberry.types.Info) -> Optional[PolicyOptionsType]:
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

    # Risk/Incident Options (for dynamic UI)
    @strawberry.field
    def risk_options(self, info: strawberry.types.Info) -> Optional[RiskOptionsType]:
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

    @strawberry.field
    def incident_options(self, info: strawberry.types.Info) -> Optional[IncidentOptionsType]:
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

    @strawberry.field
    def content_rule_options(self, info: strawberry.types.Info) -> Optional[ContentRuleOptionsType]:
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

    @strawberry.field
    def retention_options(self, info: strawberry.types.Info) -> Optional[RetentionOptionsType]:
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

    @strawberry.field
    def legal_hold_options(self, info: strawberry.types.Info) -> Optional[LegalHoldOptionsType]:
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

    # Compliance - Capability-Based
    @strawberry.field
    def compliance_overview(self, info: strawberry.types.Info) -> Optional[ComplianceOverviewType]:
        """
        Get capability-based compliance overview.

        Shows what Zentinelle can observe/control and maps to framework coverage.
        """
        if not info.context.request.user.is_authenticated:
            return None

        from zentinelle.models.compliance import (
            COMPLIANCE_CAPABILITIES,
            FRAMEWORK_REQUIREMENTS,
            get_capability_status,
            get_framework_coverage,
        )

        # Get user's tenant
        user = info.context.request.user
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

    # Compliance - Legacy
    @strawberry.field
    def compliance_status(self, info: strawberry.types.Info) -> Optional[ComplianceStatusType]:
        """Get compliance status overview."""
        if not info.context.request.user.is_authenticated:
            return None

        from django.utils import timezone
        from datetime import timedelta
        from zentinelle.models import ComplianceAlert, ContentViolation

        user = info.context.request.user
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

    # Note: Deployment queries (deployment, deployments, junohub_config, junohub_configs,
    # terraform_provision, terraform_provisions, organization_ai_keys, deployment_ai_keys,
    # deployment_ai_providers) are now in deployments.schema.queries.DeploymentsQuery

    # Agent Groups
    @strawberry.field
    def agent_groups(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        tier: Optional[str] = None,
    ) -> list[AgentGroupType]:
        from zentinelle.models.agent_group import AgentGroup
        tenant_id = get_request_tenant_id(info.context.request.user)
        qs = AgentGroup.objects.filter(tenant_id=tenant_id)
        if search:
            qs = qs.filter(name__icontains=search)
        if tier:
            qs = qs.filter(tier=tier)
        return qs

    @strawberry.field
    def agent_group(
        self,
        info: strawberry.types.Info,
        id: Optional[uuid.UUID] = None,
    ) -> Optional[AgentGroupType]:
        from zentinelle.models.agent_group import AgentGroup
        tenant_id = get_request_tenant_id(info.context.request.user)
        return AgentGroup.objects.filter(id=id, tenant_id=tenant_id).first()

    # Endpoints
    @strawberry.field
    def endpoint(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[AgentEndpointType]:
        if not info.context.request.user.is_authenticated:
            return None
        qs = filter_by_org(
            AgentEndpoint.objects.all(),
            info.context.request.user
        )
        return qs.filter(id=id).first()

    @strawberry.field
    def endpoints(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        status: Optional[str] = None,
        agent_type: Optional[str] = None,
        deployment_id: Optional[strawberry.ID] = None,
    ) -> list[AgentEndpointType]:
        if not info.context.request.user.is_authenticated:
            return AgentEndpoint.objects.none()

        qs = filter_by_org(
            AgentEndpoint.objects.all(),
            info.context.request.user
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

    # Policies
    @strawberry.field
    def policy(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[PolicyType]:
        if not info.context.request.user.is_authenticated:
            return None
        qs = filter_by_org(Policy.objects.all(), info.context.request.user)
        return qs.filter(id=id).first()

    @strawberry.field
    def policies(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        policy_type: Optional[str] = None,
        scope_type: Optional[str] = None,
    ) -> list[PolicyType]:
        if not info.context.request.user.is_authenticated:
            return Policy.objects.none()

        qs = filter_by_org(Policy.objects.all(), info.context.request.user)
        if search:
            qs = qs.filter(Q(name__icontains=search))
        if policy_type:
            qs = qs.filter(policy_type=policy_type)
        if scope_type:
            qs = qs.filter(scope_type=scope_type)
        return qs

    @strawberry.field(description="Return all revisions for a given policy, ordered by version descending.")
    def policy_revisions(
        self,
        info: strawberry.types.Info,
        policy_id: str,
    ) -> list[PolicyRevisionType]:
        """Return all revisions for a given policy, ordered by version descending."""
        if not info.context.request.user.is_authenticated:
            return PolicyRevision.objects.none()
        # Try to extract raw UUID from the policy_id
        try:
            uuid.UUID(policy_id)
        except ValueError:
            try:
                from graphql_relay import from_global_id
                _type, raw_id = from_global_id(policy_id)
                if raw_id:
                    policy_id = raw_id
            except Exception:
                pass
        # Ensure the caller can see the parent policy
        policy_qs = filter_by_org(Policy.objects.all(), info.context.request.user)
        if not policy_qs.filter(id=policy_id).exists():
            return PolicyRevision.objects.none()
        return PolicyRevision.objects.filter(policy_id=policy_id).order_by('-version')

    # Policy Simulation (#27)
    @strawberry.field(description="Dry-run a proposed policy config against historical events")
    def simulate_policy(
        self,
        info: strawberry.types.Info,
        policy_type: str,
        config: JSON,
        enforcement: Optional[str] = 'enforce',
        lookback_days: Optional[int] = 7,
    ) -> Optional[SimulatePolicyResultType]:
        """Dry-run a proposed policy against historical events."""
        if not info.context.request.user.is_authenticated:
            return None

        from zentinelle.services.policy_simulator import simulate_policy
        import json

        tenant_id = get_request_tenant_id(info.context.request.user)
        if not tenant_id:
            return None

        # config may arrive as a JSON string
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

    # Events
    @strawberry.field
    def events(
        self,
        info: strawberry.types.Info,
        event_type: Optional[str] = None,
        category: Optional[str] = None,
        endpoint_id: Optional[strawberry.ID] = None,
        user_id: Optional[str] = None,
    ) -> list[EventType]:
        if not info.context.request.user.is_authenticated:
            return Event.objects.none()

        qs = filter_by_org(Event.objects.all(), info.context.request.user).order_by('-occurred_at')
        if event_type:
            qs = qs.filter(event_type=event_type)
        if category:
            qs = qs.filter(event_category=category)
        if endpoint_id:
            qs = qs.filter(endpoint_id=endpoint_id)
        if user_id:
            qs = qs.filter(user_identifier=user_id)
        return qs

    # Audit Logs
    @strawberry.field
    def audit_logs(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        actor: Optional[str] = None,
        action: Optional[str] = None,
        resource: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[AuditLogType]:
        if not info.context.request.user.is_authenticated:
            return AuditLog.objects.none()

        qs = filter_by_org(AuditLog.objects.all(), info.context.request.user).order_by('-timestamp')
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

    @strawberry.field(description="ClickHouse-backed analytics for the audit logs page.")
    def audit_analytics(
        self,
        info: strawberry.types.Info,
        days: int = 7,
    ) -> Optional[AuditAnalyticsType]:
        """Audit analytics from ClickHouse (if available) or PostgreSQL fallback."""
        if not info.context.request.user.is_authenticated:
            return None

        tenant_id = get_request_tenant_id(info.context.request.user)

        from zentinelle.services import clickhouse_service
        if clickhouse_service.is_enabled():
            return self._audit_analytics_clickhouse(clickhouse_service, tenant_id, days)

        return self._audit_analytics_postgres(tenant_id, days)

    def _audit_analytics_clickhouse(self, ch, tenant_id, days):
        timeline_rows = ch.event_timeline(days=days, granularity='day', organization_id=tenant_id)
        by_type_rows = ch.event_counts_by_type(days=days, organization_id=tenant_id)
        top_agents_rows = ch.top_agents_by_event_count(days=days, organization_id=tenant_id)

        return AuditAnalyticsType(
            timeline=[AuditTimelinePointType(bucket=r.get('timestamp'), event_type=r.get('event_type'), count=r.get('count', 0)) for r in timeline_rows],
            by_type=[AuditEventCountType(event_type=r.get('event_type', ''), count=r.get('count', 0)) for r in by_type_rows],
            top_agents=[AuditTopAgentType(agent_id=r.get('agent_id', ''), event_count=r.get('event_count', 0)) for r in top_agents_rows],
        )

    @staticmethod
    def _audit_analytics_postgres(tenant_id, days):
        from django.utils import timezone
        from datetime import timedelta
        from zentinelle.models import AuditLog

        cutoff = timezone.now() - timedelta(days=days)
        base_qs = AuditLog.objects.filter(tenant_id=tenant_id, timestamp__gte=cutoff)

        by_type_qs = base_qs.values('action').annotate(count=Count('id')).order_by('-count')
        by_type = [AuditEventCountType(event_type=r['action'], count=r['count']) for r in by_type_qs]

        timeline_qs = base_qs.extra(
            select={'day': "DATE(timestamp)"}
        ).values('day', 'action').annotate(count=Count('id')).order_by('day')
        timeline = [AuditTimelinePointType(bucket=r['day'], event_type=r['action'], count=r['count']) for r in timeline_qs]

        top_agents_qs = (
            Event.objects.filter(tenant_id=tenant_id, occurred_at__gte=cutoff)
            .values('endpoint__agent_id')
            .annotate(event_count=Count('id'))
            .order_by('-event_count')[:10]
        )
        top_agents = [AuditTopAgentType(agent_id=r['endpoint__agent_id'] or '', event_count=r['event_count']) for r in top_agents_qs]

        return AuditAnalyticsType(timeline=timeline, by_type=by_type, top_agents=top_agents)

    # Note: resolve_junohub_config, resolve_junohub_configs, resolve_terraform_provision,
    # and resolve_terraform_provisions are now in deployments.schema.queries.DeploymentsQuery

    # Dashboard Stats
    @strawberry.field
    def dashboard_stats(self, info: strawberry.types.Info) -> Optional[DashboardStatsType]:
        """Resolve dashboard statistics from real data."""
        if not info.context.request.user.is_authenticated:
            return None

        from django.utils import timezone
        from datetime import timedelta

        user = info.context.request.user
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
            api_usage=api_usage,
            recent_activity=recent_activity,
            alerts=alerts,
            checklist=checklist_stats,
        )

    # ==========================================================================
    # AI Provider Resolvers
    # ==========================================================================

    @strawberry.field
    def ai_provider(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
        slug: Optional[str] = None,
    ) -> Optional[AIProviderType]:
        if not info.context.request.user.is_authenticated:
            return None
        if id:
            return AIProvider.objects.filter(id=id).first()
        if slug:
            return AIProvider.objects.filter(slug=slug).first()
        return None

    @strawberry.field
    def ai_providers(
        self,
        info: strawberry.types.Info,
        active_only: Optional[bool] = None,
        supports_managed_keys: Optional[bool] = None,
    ) -> list[AIProviderType]:
        if not info.context.request.user.is_authenticated:
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

    @strawberry.field
    def api_key(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[APIKeyType]:
        if not info.context.request.user.is_authenticated:
            return None
        user = info.context.request.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return None
        if is_internal_admin(user):
            return APIKey.objects.filter(id=id).first()
        return APIKey.objects.filter(id=id, tenant_id=tenant_id).first()

    @strawberry.field
    def api_keys(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[APIKeyType]:
        if not info.context.request.user.is_authenticated:
            return APIKey.objects.none()

        user = info.context.request.user
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
    # AI Usage
    # ==========================================================================

    @strawberry.field(description="Get AI usage summary for organization or deployment")
    def ai_usage_summary(
        self,
        info: strawberry.types.Info,
        organization_id: strawberry.ID,
        deployment_id: Optional[uuid.UUID] = None,
        days: int = 30,
    ) -> Optional[AIUsageSummaryType]:
        """Get AI usage summary. Not available in standalone mode (requires billing app)."""
        return None

    # AI Budget Status
    @strawberry.field(description="Get AI budget status for organization")
    def ai_budget_status(
        self,
        info: strawberry.types.Info,
        organization_id: strawberry.ID,
    ) -> Optional[AIBudgetStatusType]:
        """Get AI budget status. Not available in standalone mode (requires organization app)."""
        return None

    # ==========================================================================
    # Model Registry Resolvers
    # ==========================================================================

    @strawberry.field
    def ai_model(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[AIModelType]:
        if not info.context.request.user.is_authenticated:
            return None
        # AI Models are global, no org filtering needed
        return AIModel.objects.filter(id=id, is_available=True).first()

    @strawberry.field
    def ai_models(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        provider_slug: Optional[str] = None,
        model_type: Optional[str] = None,
        risk_level: Optional[str] = None,
        available_only: Optional[bool] = None,
    ) -> list[AIModelType]:
        if not info.context.request.user.is_authenticated:
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

    @strawberry.field
    def model_approval(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[OrganizationModelApprovalType]:
        if not info.context.request.user.is_authenticated:
            return None
        user = info.context.request.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return None
        qs = filter_by_org(
            OrganizationModelApproval.objects.select_related('model', 'model__provider'),
            user
        )
        return qs.filter(id=id).first()

    @strawberry.field
    def model_approvals(
        self,
        info: strawberry.types.Info,
        status: Optional[str] = None,
        provider_slug: Optional[str] = None,
    ) -> list[OrganizationModelApprovalType]:
        if not info.context.request.user.is_authenticated:
            return OrganizationModelApproval.objects.none()

        user = info.context.request.user
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
    # Event Sourcing
    # ==========================================================================

    @strawberry.field
    def event_stream(
        self,
        info: strawberry.types.Info,
        aggregate_type: str,
        aggregate_id: str,
        from_sequence: Optional[int] = 0,
    ) -> Optional[EventStreamType]:
        """Get event stream for an aggregate."""
        if not info.context.request.user.is_authenticated:
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

    @strawberry.field
    def events_by_correlation(
        self,
        info: strawberry.types.Info,
        correlation_id: str,
    ) -> list[EventEnvelopeType]:
        """Get all events in a correlation chain."""
        if not info.context.request.user.is_authenticated:
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

    @strawberry.field
    def dead_letter_queue(
        self,
        info: strawberry.types.Info,
        limit: Optional[int] = 50,
    ) -> list[DeadLetterEventType]:
        """Get events in the dead letter queue."""
        if not info.context.request.user.is_authenticated:
            return []

        from zentinelle.services.event_store import dead_letter_queue

        # Get tenant from user context
        user = info.context.request.user
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

    @strawberry.field
    def dead_letter_queue_stats(self, info: strawberry.types.Info) -> Optional[DeadLetterQueueStatsType]:
        """Get statistics about the dead letter queue."""
        if not info.context.request.user.is_authenticated:
            return None

        from django.db.models import Count, Min

        user = info.context.request.user
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

    @strawberry.field
    def content_rule(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[ContentRuleType]:
        if not info.context.request.user.is_authenticated:
            return None
        user = info.context.request.user
        qs = filter_by_org(ContentRule.objects.all(), user)
        return qs.filter(id=id).first()

    @strawberry.field
    def content_rules(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        rule_type: Optional[str] = None,
        severity: Optional[str] = None,
        enforcement: Optional[str] = None,
        enabled: Optional[bool] = None,
    ) -> list[ContentRuleType]:
        if not info.context.request.user.is_authenticated:
            return ContentRule.objects.none()

        user = info.context.request.user
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

    @strawberry.field
    def content_scan(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[ContentScanType]:
        if not info.context.request.user.is_authenticated:
            return None
        user = info.context.request.user
        qs = filter_by_org(ContentScan.objects.all(), user)
        return qs.filter(id=id).first()

    @strawberry.field
    def content_scans(
        self,
        info: strawberry.types.Info,
        user_identifier: Optional[str] = None,
        endpoint_id: Optional[strawberry.ID] = None,
        has_violations: Optional[bool] = None,
        content_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[ContentScanType]:
        if not info.context.request.user.is_authenticated:
            return ContentScan.objects.none()

        user = info.context.request.user
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

    @strawberry.field
    def content_violations(
        self,
        info: strawberry.types.Info,
        rule_type: Optional[str] = None,
        severity: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[ContentViolationType]:
        if not info.context.request.user.is_authenticated:
            return ContentViolation.objects.none()

        user = info.context.request.user
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

    @strawberry.field
    def compliance_alerts(
        self,
        info: strawberry.types.Info,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        alert_type: Optional[str] = None,
    ) -> list[ComplianceAlertType]:
        if not info.context.request.user.is_authenticated:
            return ComplianceAlert.objects.none()

        user = info.context.request.user
        qs = filter_by_org(ComplianceAlert.objects.all(), user)

        if status:
            qs = qs.filter(status=status)
        if severity:
            qs = qs.filter(severity=severity)
        if alert_type:
            qs = qs.filter(alert_type=alert_type)

        return qs.order_by('-created_at')

    @strawberry.field
    def interaction_log(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[InteractionLogType]:
        if not info.context.request.user.is_authenticated:
            return None
        user = info.context.request.user
        qs = filter_by_org(InteractionLog.objects.all(), user)
        return qs.filter(id=id).first()

    @strawberry.field
    def interaction_logs(
        self,
        info: strawberry.types.Info,
        user_identifier: Optional[str] = None,
        endpoint_id: Optional[strawberry.ID] = None,
        ai_provider: Optional[str] = None,
        ai_model: Optional[str] = None,
        interaction_type: Optional[str] = None,
        has_violations: Optional[bool] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[InteractionLogType]:
        if not info.context.request.user.is_authenticated:
            return InteractionLog.objects.none()

        user = info.context.request.user
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

    # Monitoring Stats
    @strawberry.field
    def monitoring_stats(self, info: strawberry.types.Info) -> Optional[MonitoringStatsType]:
        """Get aggregated monitoring statistics."""
        if not info.context.request.user.is_authenticated:
            return None

        from django.utils import timezone
        from datetime import timedelta
        from django.db.models import Avg, Sum

        user = info.context.request.user
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

    @strawberry.field
    def risk(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[RiskType]:
        if not info.context.request.user.is_authenticated:
            return None
        user = info.context.request.user
        qs = filter_by_org(Risk.objects.all(), user)
        return qs.filter(id=id).first()

    @strawberry.field
    def risks(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
        risk_level: Optional[str] = None,
    ) -> list[RiskType]:
        if not info.context.request.user.is_authenticated:
            return Risk.objects.none()

        user = info.context.request.user
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

    @strawberry.field
    def incident(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[IncidentType]:
        if not info.context.request.user.is_authenticated:
            return None
        user = info.context.request.user
        qs = filter_by_org(Incident.objects.all(), user)
        return qs.filter(id=id).first()

    @strawberry.field
    def incidents(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        incident_type: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[IncidentType]:
        if not info.context.request.user.is_authenticated:
            return Incident.objects.none()

        user = info.context.request.user
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

    @strawberry.field
    def risk_stats(self, info: strawberry.types.Info) -> Optional[RiskStatsType]:
        """Get aggregated risk and incident statistics."""
        from django.utils import timezone

        user = info.context.request.user

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
    @strawberry.field
    def retention_policy(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[RetentionPolicyType]:
        if not info.context.request.user.is_authenticated:
            return None
        from zentinelle.models import RetentionPolicy
        qs = filter_by_org(RetentionPolicy.objects.all(), info.context.request.user)
        return qs.filter(id=id).first() if id else None

    @strawberry.field
    def retention_policies(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        entity_type: Optional[str] = None,
        enabled: Optional[bool] = None,
    ) -> list[RetentionPolicyType]:
        from zentinelle.models import RetentionPolicy
        if not info.context.request.user.is_authenticated:
            return RetentionPolicy.objects.none()
        qs = filter_by_org(RetentionPolicy.objects.all(), info.context.request.user)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        if enabled is not None:
            qs = qs.filter(enabled=enabled)
        return qs

    # Legal Hold resolvers
    @strawberry.field
    def legal_hold(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[LegalHoldType]:
        if not info.context.request.user.is_authenticated:
            return None
        from zentinelle.models import LegalHold
        qs = filter_by_org(LegalHold.objects.all(), info.context.request.user)
        return qs.filter(id=id).first() if id else None

    @strawberry.field
    def legal_holds(
        self,
        info: strawberry.types.Info,
        hold_type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[LegalHoldType]:
        from zentinelle.models import LegalHold
        if not info.context.request.user.is_authenticated:
            return LegalHold.objects.none()
        qs = filter_by_org(LegalHold.objects.all(), info.context.request.user)
        if hold_type:
            qs = qs.filter(hold_type=hold_type)
        if status:
            qs = qs.filter(status=status)
        return qs

    # Policy Document resolvers
    @strawberry.field
    def policy_document(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[PolicyDocumentType]:
        if not info.context.request.user.is_authenticated:
            return None
        user = info.context.request.user
        qs = filter_by_org(PolicyDocument.objects.all(), user)
        return qs.filter(id=id).first()

    @strawberry.field
    def policy_documents(
        self,
        info: strawberry.types.Info,
        search: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[PolicyDocumentType]:
        if not info.context.request.user.is_authenticated:
            return []

        user = info.context.request.user
        qs = filter_by_org(PolicyDocument.objects.all(), user)

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if status:
            qs = qs.filter(status=status)

        return qs.order_by('-created_at')

    # Note: resolve_organization_ai_keys, resolve_deployment_ai_keys, and
    # resolve_deployment_ai_providers are now in deployments.schema.queries.DeploymentsQuery

    # ==========================================================================
    # License Compliance Resolvers
    # ==========================================================================

    @strawberry.field(description="Get license compliance summary for an organization")
    def license_compliance_summary(
        self,
        info: strawberry.types.Info,
        organization_id: Optional[uuid.UUID] = None,
    ) -> Optional[LicenseComplianceSummaryType]:
        """Get license compliance summary. Not available in standalone mode (requires organization app)."""
        return None

    @strawberry.field
    def license_compliance_report(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[LicenseComplianceReportType]:
        """Get a single compliance report by ID."""
        if not info.context.request.user.is_authenticated:
            return None

        user = info.context.request.user
        qs = filter_by_org(LicenseComplianceReport.objects.all(), user)
        return qs.filter(id=id).first()

    @strawberry.field
    def license_compliance_reports(
        self,
        info: strawberry.types.Info,
        report_type: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[LicenseComplianceReportType]:
        """Get compliance reports for organization."""
        if not info.context.request.user.is_authenticated:
            return LicenseComplianceReport.objects.none()

        user = info.context.request.user
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

    @strawberry.field
    def license_compliance_violation(
        self,
        info: strawberry.types.Info,
        id: Optional[strawberry.ID] = None,
    ) -> Optional[LicenseComplianceViolationGraphType]:
        """Get a single compliance violation by ID."""
        if not info.context.request.user.is_authenticated:
            return None

        user = info.context.request.user
        qs = filter_by_org(LicenseComplianceViolation.objects.all(), user)
        return qs.filter(id=id).first()

    @strawberry.field
    def license_compliance_violations(
        self,
        info: strawberry.types.Info,
        violation_type: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[LicenseComplianceViolationGraphType]:
        """Get compliance violations for organization."""
        if not info.context.request.user.is_authenticated:
            return LicenseComplianceViolation.objects.none()

        user = info.context.request.user
        qs = filter_by_org(LicenseComplianceViolation.objects.all(), user)

        if violation_type:
            qs = qs.filter(violation_type=violation_type)
        if severity:
            qs = qs.filter(severity=severity)
        if status:
            qs = qs.filter(status=status)

        return qs.order_by('-detected_at')

    @strawberry.field(description="Get violation summary for an organization")
    def license_violation_summary(
        self,
        info: strawberry.types.Info,
        organization_id: Optional[uuid.UUID] = None,
        days: int = 30,
    ) -> Optional[LicenseViolationSummaryType]:
        """Get violation summary. Not available in standalone mode (requires organization app)."""
        return None

    # Organization settings (standalone stub)
    @strawberry.field
    def my_organization(self, info: strawberry.types.Info) -> Optional[OrganizationType]:
        """Return the organization object for the current tenant, backed by TenantConfig."""
        from zentinelle.models.tenant_config import TenantConfig
        tenant_id = get_request_tenant_id(info.context.request.user) or "default"
        config, _ = TenantConfig.objects.get_or_create(tenant_id=tenant_id)
        return OrganizationType(
            id=tenant_id,
            name=config.name,
            slug=tenant_id,
            tier="standard",
            website="",
            deployment_model="standalone",
            zentinelle_tier="community",
            ai_budget_usd=None,
            ai_budget_spent_usd=0.0,
            overage_policy="block",
            ai_budget_alert_threshold=0.8,
            settings=config.settings,
            created_at=config.updated_at,
        )

    # Client Cove Integration
    @strawberry.field
    def client_cove_integration(self, info: strawberry.types.Info) -> Optional[ClientCoveIntegrationType]:
        from zentinelle.models.integration import ClientCoveIntegration
        tenant_id = get_request_tenant_id(info.context.request.user) or 'default'
        return ClientCoveIntegration.objects.filter(tenant_id=tenant_id).first()

    # Notifications (stub)
    @strawberry.field
    def notifications(
        self,
        info: strawberry.types.Info,
        first: Optional[int] = None,
        after: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[NotificationType]:
        from zentinelle.models.notification import Notification
        tenant_id = get_request_tenant_id(info.context.request.user)
        qs = Notification.objects.filter(tenant_id=tenant_id)
        if status:
            qs = qs.filter(status=status)
        return qs

    @strawberry.field
    def usage_metrics(
        self,
        info: strawberry.types.Info,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        granularity: Optional[str] = None,
    ) -> Optional[UsageMetricsType]:
        from zentinelle.models import InteractionLog, AgentEndpoint
        from django.db.models import Sum, Count
        from django.db.models.functions import TruncDay
        from django.utils import timezone
        from datetime import timedelta

        if not info.context.request.user.is_authenticated:
            return UsageMetricsType(
                summary=UsageMetricsSummaryType(total_api_calls=0, total_tokens=0, total_cost=0.0, active_agents=0, storage_used_mb=0.0),
                time_series=[], by_agent=[], by_endpoint=[],
            )

        tenant_id = get_request_tenant_id(info.context.request.user)

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

    # System Prompts (stub -- prompt library not yet implemented in standalone)
    @strawberry.field
    def prompt_categories(
        self,
        info: strawberry.types.Info,
        active_only: Optional[bool] = None,
    ) -> list[PromptCategoryType]:
        from zentinelle.models import PromptCategory
        qs = PromptCategory.objects.all()
        if active_only:
            qs = qs.filter(is_active=True)
        return list(qs)

    @strawberry.field
    def system_prompts(
        self,
        info: strawberry.types.Info,
        first: Optional[int] = None,
        after: Optional[str] = None,
        search: Optional[str] = None,
        category_slug: Optional[str] = None,
        system_prompt_type: Optional[str] = None,
        provider: Optional[str] = None,
        tag_slugs: Optional[list[str]] = None,
        featured_only: Optional[bool] = None,
        verified_only: Optional[bool] = None,
        favorites_only: Optional[bool] = None,
    ) -> list[SystemPromptType]:
        from zentinelle.models import SystemPrompt
        from django.db.models import Q

        if not info.context.request.user.is_authenticated:
            return SystemPrompt.objects.none()

        tenant_id = get_request_tenant_id(info.context.request.user)

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

    @strawberry.field
    def system_prompt(
        self,
        info: strawberry.types.Info,
        id: Optional[uuid.UUID] = None,
        slug: Optional[str] = None,
    ) -> Optional[SystemPromptType]:
        from zentinelle.models import SystemPrompt
        from django.db.models import Q

        if not info.context.request.user.is_authenticated:
            return None

        tenant_id = get_request_tenant_id(info.context.request.user)
        visible = Q(visibility='public', status='active') | Q(tenant_id=tenant_id)

        try:
            if id:
                return SystemPrompt.objects.filter(visible, pk=id).first()
            if slug:
                return SystemPrompt.objects.filter(visible, slug=slug).first()
        except Exception:
            return None
        return None

    # Usage Alerts (stub)
    @strawberry.field
    def usage_alerts(
        self,
        info: strawberry.types.Info,
        alert_type: Optional[str] = None,
        severity: Optional[str] = None,
        acknowledged: Optional[bool] = None,
        resolved: Optional[bool] = None,
        first: Optional[int] = None,
        after: Optional[str] = None,
    ) -> list[UsageAlertType]:
        from zentinelle.models import InteractionLog, Policy
        from django.db.models import Sum
        from django.utils import timezone
        import uuid as _uuid

        if not info.context.request.user.is_authenticated:
            return []

        tenant_id = get_request_tenant_id(info.context.request.user)
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
                        continue  # No stored acknowledgements -- skip filter
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

    # Compliance Reports (stub)
    @strawberry.field
    def compliance_reports(
        self,
        info: strawberry.types.Info,
        first: Optional[int] = None,
        after: Optional[str] = None,
    ) -> list[ComplianceReportType]:
        from zentinelle.models import ComplianceAssessment

        if not info.context.request.user.is_authenticated:
            return ComplianceAssessment.objects.none()

        tenant_id = get_request_tenant_id(info.context.request.user)
        return ComplianceAssessment.objects.filter(tenant_id=tenant_id).order_by('-assessed_at')

    # Effective Policies (stub -- computed policy inheritance for a context)
    @strawberry.field
    def effective_policies(
        self,
        info: strawberry.types.Info,
        deployment_id: Optional[strawberry.ID] = None,
        endpoint_id: Optional[strawberry.ID] = None,
        user_id: Optional[str] = None,
        first: Optional[int] = None,
        after: Optional[str] = None,
    ) -> list[EffectivePolicyType]:
        import json
        from zentinelle.models import Policy

        if not info.context.request.user.is_authenticated:
            return []

        tenant_id = get_request_tenant_id(info.context.request.user)
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

    # Policy relationship graph
    @strawberry.field
    def policy_graph(
        self,
        info: strawberry.types.Info,
        policy_type: Optional[str] = None,
        endpoint_status: Optional[str] = None,
        risk_severity: Optional[str] = None,
        include_incidents: Optional[bool] = False,
    ) -> Optional[PolicyGraphType]:
        from zentinelle.models import Policy, AgentEndpoint, Risk, Incident

        if not info.context.request.user.is_authenticated:
            return PolicyGraphType(nodes=[], edges=[], node_count=0, edge_count=0)

        tenant_id = get_request_tenant_id(info.context.request.user)
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
                meta={
                    'agent_id': ep.agent_id,
                    'health': ep.health,
                    'status': ep.status,
                    'href': '/agents',
                },
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
                meta={
                    'policy_type': pol.policy_type,
                    'scope_type': pol.scope_type,
                    'enforcement': pol.enforcement,
                    'href': '/policies',
                },
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
                sub_label=f"L{risk.likelihood}xI{risk.impact}",
                status=risk.status,
                color=risk_color,
                meta={
                    'likelihood': risk.likelihood,
                    'impact': risk.impact,
                    'status': risk.status,
                    'score': score,
                    'href': '/risk',
                },
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
                    meta={
                        'severity': inc.severity,
                        'status': inc.status,
                        'href': '/risk',
                    },
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
