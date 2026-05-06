"""
GraphQL Types for Zentinelle GRC Portal.

Standalone version — no dependency on deployments app.
"""
import uuid
from datetime import datetime
from typing import Optional

import strawberry
import strawberry_django
from strawberry import auto
from strawberry.scalars import JSON

# Agent-level models (from zentinelle)
from zentinelle.models.agent_group import AgentGroup
from zentinelle.models import (
    AgentEndpoint,
    Policy,
    PolicyRevision,
    Event,
    AuditLog,
    # AI Provider Registry
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
    # Retention
    RetentionPolicy,
    LegalHold,
    # License Compliance
    LicenseComplianceReport,
    LicenseComplianceViolation,
)


@strawberry_django.type(AgentGroup)
class AgentGroupType:
    """GraphQL type for AgentGroup."""
    id: auto
    tenant_id: auto
    name: auto
    slug: auto
    description: auto
    tier: auto
    color: auto
    created_at: auto

    @strawberry.field
    def agent_count(self) -> Optional[int]:
        return self.agents.count()


@strawberry.type
class AgentGroupConnection:
    nodes: list['AgentGroupType']
    total_count: int


@strawberry_django.type(AgentEndpoint)
class AgentEndpointType:
    """GraphQL type for AgentEndpoint."""
    id: auto
    agent_id: auto
    agent_type: auto
    name: auto
    description: auto
    status: auto
    health: auto
    capabilities: auto
    metadata: auto
    last_heartbeat: auto
    api_key_prefix: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def deployment_name(self) -> Optional[str]:
        return self.deployment_id_ext or None

    @strawberry.field
    def agent_group(self) -> Optional['AgentGroupType']:
        return getattr(self, 'group', None)


@strawberry_django.type(Policy)
class PolicyType:
    """GraphQL type for Policy."""
    id: auto
    name: auto
    description: auto
    policy_type: auto
    scope_type: auto
    config: auto
    priority: auto
    enforcement: auto
    enabled: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def scope_name(self) -> Optional[str]:
        if self.scope_sub_organization_id_ext:
            return f"Team: {self.scope_sub_organization_id_ext}"
        elif self.scope_deployment_id_ext:
            return f"Deployment: {self.scope_deployment_id_ext}"
        elif self.scope_endpoint:
            return f"Endpoint: {self.scope_endpoint.name}"
        elif self.scope_user_id_ext:
            return f"User: {self.scope_user_id_ext}"
        return "Organization"

    @strawberry.field
    def created_by_username(self) -> Optional[str]:
        return self.user_id or None


@strawberry_django.type(PolicyRevision)
class PolicyRevisionType:
    """GraphQL type for PolicyRevision — immutable snapshot of a Policy at a point in time."""
    id: auto
    policy: auto
    version: auto
    name: auto
    policy_type: auto
    enforcement: auto
    config: auto
    scope_type: auto
    enabled: auto
    priority: auto
    changed_by: auto
    change_summary: auto
    created_at: auto


@strawberry_django.type(Event)
class EventType:
    """GraphQL type for Event."""
    id: auto
    event_type: auto
    event_category: auto
    status: auto
    payload: auto
    user_identifier: auto
    occurred_at: auto
    processed_at: auto
    correlation_id: auto

    @strawberry.field
    def endpoint_name(self) -> Optional[str]:
        return self.endpoint.name if self.endpoint else None


@strawberry.type
class AuditActorType:
    """Actor who performed an audit action."""
    id: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None  # 'user' or 'api_key'


@strawberry.type
class AuditChangeType:
    """A field-level change recorded in an audit log entry."""
    field: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None


