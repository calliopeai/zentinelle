"""
GraphQL Types for Zentinelle GRC Portal.

Standalone version — no dependency on deployments app.
"""
import graphene
from graphene import relay
from graphene_django import DjangoObjectType

# Agent-level models (from zentinelle)
from zentinelle.models import (
    AgentEndpoint,
    Policy,
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
    # License Compliance
    LicenseComplianceReport,
    LicenseComplianceViolation,
)


class AgentEndpointType(DjangoObjectType):
    """GraphQL type for AgentEndpoint."""
    class Meta:
        model = AgentEndpoint
        interfaces = (relay.Node,)
        fields = [
            'id', 'agent_id', 'agent_type', 'name', 'description',
            'status', 'health', 'capabilities', 'metadata',
            'last_heartbeat', 'api_key_prefix',
            'created_at', 'updated_at',
        ]

    deployment_name = graphene.String()

    def resolve_deployment_name(self, info):
        return self.deployment_id_ext or None


class PolicyType(DjangoObjectType):
    """GraphQL type for Policy."""
    class Meta:
        model = Policy
        interfaces = (relay.Node,)
        fields = [
            'id', 'name', 'description', 'policy_type', 'scope_type',
            'config', 'priority', 'enforcement', 'enabled',
            'created_at', 'updated_at',
        ]

    scope_name = graphene.String()
    created_by_username = graphene.String()

    def resolve_scope_name(self, info):
        if self.scope_sub_organization_id_ext:
            return f"Team: {self.scope_sub_organization_id_ext}"
        elif self.scope_deployment_id_ext:
            return f"Deployment: {self.scope_deployment_id_ext}"
        elif self.scope_endpoint:
            return f"Endpoint: {self.scope_endpoint.name}"
        elif self.scope_user_id_ext:
            return f"User: {self.scope_user_id_ext}"
        return "Organization"

    def resolve_created_by_username(self, info):
        return self.user_id or None


class EventType(DjangoObjectType):
    """GraphQL type for Event."""
    class Meta:
        model = Event
        interfaces = (relay.Node,)
        fields = [
            'id', 'event_type', 'event_category', 'status',
            'payload', 'user_identifier', 'occurred_at',
            'processed_at', 'correlation_id',
        ]

    endpoint_name = graphene.String()

    def resolve_endpoint_name(self, info):
        return self.endpoint.name if self.endpoint else None


class AuditLogType(DjangoObjectType):
    """GraphQL type for AuditLog."""
    class Meta:
        model = AuditLog
        interfaces = (relay.Node,)
        fields = [
            'id', 'action', 'resource_type', 'resource_id', 'resource_name',
            'metadata', 'api_key_prefix', 'ip_address', 'user_agent',
            'timestamp',
        ]


# =============================================================================
# AI Provider Registry Types
# =============================================================================

class AIProviderType(DjangoObjectType):
    """GraphQL type for AI Provider registry."""
    class Meta:
        model = AIProvider
        interfaces = (relay.Node,)
        fields = [
            'id', 'slug', 'name', 'logo_url',
            'supports_managed_keys', 'supports_key_creation', 'supports_key_deletion',
            'supports_key_rotation', 'supports_per_key_limits',
            'supports_usage_api', 'supports_per_key_stats', 'supports_realtime_usage',
            'usage_delay_minutes',
            'admin_api_base_url', 'usage_api_base_url', 'api_docs_url',
            'key_prefix', 'key_env_var',
            'is_active', 'notes',
        ]


# =============================================================================
# Platform API Keys
# =============================================================================

class APIKeyType(DjangoObjectType):
    """GraphQL type for Platform API Key."""
    class Meta:
        model = APIKey
        interfaces = (relay.Node,)
        fields = [
            'id', 'name', 'description', 'status',
            'scopes', 'rate_limit', 'expires_at',
            'last_used_at', 'usage_count',
            'created_at', 'updated_at',
        ]

    key_prefix = graphene.String()
    created_by_username = graphene.String()
    status_display = graphene.String()

    def resolve_key_prefix(self, info):
        return self.key_prefix

    def resolve_created_by_username(self, info):
        return self.created_by_username

    def resolve_status_display(self, info):
        return self.get_status_display()


# =============================================================================
# Model Registry Types
# =============================================================================