@strawberry_django.type(AuditLog)
class AuditLogType:
    """GraphQL type for AuditLog."""
    id: auto
    action: auto
    resource_type: auto
    resource_id: auto
    resource_name: auto
    metadata: auto
    api_key_prefix: auto
    ip_address: auto
    user_agent: auto
    timestamp: auto

    @strawberry.field
    def actor(self) -> Optional[AuditActorType]:
        if self.api_key_prefix:
            return AuditActorType(
                id=self.api_key_prefix,
                email=None,
                name=f"API Key ({self.api_key_prefix})",
                type='api_key',
            )
        if self.ext_user_id:
            return AuditActorType(
                id=self.ext_user_id,
                email=self.ext_user_id if '@' in self.ext_user_id else None,
                name=self.ext_user_id,
                type='user',
            )
        return None

    @strawberry.field
    def resource(self) -> Optional[str]:
        return self.resource_type

    @strawberry.field
    def status(self) -> Optional[str]:
        # AuditLog doesn't have a status field — return 'success' as a sensible default
        return 'success'

    @strawberry.field
    def details(self) -> Optional[JSON]:
        return self.metadata or {}

    @strawberry.field
    def changes(self) -> Optional[list[AuditChangeType]]:
        raw = self.changes or {}
        result = []
        for field_name, change in raw.items():
            if isinstance(change, dict):
                result.append(AuditChangeType(
                    field=field_name,
                    old_value=str(change.get('old', '')) if change.get('old') is not None else None,
                    new_value=str(change.get('new', '')) if change.get('new') is not None else None,
                ))
        return result


# =============================================================================
# AI Provider Registry Types
# =============================================================================

@strawberry_django.type(AIProvider)
class AIProviderType:
    """GraphQL type for AI Provider registry."""
    id: auto
    slug: auto
    name: auto
    logo_url: auto
    supports_managed_keys: auto
    supports_key_creation: auto
    supports_key_deletion: auto
    supports_key_rotation: auto
    supports_per_key_limits: auto
    supports_usage_api: auto
    supports_per_key_stats: auto
    supports_realtime_usage: auto
    usage_delay_minutes: auto
    admin_api_base_url: auto
    usage_api_base_url: auto
    api_docs_url: auto
    key_prefix: auto
    key_env_var: auto
    is_active: auto
    notes: auto


# =============================================================================
# Platform API Keys
# =============================================================================

@strawberry_django.type(APIKey)
class APIKeyType:
    """GraphQL type for Platform API Key."""
    id: auto
    name: auto
    description: auto
    status: auto
    scopes: auto
    rate_limit: auto
    expires_at: auto
    last_used_at: auto
    usage_count: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def key_prefix(self) -> Optional[str]:
        return self.key_prefix

    @strawberry.field
    def created_by_username(self) -> Optional[str]:
        return self.created_by_username

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()


# =============================================================================
# Model Registry Types
# =============================================================================

@strawberry_django.type(AIModel)
class AIModelType:
    """GraphQL type for AI Model."""
    id: auto
    model_id: auto
    name: auto
    description: auto
    model_type: auto
    risk_level: auto
    context_window: auto
    max_output_tokens: auto
    is_available: auto
    deprecated: auto
    deprecation_date: auto
    is_global: auto
    release_date: auto
    documentation_url: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def capabilities(self) -> Optional[list[str]]:
        caps = self.capabilities
        if isinstance(caps, list):
            return caps
        if isinstance(caps, str):
            import json
            try:
                return json.loads(caps)
            except (ValueError, TypeError):
                return []
        return caps or []

    @strawberry.field
    def input_price_per_million(self) -> Optional[float]:
        return float(self.input_price_per_million) if self.input_price_per_million is not None else None

    @strawberry.field
    def output_price_per_million(self) -> Optional[float]:
        return float(self.output_price_per_million) if self.output_price_per_million is not None else None

    @strawberry.field
    def provider_slug(self) -> Optional[str]:
        return self.provider.slug if self.provider else None

    @strawberry.field
    def provider_name(self) -> Optional[str]:
        return self.provider.name if self.provider else None

    @strawberry.field
    def model_type_display(self) -> Optional[str]:
        return self.get_model_type_display()

    @strawberry.field
    def risk_level_display(self) -> Optional[str]:
        return self.get_risk_level_display()

    @strawberry.field
    def full_model_id(self) -> Optional[str]:
        return self.full_model_id

    @strawberry.field
    def replacement_model_id(self) -> Optional[uuid.UUID]:
        return self.replacement_model_id

    @strawberry.field
    def replacement_model_name(self) -> Optional[str]:
        return self.replacement_model.name if self.replacement_model else None


@strawberry_django.type(OrganizationModelApproval)
class OrganizationModelApprovalType:
    """GraphQL type for Model Approval."""
    id: auto
    status: auto
    max_daily_requests: auto
    max_monthly_cost: auto
    requires_justification: auto
    requires_approval: auto
    review_notes: auto
    reviewed_at: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def model_id(self) -> Optional[uuid.UUID]:
        return self.model_id

    @strawberry.field
    def model_name(self) -> Optional[str]:
        return self.model.name if self.model else None

    @strawberry.field
    def model_provider(self) -> Optional[str]:
        return self.model.provider.name if self.model and self.model.provider else None

    @strawberry.field
    def model_risk_level(self) -> Optional[str]:
        return self.model.get_risk_level_display() if self.model else None

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()

    @strawberry.field
    def is_usable(self) -> Optional[bool]:
        return self.is_usable

    @strawberry.field
    def reviewed_by_username(self) -> Optional[str]:
        return self.reviewer_id or None

    @strawberry.field
    def requested_by_username(self) -> Optional[str]:
        return self.user_id or None


# =============================================================================
# Compliance & Monitoring Types
# =============================================================================

@strawberry_django.type(ContentRule)
class ContentRuleType:
    """GraphQL type for Content Rule."""
    id: auto
    name: auto
    description: auto
    rule_type: auto
    config: auto
    severity: auto
    enforcement: auto
    scan_mode: auto
    scan_input: auto
    scan_output: auto
    scan_context: auto
    scope_type: auto
    priority: auto
    enabled: auto
    notify_user: auto
    notify_admins: auto
    webhook_url: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def rule_type_display(self) -> Optional[str]:
        return self.get_rule_type_display()

    @strawberry.field
    def severity_display(self) -> Optional[str]:
        return self.get_severity_display()

    @strawberry.field
    def enforcement_display(self) -> Optional[str]:
        return self.get_enforcement_display()

    @strawberry.field
    def scope_name(self) -> Optional[str]:
        if self.scope_endpoint:
            return f"Endpoint: {self.scope_endpoint.name}"
        return "Organization"

    @strawberry.field
    def violation_count(self) -> Optional[int]:
        return self.violations.count()


@strawberry_django.type(ContentViolation)
class ContentViolationType:
    """GraphQL type for Content Violation."""
    id: auto
    rule_type: auto
    severity: auto
    enforcement: auto
    matched_pattern: auto
    matched_text: auto
    match_start: auto
    match_end: auto
    confidence: auto
    category: auto
    metadata: auto
    was_blocked: auto
    was_redacted: auto
    user_notified: auto
    admin_notified: auto
    created_at: auto

    @strawberry.field
    def rule_type_display(self) -> Optional[str]:
        return self.get_rule_type_display()

    @strawberry.field
    def severity_display(self) -> Optional[str]:
        return self.get_severity_display()

    @strawberry.field
    def rule_name(self) -> Optional[str]:
        return self.rule.name if self.rule else None


@strawberry_django.type(ContentScan)
class ContentScanType:
    """GraphQL type for Content Scan."""
    id: auto
    content_type: auto
    content_hash: auto
    content_length: auto
    content_preview: auto
    content_stored: auto
    status: auto
    scan_mode: auto
    scanned_at: auto
    scan_duration_ms: auto
    has_violations: auto
    violation_count: auto
    max_severity: auto
    action_taken: auto
    was_blocked: auto
    was_redacted: auto
    token_count: auto
    estimated_cost_usd: auto
    user_identifier: auto
    session_id: auto
    request_id: auto
    ip_address: auto
    user_agent: auto
    created_at: auto

    @strawberry.field
    def content_type_display(self) -> Optional[str]:
        return self.get_content_type_display()

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()

    @strawberry.field
    def endpoint_name(self) -> Optional[str]:
        return self.endpoint.name if self.endpoint else None

    @strawberry.field
    def deployment_name(self) -> Optional[str]:
        return self.deployment_id_ext or None

    @strawberry.field
    def violations(self) -> Optional[list[ContentViolationType]]:
        return self.violations.all()