class AIModelType(DjangoObjectType):
    """GraphQL type for AI Model."""
    class Meta:
        model = AIModel
        interfaces = (relay.Node,)
        fields = [
            'id', 'model_id', 'name', 'description',
            'model_type', 'risk_level', 'capabilities',
            'context_window', 'max_output_tokens',
            'input_price_per_million', 'output_price_per_million',
            'is_available', 'deprecated', 'deprecation_date',
            'is_global', 'release_date', 'documentation_url',
            'created_at', 'updated_at',
        ]

    provider_slug = graphene.String()
    provider_name = graphene.String()
    model_type_display = graphene.String()
    risk_level_display = graphene.String()
    full_model_id = graphene.String()
    replacement_model_id = graphene.UUID()
    replacement_model_name = graphene.String()

    def resolve_provider_slug(self, info):
        return self.provider.slug if self.provider else None

    def resolve_provider_name(self, info):
        return self.provider.name if self.provider else None

    def resolve_model_type_display(self, info):
        return self.get_model_type_display()

    def resolve_risk_level_display(self, info):
        return self.get_risk_level_display()

    def resolve_full_model_id(self, info):
        return self.full_model_id

    def resolve_replacement_model_id(self, info):
        return self.replacement_model_id

    def resolve_replacement_model_name(self, info):
        return self.replacement_model.name if self.replacement_model else None


class OrganizationModelApprovalType(DjangoObjectType):
    """GraphQL type for Model Approval."""
    class Meta:
        model = OrganizationModelApproval
        interfaces = (relay.Node,)
        fields = [
            'id', 'status', 'max_daily_requests', 'max_monthly_cost',
            'requires_justification', 'requires_approval',
            'review_notes', 'reviewed_at',
            'created_at', 'updated_at',
        ]

    model_id = graphene.UUID()
    model_name = graphene.String()
    model_provider = graphene.String()
    model_risk_level = graphene.String()
    status_display = graphene.String()
    is_usable = graphene.Boolean()

    def resolve_model_id(self, info):
        return self.model_id

    def resolve_model_name(self, info):
        return self.model.name if self.model else None

    def resolve_model_provider(self, info):
        return self.model.provider.name if self.model and self.model.provider else None

    def resolve_model_risk_level(self, info):
        return self.model.get_risk_level_display() if self.model else None

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_is_usable(self, info):
        return self.is_usable


# =============================================================================
# Compliance & Monitoring Types
# =============================================================================

class ContentRuleType(DjangoObjectType):
    """GraphQL type for Content Rule."""
    class Meta:
        model = ContentRule
        interfaces = (relay.Node,)
        fields = [
            'id', 'name', 'description', 'rule_type', 'config',
            'severity', 'enforcement', 'scan_mode',
            'scan_input', 'scan_output', 'scan_context',
            'scope_type', 'priority', 'enabled',
            'notify_user', 'notify_admins', 'webhook_url',
            'created_at', 'updated_at',
        ]

    rule_type_display = graphene.String()
    severity_display = graphene.String()
    enforcement_display = graphene.String()
    scope_name = graphene.String()
    violation_count = graphene.Int()

    def resolve_rule_type_display(self, info):
        return self.get_rule_type_display()

    def resolve_severity_display(self, info):
        return self.get_severity_display()

    def resolve_enforcement_display(self, info):
        return self.get_enforcement_display()

    def resolve_scope_name(self, info):
        if self.scope_endpoint:
            return f"Endpoint: {self.scope_endpoint.name}"
        return "Organization"

    def resolve_violation_count(self, info):
        return self.violations.count()


class ContentViolationType(DjangoObjectType):
    """GraphQL type for Content Violation."""
    class Meta:
        model = ContentViolation
        interfaces = (relay.Node,)
        fields = [
            'id', 'rule_type', 'severity', 'enforcement',
            'matched_pattern', 'matched_text', 'match_start', 'match_end',
            'confidence', 'category', 'metadata',
            'was_blocked', 'was_redacted', 'user_notified', 'admin_notified',
            'created_at',
        ]

    rule_type_display = graphene.String()
    severity_display = graphene.String()
    rule_name = graphene.String()

    def resolve_rule_type_display(self, info):
        return self.get_rule_type_display()

    def resolve_severity_display(self, info):
        return self.get_severity_display()

    def resolve_rule_name(self, info):
        return self.rule.name if self.rule else None


class ContentScanType(DjangoObjectType):
    """GraphQL type for Content Scan."""
    class Meta:
        model = ContentScan
        interfaces = (relay.Node,)
        fields = [
            'id', 'content_type', 'content_hash', 'content_length',
            'content_preview', 'content_stored',
            'status', 'scan_mode', 'scanned_at', 'scan_duration_ms',
            'has_violations', 'violation_count', 'max_severity',
            'action_taken', 'was_blocked', 'was_redacted',
            'token_count', 'estimated_cost_usd',
            'user_identifier', 'session_id', 'request_id',
            'ip_address', 'user_agent',
            'created_at',
        ]

    content_type_display = graphene.String()
    status_display = graphene.String()
    endpoint_name = graphene.String()
    deployment_name = graphene.String()
    violations = graphene.List(lambda: ContentViolationType)

    def resolve_content_type_display(self, info):
        return self.get_content_type_display()

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_endpoint_name(self, info):
        return self.endpoint.name if self.endpoint else None

    def resolve_deployment_name(self, info):
        return self.deployment_id_ext or None

    def resolve_violations(self, info):
        return self.violations.all()


class ComplianceAlertType(DjangoObjectType):
    """GraphQL type for Compliance Alert."""
    class Meta:
        model = ComplianceAlert
        interfaces = (relay.Node,)
        fields = [
            'id', 'alert_type', 'severity', 'title', 'description',
            'user_identifier', 'violation_count',
            'first_violation_at', 'last_violation_at',
            'status', 'acknowledged_at', 'resolved_at', 'resolution_notes',
            'metadata', 'created_at',
        ]

    alert_type_display = graphene.String()
    severity_display = graphene.String()
    status_display = graphene.String()
    endpoint_name = graphene.String()

    def resolve_alert_type_display(self, info):
        return self.get_alert_type_display()

    def resolve_severity_display(self, info):
        return self.get_severity_display()

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_endpoint_name(self, info):
        return self.endpoint.name if self.endpoint else None


class InteractionLogType(DjangoObjectType):
    """GraphQL type for Interaction Log."""
    class Meta:
        model = InteractionLog
        interfaces = (relay.Node,)
        fields = [
            'id', 'interaction_type', 'session_id', 'request_id',
            'ai_provider', 'ai_model',
            'input_content', 'input_token_count',
            'output_content', 'output_token_count',
            'system_prompt', 'tool_calls',
            'latency_ms', 'total_tokens', 'estimated_cost_usd',
            'classification', 'is_work_related', 'topics',
            'user_identifier', 'ip_address', 'user_agent',
            'occurred_at', 'created_at',
        ]

    interaction_type_display = graphene.String()
    endpoint_name = graphene.String()
    deployment_name = graphene.String()
    has_violations = graphene.Boolean()
    violation_count = graphene.Int()
    was_blocked = graphene.Boolean()

    def resolve_interaction_type_display(self, info):
        return self.get_interaction_type_display()

    def resolve_endpoint_name(self, info):
        return self.endpoint.name if self.endpoint else None

    def resolve_deployment_name(self, info):
        return self.deployment_id_ext or None

    def resolve_has_violations(self, info):
        if self.scan:
            return self.scan.has_violations
        return False

    def resolve_violation_count(self, info):
        if self.scan:
            return self.scan.violation_count
        return 0

    def resolve_was_blocked(self, info):
        if self.scan:
            return self.scan.was_blocked
        return False


# =============================================================================
# Risk Management Types
# =============================================================================

class RiskType(DjangoObjectType):
    """GraphQL type for Risk."""
    class Meta:
        model = Risk
        interfaces = (relay.Node,)
        fields = [
            'id', 'name', 'description', 'category', 'status',
            'likelihood', 'impact',
            'mitigation_plan', 'mitigation_status',
            'residual_likelihood', 'residual_impact',
            'last_reviewed_at', 'next_review_date',
            'tags', 'external_references',
            'identified_at', 'created_at', 'updated_at',
        ]

    category_display = graphene.String()
    status_display = graphene.String()
    likelihood_display = graphene.String()
    impact_display = graphene.String()
    risk_score = graphene.Int()
    risk_level = graphene.String()
    residual_risk_score = graphene.Int()
    owner_name = graphene.String()
    incident_count = graphene.Int()

    def resolve_category_display(self, info):
        return self.get_category_display()

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_likelihood_display(self, info):
        return self.get_likelihood_display()

    def resolve_impact_display(self, info):
        return self.get_impact_display()

    def resolve_risk_score(self, info):
        return self.risk_score

    def resolve_risk_level(self, info):
        return self.risk_level

    def resolve_residual_risk_score(self, info):
        return self.residual_risk_score

    def resolve_owner_name(self, info):
        return self.user_id or None

    def resolve_incident_count(self, info):
        return self.incidents.count()