@strawberry_django.type(ComplianceAlert)
class ComplianceAlertType:
    """GraphQL type for Compliance Alert."""
    id: auto
    alert_type: auto
    severity: auto
    title: auto
    description: auto
    user_identifier: auto
    violation_count: auto
    first_violation_at: auto
    last_violation_at: auto
    status: auto
    acknowledged_at: auto
    resolved_at: auto
    resolution_notes: auto
    metadata: auto
    created_at: auto

    @strawberry.field
    def alert_type_display(self) -> Optional[str]:
        return self.get_alert_type_display()

    @strawberry.field
    def severity_display(self) -> Optional[str]:
        return self.get_severity_display()

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()

    @strawberry.field
    def endpoint_name(self) -> Optional[str]:
        return self.endpoint.name if self.endpoint else None

    @strawberry.field
    def acknowledged_by_username(self) -> Optional[str]:
        return self.acknowledged_by or None

    @strawberry.field
    def resolved_by_username(self) -> Optional[str]:
        return getattr(self, 'resolved_by', None) or None


@strawberry_django.type(InteractionLog)
class InteractionLogType:
    """GraphQL type for Interaction Log."""
    id: auto
    interaction_type: auto
    session_id: auto
    request_id: auto
    ai_provider: auto
    ai_model: auto
    input_content: auto
    input_token_count: auto
    output_content: auto
    output_token_count: auto
    system_prompt: auto
    tool_calls: auto
    latency_ms: auto
    total_tokens: auto
    estimated_cost_usd: auto
    classification: auto
    is_work_related: auto
    topics: auto
    user_identifier: auto
    ip_address: auto
    user_agent: auto
    occurred_at: auto
    created_at: auto

    @strawberry.field
    def interaction_type_display(self) -> Optional[str]:
        return self.get_interaction_type_display()

    @strawberry.field
    def endpoint_name(self) -> Optional[str]:
        return self.endpoint.name if self.endpoint else None

    @strawberry.field
    def deployment_name(self) -> Optional[str]:
        return self.deployment_id_ext or None

    @strawberry.field
    def has_violations(self) -> Optional[bool]:
        if self.scan:
            return self.scan.has_violations
        return False

    @strawberry.field
    def violation_count(self) -> Optional[int]:
        if self.scan:
            return self.scan.violation_count
        return 0

    @strawberry.field
    def was_blocked(self) -> Optional[bool]:
        if self.scan:
            return self.scan.was_blocked
        return False


# =============================================================================
# Risk Management Types
# =============================================================================

@strawberry_django.type(Risk)
class RiskType:
    """GraphQL type for Risk."""
    id: auto
    name: auto
    description: auto
    category: auto
    status: auto
    likelihood: auto
    impact: auto
    mitigation_plan: auto
    mitigation_status: auto
    residual_likelihood: auto
    residual_impact: auto
    last_reviewed_at: auto
    next_review_date: auto
    tags: auto
    external_references: auto
    identified_at: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def category_display(self) -> Optional[str]:
        return self.get_category_display()

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()

    @strawberry.field
    def likelihood_display(self) -> Optional[str]:
        return self.get_likelihood_display()

    @strawberry.field
    def impact_display(self) -> Optional[str]:
        return self.get_impact_display()

    @strawberry.field
    def risk_score(self) -> Optional[int]:
        return self.risk_score

    @strawberry.field
    def risk_level(self) -> Optional[str]:
        return self.risk_level

    @strawberry.field
    def residual_risk_score(self) -> Optional[int]:
        return self.residual_risk_score

    @strawberry.field
    def owner_name(self) -> Optional[str]:
        return self.user_id or None

    @strawberry.field
    def last_reviewed_by_name(self) -> Optional[str]:
        return self.reviewer_id or None

    @strawberry.field
    def incident_count(self) -> Optional[int]:
        return self.incidents.count()


@strawberry_django.type(Incident)
class IncidentType:
    """GraphQL type for Incident."""
    id: auto
    title: auto
    description: auto
    incident_type: auto
    severity: auto
    status: auto
    affected_user: auto
    affected_user_count: auto
    root_cause: auto
    impact_assessment: auto
    resolution: auto
    remediation_actions: auto
    lessons_learned: auto
    occurred_at: auto
    detected_at: auto
    acknowledged_at: auto
    resolved_at: auto
    closed_at: auto
    tags: auto
    evidence: auto
    timeline_events: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def incident_type_display(self) -> Optional[str]:
        return self.get_incident_type_display()

    @strawberry.field
    def severity_display(self) -> Optional[str]:
        return self.get_severity_display()

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()

    @strawberry.field
    def sla_status(self) -> Optional[str]:
        return self.sla_status

    @strawberry.field
    def time_to_acknowledge_seconds(self) -> Optional[int]:
        tta = self.time_to_acknowledge
        return int(tta.total_seconds()) if tta else None

    @strawberry.field
    def time_to_resolve_seconds(self) -> Optional[int]:
        ttr = self.time_to_resolve
        return int(ttr.total_seconds()) if ttr else None

    @strawberry.field
    def assigned_to_name(self) -> Optional[str]:
        return self.assignee_id or self.user_id or None

    @strawberry.field
    def reported_by_name(self) -> Optional[str]:
        return self.reporter_id or None

    @strawberry.field
    def endpoint_name(self) -> Optional[str]:
        return self.endpoint.name if self.endpoint else None

    @strawberry.field
    def deployment_name(self) -> Optional[str]:
        return self.deployment_id_ext or None

    @strawberry.field
    def related_risk_name(self) -> Optional[str]:
        return self.related_risk.name if self.related_risk else None

    @strawberry.field
    def triggering_policy_name(self) -> Optional[str]:
        return self.triggering_policy.name if self.triggering_policy else None


# =============================================================================
# License Compliance Types
# =============================================================================

@strawberry_django.type(LicenseComplianceReport)
class LicenseComplianceReportType:
    """GraphQL type for License Compliance Report."""
    id: auto
    report_type: auto
    status: auto
    period_start: auto
    period_end: auto
    generated_at: auto
    report_data: auto
    total_users: auto
    total_violations: auto
    compliance_score: auto
    pdf_url: auto
    pdf_generated_at: auto
    error_message: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def report_type_display(self) -> Optional[str]:
        return self.get_report_type_display()

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()


@strawberry_django.type(LicenseComplianceViolation)
class LicenseComplianceViolationGraphType:
    """GraphQL type for License Compliance Violation."""
    id: auto
    violation_type: auto
    severity: auto
    status: auto
    details: auto
    description: auto
    limit_value: auto
    actual_value: auto
    detected_at: auto
    resolved_at: auto
    resolution_notes: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def violation_type_display(self) -> Optional[str]:
        return self.get_violation_type_display()

    @strawberry.field
    def severity_display(self) -> Optional[str]:
        return self.get_severity_display()

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()

    @strawberry.field
    def license_key(self) -> Optional[str]:
        if self.license:
            return f"{self.license.license_key[:12]}..."
        return None

    @strawberry.field
    def is_open(self) -> Optional[bool]:
        return self.is_open

    @strawberry.field
    def is_resolved(self) -> Optional[bool]:
        return self.is_resolved


# ---------------------------------------------------------------------------
# Retention Policies & Legal Holds
# ---------------------------------------------------------------------------