class IncidentType(DjangoObjectType):
    """GraphQL type for Incident."""
    class Meta:
        model = Incident
        interfaces = (relay.Node,)
        fields = [
            'id', 'title', 'description', 'incident_type', 'severity', 'status',
            'affected_user', 'affected_user_count',
            'root_cause', 'impact_assessment',
            'resolution', 'remediation_actions', 'lessons_learned',
            'occurred_at', 'detected_at', 'acknowledged_at', 'resolved_at', 'closed_at',
            'tags', 'evidence', 'timeline_events',
            'created_at', 'updated_at',
        ]

    incident_type_display = graphene.String()
    severity_display = graphene.String()
    status_display = graphene.String()
    sla_status = graphene.String()
    time_to_acknowledge_seconds = graphene.Int()
    time_to_resolve_seconds = graphene.Int()
    endpoint_name = graphene.String()
    deployment_name = graphene.String()
    related_risk_name = graphene.String()
    triggering_policy_name = graphene.String()

    def resolve_incident_type_display(self, info):
        return self.get_incident_type_display()

    def resolve_severity_display(self, info):
        return self.get_severity_display()

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_sla_status(self, info):
        return self.sla_status

    def resolve_time_to_acknowledge_seconds(self, info):
        tta = self.time_to_acknowledge
        return int(tta.total_seconds()) if tta else None

    def resolve_time_to_resolve_seconds(self, info):
        ttr = self.time_to_resolve
        return int(ttr.total_seconds()) if ttr else None

    def resolve_endpoint_name(self, info):
        return self.endpoint.name if self.endpoint else None

    def resolve_deployment_name(self, info):
        return self.deployment_id_ext or None

    def resolve_related_risk_name(self, info):
        return self.related_risk.name if self.related_risk else None

    def resolve_triggering_policy_name(self, info):
        return self.triggering_policy.name if self.triggering_policy else None


# =============================================================================
# License Compliance Types
# =============================================================================

class LicenseComplianceReportType(DjangoObjectType):
    """GraphQL type for License Compliance Report."""

    class Meta:
        model = LicenseComplianceReport
        interfaces = (relay.Node,)
        fields = [
            'id', 'report_type', 'status', 'period_start', 'period_end',
            'generated_at', 'report_data', 'total_users', 'total_violations',
            'compliance_score', 'pdf_url', 'pdf_generated_at', 'error_message',
            'created_at', 'updated_at',
        ]

    report_type_display = graphene.String()
    status_display = graphene.String()

    def resolve_report_type_display(self, info):
        return self.get_report_type_display()

    def resolve_status_display(self, info):
        return self.get_status_display()


class LicenseComplianceViolationGraphType(DjangoObjectType):
    """GraphQL type for License Compliance Violation."""

    class Meta:
        model = LicenseComplianceViolation
        interfaces = (relay.Node,)
        fields = [
            'id', 'violation_type', 'severity', 'status',
            'details', 'description', 'limit_value', 'actual_value',
            'detected_at', 'resolved_at', 'resolution_notes',
            'created_at', 'updated_at',
        ]

    violation_type_display = graphene.String()
    severity_display = graphene.String()
    status_display = graphene.String()
    license_key = graphene.String()
    is_open = graphene.Boolean()
    is_resolved = graphene.Boolean()

    def resolve_violation_type_display(self, info):
        return self.get_violation_type_display()

    def resolve_severity_display(self, info):
        return self.get_severity_display()

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_license_key(self, info):
        if self.license:
            # Return only the prefix for security
            return f"{self.license.license_key[:12]}..."
        return None

    def resolve_is_open(self, info):
        return self.is_open

    def resolve_is_resolved(self, info):
        return self.is_resolved