@strawberry_django.type(RetentionPolicy)
class RetentionPolicyType:
    """GraphQL type for Retention Policy."""
    id: auto
    name: auto
    description: auto
    entity_type: auto
    deployment_id_ext: auto
    retention_days: auto
    minimum_retention_days: auto
    expiration_action: auto
    archive_location: auto
    compliance_requirement: auto
    compliance_notes: auto
    enabled: auto
    priority: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def entity_type_display(self) -> Optional[str]:
        return self.get_entity_type_display()

    @strawberry.field
    def expiration_action_display(self) -> Optional[str]:
        return self.get_expiration_action_display()

    @strawberry.field
    def compliance_requirement_display(self) -> Optional[str]:
        return self.get_compliance_requirement_display()

    @strawberry.field
    def deployment_name(self) -> Optional[str]:
        return self.deployment_id_ext or None

    @strawberry.field
    def created_by_name(self) -> Optional[str]:
        return self.user_id or None


@strawberry_django.type(LegalHold)
class LegalHoldType:
    """GraphQL type for Legal Hold."""
    id: auto
    name: auto
    description: auto
    reference_number: auto
    hold_type: auto
    status: auto
    applies_to_all: auto
    entity_types: auto
    user_identifiers: auto
    data_from: auto
    data_to: auto
    effective_date: auto
    expiration_date: auto
    released_at: auto
    custodian_email: auto
    notify_on_access: auto
    notification_emails: auto
    created_at: auto
    updated_at: auto

    @strawberry.field
    def hold_type_display(self) -> Optional[str]:
        return self.get_hold_type_display()

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()

    @strawberry.field
    def is_active(self) -> Optional[bool]:
        return self.status == 'active'

    @strawberry.field
    def custodian_name(self) -> Optional[str]:
        return self.custodian_email or None

    @strawberry.field
    def created_by_name(self) -> Optional[str]:
        return self.user_id or None


# ---------------------------------------------------------------------------
# Organization (stub for standalone mode — no organization app required)
# ---------------------------------------------------------------------------

@strawberry.type
class OrganizationType:
    id: Optional[strawberry.ID] = None
    name: Optional[str] = None
    slug: Optional[str] = None
    tier: Optional[str] = None
    website: Optional[str] = None
    deployment_model: Optional[str] = None
    zentinelle_tier: Optional[str] = None
    ai_budget_usd: Optional[float] = None
    ai_budget_spent_usd: Optional[float] = None
    overage_policy: Optional[str] = None
    ai_budget_alert_threshold: Optional[float] = None
    settings: Optional[JSON] = None
    created_at: Optional[datetime] = None


@strawberry.type
class UpdateOrganizationSettingsPayload:
    success: Optional[bool] = None
    organization: Optional[OrganizationType] = None


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

@strawberry.type
class NotificationType:
    id: Optional[strawberry.ID] = None
    type: Optional[str] = None
    subject: Optional[str] = None
    message: Optional[str] = None
    status: Optional[str] = None
    status_date: Optional[datetime] = None
    metadata: Optional[JSON] = None
    created_at: Optional[datetime] = None


@strawberry.type
class NotificationConnection:
    nodes: list[NotificationType]
    total_count: int


# ---------------------------------------------------------------------------
# Client Cove Integration
# ---------------------------------------------------------------------------

@strawberry.type
class ClientCoveIntegrationType:
    id: Optional[strawberry.ID] = None
    client_cove_url: Optional[str] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None
    status_message: Optional[str] = None
    connected_org_name: Optional[str] = None
    last_tested_at: Optional[datetime] = None

    @strawberry.field
    def api_key_preview(self) -> Optional[str]:
        key = getattr(self, 'api_key', '') or ''
        if len(key) > 8:
            return key[:4] + '••••' + key[-4:]
        return '••••' if key else ''


@strawberry.type
class TestClientCoveConnectionPayload:
    success: Optional[bool] = None
    message: Optional[str] = None
    org_name: Optional[str] = None


@strawberry.type
class SaveClientCoveConfigPayload:
    success: Optional[bool] = None
    message: Optional[str] = None
    integration: Optional[ClientCoveIntegrationType] = None


@strawberry.type
class DisconnectClientCovePayload:
    success: Optional[bool] = None


@strawberry.type
class TestWebhookPayload:
    success: Optional[bool] = None
    message: Optional[str] = None
    status_code: Optional[int] = None


@strawberry.type
class UsageMetricsSummaryType:
    total_api_calls: Optional[int] = None
    total_tokens: Optional[int] = None
    total_cost: Optional[float] = None
    active_agents: Optional[int] = None
    storage_used_mb: Optional[float] = None


@strawberry.type
class UsageTimeSeriesPointType:
    date: Optional[str] = None
    api_calls: Optional[int] = None
    tokens: Optional[int] = None
    cost: Optional[float] = None


@strawberry.type
class UsageByAgentType:
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    api_calls: Optional[int] = None
    tokens: Optional[int] = None
    cost: Optional[float] = None


@strawberry.type
class UsageByEndpointType:
    endpoint: Optional[str] = None
    api_calls: Optional[int] = None
    avg_latency_ms: Optional[float] = None


@strawberry.type
class UsageMetricsType:
    summary: Optional[UsageMetricsSummaryType] = None
    time_series: Optional[list[UsageTimeSeriesPointType]] = None
    by_agent: Optional[list[UsageByAgentType]] = None
    by_endpoint: Optional[list[UsageByEndpointType]] = None


@strawberry.type
class PromptCategoryType:
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None

    @strawberry.field
    def id(self) -> Optional[strawberry.ID]:
        return strawberry.ID(str(self.id))

    @strawberry.field
    def prompt_count(self) -> Optional[int]:
        return self.prompts.filter(status='active').count()


@strawberry.type
class PromptTagType:
    name: Optional[str] = None
    slug: Optional[str] = None
    tag_type: Optional[str] = None
    color: Optional[str] = None

    @strawberry.field
    def id(self) -> Optional[strawberry.ID]:
        return strawberry.ID(str(self.id))


@strawberry.type
class PromptTagConnection:
    nodes: list[PromptTagType]
    total_count: int


@strawberry.type
class SystemPromptType:
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    prompt_text: Optional[str] = None
    prompt_type: Optional[str] = None
    category: Optional[PromptCategoryType] = None
    compatible_providers: Optional[list[str]] = None
    compatible_models: Optional[list[str]] = None
    recommended_temperature: Optional[float] = None
    recommended_max_tokens: Optional[int] = None
    template_variables: Optional[list[str]] = None
    example_input: Optional[str] = None
    example_output: Optional[str] = None
    use_cases: Optional[list[str]] = None
    version: Optional[int] = None
    status: Optional[str] = None
    visibility: Optional[str] = None
    is_featured: Optional[bool] = None
    is_verified: Optional[bool] = None
    usage_count: Optional[int] = None
    favorite_count: Optional[int] = None
    fork_count: Optional[int] = None
    avg_rating: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @strawberry.field
    def id(self) -> Optional[strawberry.ID]:
        return strawberry.ID(str(self.id))

    @strawberry.field
    def prompt_type_display(self) -> Optional[str]:
        return self.get_prompt_type_display()

    @strawberry.field
    def status_display(self) -> Optional[str]:
        return self.get_status_display()

    @strawberry.field
    def visibility_display(self) -> Optional[str]:
        return self.get_visibility_display()

    @strawberry.field
    def tags(self) -> Optional[list[PromptTagType]]:
        return list(self.tags.all())

    @strawberry.field
    def is_favorited(self) -> Optional[bool]:
        return False

    @strawberry.field
    def user_rating(self) -> Optional[float]:
        return None

    @strawberry.field
    def created_by_username(self) -> Optional[str]:
        return self.user_id or ''

    @strawberry.field
    def variable_defaults(self) -> Optional[JSON]:
        import json
        return json.loads(json.dumps(self.variable_defaults)) if self.variable_defaults else {}


@strawberry.type
class SystemPromptConnection:
    nodes: list[SystemPromptType]
    total_count: int


@strawberry.type
class PolicyGraphNodeType:
    id: Optional[str] = None
    node_type: Optional[str] = None     # 'policy' | 'endpoint' | 'risk' | 'incident'
    label: Optional[str] = None
    sub_label: Optional[str] = None     # policy_type, status, etc.
    status: Optional[str] = None
    color: Optional[str] = None
    meta: Optional[JSON] = None         # JSON with extra details for sidebar


@strawberry.type
class PolicyGraphEdgeType:
    source: Optional[str] = None
    target: Optional[str] = None
    relationship: Optional[str] = None  # 'scoped_to' | 'org_wide' | 'affects' | 'triggered'
    label: Optional[str] = None


@strawberry.type
class PolicyGraphType:
    nodes: Optional[list[PolicyGraphNodeType]] = None
    edges: Optional[list[PolicyGraphEdgeType]] = None
    node_count: Optional[int] = None
    edge_count: Optional[int] = None


@strawberry.type
class UsageAlertType:
    id: Optional[strawberry.ID] = None
    alert_type: Optional[str] = None
    alert_type_display: Optional[str] = None
    severity: Optional[str] = None
    severity_display: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    details: Optional[JSON] = None
    threshold_value: Optional[float] = None
    current_value: Optional[float] = None
    acknowledged: Optional[bool] = None
    acknowledged_at: Optional[datetime] = None
    acknowledged_by_email: Optional[str] = None
    resolved: Optional[bool] = None
    resolved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


@strawberry.type
class UsageAlertConnection:
    nodes: list[UsageAlertType]
    total_count: int


@strawberry.type
class ComplianceReportType:
    """Maps ComplianceAssessment model instances to the report list type."""

    @strawberry.field
    def id(self) -> Optional[strawberry.ID]:
        return strawberry.ID(str(self.id))

    @strawberry.field
    def name(self) -> Optional[str]:
        return f"Compliance Report {self.assessed_at.strftime('%Y-%m-%d')}"

    @strawberry.field
    def framework(self) -> Optional[str]:
        return self.framework_id or 'all'

    @strawberry.field
    def generated_at(self) -> Optional[datetime]:
        return self.assessed_at

    @strawberry.field
    def period(self) -> Optional[str]:
        return self.assessment_type

    @strawberry.field
    def status(self) -> Optional[str]:
        return self.status

    @strawberry.field
    def download_url(self) -> Optional[str]:
        return f'/api/zentinelle/v1/export/summary.json?assessment={self.id}'


@strawberry.type
class ComplianceReportConnection:
    nodes: list[ComplianceReportType]
    total_count: int


@strawberry.type
class EffectivePolicyType:
    id: Optional[strawberry.ID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    policy_type: Optional[str] = None
    scope_type: Optional[str] = None
    scope_name: Optional[str] = None
    config: Optional[JSON] = None
    priority: Optional[int] = None
    enforcement: Optional[str] = None
    enabled: Optional[bool] = None
    inherited_from: Optional[str] = None
    overrides: Optional[JSON] = None


@strawberry.type
class EffectivePolicyConnection:
    nodes: list[EffectivePolicyType]
    total_count: int


# ---------------------------------------------------------------------------
# Audit Analytics Types (ClickHouse-backed)
# ---------------------------------------------------------------------------

@strawberry.type
class AuditTimelinePointType:
    """A single time-bucketed point in the audit event timeline."""
    bucket: Optional[datetime] = None
    event_type: Optional[str] = None
    count: Optional[int] = None


@strawberry.type
class AuditEventCountType:
    """Audit event count broken down by event type."""
    event_type: Optional[str] = None
    count: Optional[int] = None


@strawberry.type
class AuditTopAgentType:
    """Agent ranked by total event count."""
    agent_id: Optional[str] = None
    event_count: Optional[int] = None


@strawberry.type
class AuditAnalyticsType:
    """Aggregated audit analytics sourced from ClickHouse."""
    timeline: Optional[list[AuditTimelinePointType]] = None
    by_type: Optional[list[AuditEventCountType]] = None
    top_agents: Optional[list[AuditTopAgentType]] = None
