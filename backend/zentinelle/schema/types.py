"""
GraphQL Types for Zentinelle GRC Portal.

Standalone version — no dependency on deployments app.
"""
import graphene
from graphene import relay
from graphene_django import DjangoObjectType


class CountableConnection(relay.Connection):
    """Connection base that adds a totalCount field."""
    class Meta:
        abstract = True

    total_count = graphene.Int()

    @staticmethod
    def resolve_total_count(root, info, **kwargs):
        return root.length

# Agent-level models (from zentinelle)
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


class PolicyRevisionType(DjangoObjectType):
    """GraphQL type for PolicyRevision — immutable snapshot of a Policy at a point in time."""
    class Meta:
        model = PolicyRevision
        interfaces = (relay.Node,)
        fields = [
            'id', 'policy', 'version',
            'name', 'policy_type', 'enforcement',
            'config', 'scope_type', 'enabled', 'priority',
            'changed_by', 'change_summary', 'created_at',
        ]


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


class AuditActorType(graphene.ObjectType):
    """Actor who performed an audit action."""
    id = graphene.String()
    email = graphene.String()
    name = graphene.String()
    type = graphene.String()  # 'user' or 'api_key'


class AuditChangeType(graphene.ObjectType):
    """A field-level change recorded in an audit log entry."""
    field = graphene.String()
    old_value = graphene.String()
    new_value = graphene.String()


class AuditLogType(DjangoObjectType):
    """GraphQL type for AuditLog."""
    class Meta:
        model = AuditLog
        interfaces = (relay.Node,)
        connection_class = CountableConnection
        fields = [
            'id', 'action', 'resource_type', 'resource_id', 'resource_name',
            'metadata', 'api_key_prefix', 'ip_address', 'user_agent',
            'timestamp',
        ]

    # Aliases / computed fields to match frontend expectations
    actor = graphene.Field(AuditActorType)
    resource = graphene.String()
    status = graphene.String()
    details = graphene.JSONString()
    changes = graphene.List(AuditChangeType)

    def resolve_actor(self, info):
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

    def resolve_resource(self, info):
        return self.resource_type

    def resolve_status(self, info):
        # AuditLog doesn't have a status field — return 'success' as a sensible default
        return 'success'

    def resolve_details(self, info):
        return self.metadata or {}

    def resolve_changes(self, info):
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
            'model_type', 'risk_level',
            'context_window', 'max_output_tokens',
            'input_price_per_million', 'output_price_per_million',
            'is_available', 'deprecated', 'deprecation_date',
            'is_global', 'release_date', 'documentation_url',
            'created_at', 'updated_at',
        ]

    # Return capabilities as a proper list, not a JSON string
    capabilities = graphene.List(graphene.String)
    # Serialize DecimalFields as floats so frontend can call .toFixed()
    input_price_per_million = graphene.Float()
    output_price_per_million = graphene.Float()
    provider_slug = graphene.String()
    provider_name = graphene.String()
    model_type_display = graphene.String()
    risk_level_display = graphene.String()
    full_model_id = graphene.String()
    replacement_model_id = graphene.UUID()
    replacement_model_name = graphene.String()

    def resolve_input_price_per_million(self, info):
        return float(self.input_price_per_million) if self.input_price_per_million is not None else None

    def resolve_output_price_per_million(self, info):
        return float(self.output_price_per_million) if self.output_price_per_million is not None else None

    def resolve_capabilities(self, info):
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
    reviewed_by_username = graphene.String()
    requested_by_username = graphene.String()

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

    def resolve_reviewed_by_username(self, info):
        return self.reviewer_id or None

    def resolve_requested_by_username(self, info):
        return self.user_id or None


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
    acknowledged_by_username = graphene.String()
    resolved_by_username = graphene.String()

    def resolve_alert_type_display(self, info):
        return self.get_alert_type_display()

    def resolve_severity_display(self, info):
        return self.get_severity_display()

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_endpoint_name(self, info):
        return self.endpoint.name if self.endpoint else None

    def resolve_acknowledged_by_username(self, info):
        return self.acknowledged_by or None

    def resolve_resolved_by_username(self, info):
        return getattr(self, 'resolved_by', None) or None


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
    last_reviewed_by_name = graphene.String()
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

    def resolve_last_reviewed_by_name(self, info):
        return self.reviewer_id or None

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
    assigned_to_name = graphene.String()
    reported_by_name = graphene.String()
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

    def resolve_assigned_to_name(self, info):
        return self.assignee_id or self.user_id or None

    def resolve_reported_by_name(self, info):
        return self.reporter_id or None

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


# ---------------------------------------------------------------------------
# Retention Policies & Legal Holds
# ---------------------------------------------------------------------------

class RetentionPolicyType(DjangoObjectType):
    """GraphQL type for Retention Policy."""
    class Meta:
        model = RetentionPolicy
        interfaces = (relay.Node,)
        fields = [
            'id', 'name', 'description', 'entity_type',
            'deployment_id_ext', 'retention_days', 'minimum_retention_days',
            'expiration_action', 'archive_location',
            'compliance_requirement', 'compliance_notes',
            'enabled', 'priority', 'created_at', 'updated_at',
        ]

    entity_type_display = graphene.String()
    expiration_action_display = graphene.String()
    compliance_requirement_display = graphene.String()
    deployment_name = graphene.String()
    created_by_name = graphene.String()

    def resolve_entity_type_display(self, info):
        return self.get_entity_type_display()

    def resolve_expiration_action_display(self, info):
        return self.get_expiration_action_display()

    def resolve_compliance_requirement_display(self, info):
        return self.get_compliance_requirement_display()

    def resolve_deployment_name(self, info):
        return self.deployment_id_ext or None

    def resolve_created_by_name(self, info):
        return self.user_id or None


class LegalHoldType(DjangoObjectType):
    """GraphQL type for Legal Hold."""
    class Meta:
        model = LegalHold
        interfaces = (relay.Node,)
        fields = [
            'id', 'name', 'description', 'reference_number',
            'hold_type', 'status',
            'applies_to_all', 'entity_types', 'user_identifiers',
            'data_from', 'data_to',
            'effective_date', 'expiration_date', 'released_at',
            'custodian_email',
            'notify_on_access', 'notification_emails',
            'created_at', 'updated_at',
        ]

    hold_type_display = graphene.String()
    status_display = graphene.String()
    is_active = graphene.Boolean()
    custodian_name = graphene.String()
    created_by_name = graphene.String()

    def resolve_hold_type_display(self, info):
        return self.get_hold_type_display()

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_is_active(self, info):
        return self.status == 'active'

    def resolve_custodian_name(self, info):
        return self.custodian_email or None

    def resolve_created_by_name(self, info):
        return self.user_id or None


# ---------------------------------------------------------------------------
# Organization (stub for standalone mode — no organization app required)
# ---------------------------------------------------------------------------

class OrganizationType(graphene.ObjectType):
    id = graphene.ID()
    name = graphene.String()
    slug = graphene.String()
    tier = graphene.String()
    website = graphene.String()
    deployment_model = graphene.String()
    zentinelle_tier = graphene.String()
    ai_budget_usd = graphene.Float()
    ai_budget_spent_usd = graphene.Float()
    overage_policy = graphene.String()
    ai_budget_alert_threshold = graphene.Float()
    settings = graphene.JSONString()
    created_at = graphene.DateTime()


class UpdateOrganizationSettingsPayload(graphene.ObjectType):
    success = graphene.Boolean()
    organization = graphene.Field(OrganizationType)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationType(graphene.ObjectType):
    id = graphene.ID()
    type = graphene.String()
    subject = graphene.String()
    message = graphene.String()
    status = graphene.String()
    status_date = graphene.DateTime()
    metadata = graphene.JSONString()
    created_at = graphene.DateTime()


class NotificationConnection(graphene.relay.Connection):
    class Meta:
        node = NotificationType

    total_count = graphene.Int()

    @staticmethod
    def resolve_total_count(root, info, **kwargs):
        iterable = getattr(root, 'iterable', None)
        if iterable is not None and hasattr(iterable, 'count'):
            return iterable.count()
        return 0




# ---------------------------------------------------------------------------
# Client Cove Integration
# ---------------------------------------------------------------------------

class ClientCoveIntegrationType(graphene.ObjectType):
    id = graphene.ID()
    client_cove_url = graphene.String()
    api_key_preview = graphene.String()
    is_active = graphene.Boolean()
    status = graphene.String()
    status_message = graphene.String()
    connected_org_name = graphene.String()
    last_tested_at = graphene.DateTime()

    def resolve_api_key_preview(self, info):
        key = getattr(self, 'api_key', '') or ''
        if len(key) > 8:
            return key[:4] + '••••' + key[-4:]
        return '••••' if key else ''


class TestClientCoveConnectionPayload(graphene.ObjectType):
    success = graphene.Boolean()
    message = graphene.String()
    org_name = graphene.String()


class SaveClientCoveConfigPayload(graphene.ObjectType):
    success = graphene.Boolean()
    message = graphene.String()
    integration = graphene.Field(lambda: ClientCoveIntegrationType)


class DisconnectClientCovePayload(graphene.ObjectType):
    success = graphene.Boolean()


class TestWebhookPayload(graphene.ObjectType):
    success = graphene.Boolean()
    message = graphene.String()
    status_code = graphene.Int()


class UsageMetricsSummaryType(graphene.ObjectType):
    total_api_calls = graphene.Int()
    total_tokens = graphene.BigInt()
    total_cost = graphene.Float()
    active_agents = graphene.Int()
    storage_used_mb = graphene.Float()


class UsageTimeSeriesPointType(graphene.ObjectType):
    date = graphene.String()
    api_calls = graphene.Int()
    tokens = graphene.BigInt()
    cost = graphene.Float()


class UsageByAgentType(graphene.ObjectType):
    agent_id = graphene.String()
    agent_name = graphene.String()
    api_calls = graphene.Int()
    tokens = graphene.BigInt()
    cost = graphene.Float()


class UsageByEndpointType(graphene.ObjectType):
    endpoint = graphene.String()
    api_calls = graphene.Int()
    avg_latency_ms = graphene.Float()


class UsageMetricsType(graphene.ObjectType):
    summary = graphene.Field(UsageMetricsSummaryType)
    time_series = graphene.List(UsageTimeSeriesPointType)
    by_agent = graphene.List(UsageByAgentType)
    by_endpoint = graphene.List(UsageByEndpointType)


class PromptCategoryType(graphene.ObjectType):
    id = graphene.ID()
    name = graphene.String()
    slug = graphene.String()
    description = graphene.String()
    icon = graphene.String()
    color = graphene.String()
    sort_order = graphene.Int()
    prompt_count = graphene.Int()

    def resolve_id(self, info):
        return str(self.id)

    def resolve_prompt_count(self, info):
        return self.prompts.filter(status='active').count()


class PromptTagType(graphene.ObjectType):
    id = graphene.ID()
    name = graphene.String()
    slug = graphene.String()
    tag_type = graphene.String()
    color = graphene.String()

    def resolve_id(self, info):
        return str(self.id)


class PromptTagConnection(graphene.relay.Connection):
    class Meta:
        node = PromptTagType


class SystemPromptType(graphene.ObjectType):
    id = graphene.ID()
    name = graphene.String()
    slug = graphene.String()
    description = graphene.String()
    prompt_text = graphene.String()
    prompt_type = graphene.String()
    prompt_type_display = graphene.String()
    category = graphene.Field(PromptCategoryType)
    tags = graphene.List(PromptTagType)
    compatible_providers = graphene.List(graphene.String)
    compatible_models = graphene.List(graphene.String)
    recommended_temperature = graphene.Float()
    recommended_max_tokens = graphene.Int()
    template_variables = graphene.List(graphene.String)
    variable_defaults = graphene.JSONString()
    example_input = graphene.String()
    example_output = graphene.String()
    use_cases = graphene.List(graphene.String)
    version = graphene.Int()
    status = graphene.String()
    status_display = graphene.String()
    visibility = graphene.String()
    visibility_display = graphene.String()
    is_featured = graphene.Boolean()
    is_verified = graphene.Boolean()
    usage_count = graphene.Int()
    favorite_count = graphene.Int()
    fork_count = graphene.Int()
    avg_rating = graphene.Float()
    is_favorited = graphene.Boolean()
    user_rating = graphene.Float()
    created_by_username = graphene.String()
    created_at = graphene.DateTime()
    updated_at = graphene.DateTime()

    def resolve_id(self, info):
        return str(self.id)

    def resolve_prompt_type_display(self, info):
        return self.get_prompt_type_display()

    def resolve_status_display(self, info):
        return self.get_status_display()

    def resolve_visibility_display(self, info):
        return self.get_visibility_display()

    def resolve_tags(self, info):
        return list(self.tags.all())

    def resolve_is_favorited(self, info):
        return False  # User-specific favorites not tracked in standalone mode

    def resolve_user_rating(self, info):
        return None

    def resolve_created_by_username(self, info):
        return self.user_id or ''

    def resolve_variable_defaults(self, info):
        import json
        return json.dumps(self.variable_defaults) if self.variable_defaults else '{}'


class SystemPromptConnection(graphene.relay.Connection):
    class Meta:
        node = SystemPromptType

    total_count = graphene.Int()

    @staticmethod
    def resolve_total_count(root, info, **kwargs):
        if root.iterable is not None:
            try:
                return root.iterable.count()
            except (AttributeError, TypeError):
                return len(list(root.iterable))
        return 0


class PolicyGraphNodeType(graphene.ObjectType):
    id = graphene.String()
    node_type = graphene.String()   # 'policy' | 'endpoint' | 'risk' | 'incident'
    label = graphene.String()
    sub_label = graphene.String()   # policy_type, status, etc.
    status = graphene.String()
    color = graphene.String()
    meta = graphene.JSONString()    # JSON with extra details for sidebar


class PolicyGraphEdgeType(graphene.ObjectType):
    source = graphene.String()
    target = graphene.String()
    relationship = graphene.String()  # 'scoped_to' | 'org_wide' | 'affects' | 'triggered'
    label = graphene.String()


class PolicyGraphType(graphene.ObjectType):
    nodes = graphene.List(PolicyGraphNodeType)
    edges = graphene.List(PolicyGraphEdgeType)
    node_count = graphene.Int()
    edge_count = graphene.Int()


class UsageAlertType(graphene.ObjectType):
    id = graphene.ID()
    alert_type = graphene.String()
    alert_type_display = graphene.String()
    severity = graphene.String()
    severity_display = graphene.String()
    title = graphene.String()
    message = graphene.String()
    details = graphene.JSONString()
    threshold_value = graphene.Float()
    current_value = graphene.Float()
    acknowledged = graphene.Boolean()
    acknowledged_at = graphene.DateTime()
    acknowledged_by_email = graphene.String()
    resolved = graphene.Boolean()
    resolved_at = graphene.DateTime()
    created_at = graphene.DateTime()


class UsageAlertConnection(graphene.relay.Connection):
    class Meta:
        node = UsageAlertType

    total_count = graphene.Int()

    @staticmethod
    def resolve_total_count(root, info, **kwargs):
        return 0


class ComplianceReportType(graphene.ObjectType):
    """Maps ComplianceAssessment model instances to the report list type."""
    id = graphene.ID()
    name = graphene.String()
    framework = graphene.String()
    generated_at = graphene.DateTime()
    period = graphene.String()
    status = graphene.String()
    download_url = graphene.String()

    def resolve_id(self, info):
        return str(self.id)

    def resolve_name(self, info):
        return f"Compliance Report {self.assessed_at.strftime('%Y-%m-%d')}"

    def resolve_framework(self, info):
        return self.framework_id or 'all'

    def resolve_generated_at(self, info):
        return self.assessed_at

    def resolve_period(self, info):
        return self.assessment_type

    def resolve_status(self, info):
        return self.status

    def resolve_download_url(self, info):
        return f'/api/zentinelle/v1/export/summary.json?assessment={self.id}'


class ComplianceReportConnection(graphene.relay.Connection):
    class Meta:
        node = ComplianceReportType

    total_count = graphene.Int()

    @staticmethod
    def resolve_total_count(root, info, **kwargs):
        if root.iterable is not None:
            try:
                return root.iterable.count()
            except (AttributeError, TypeError):
                return len(list(root.iterable))
        return 0


class EffectivePolicyType(graphene.ObjectType):
    id = graphene.ID()
    name = graphene.String()
    description = graphene.String()
    policy_type = graphene.String()
    scope_type = graphene.String()
    scope_name = graphene.String()
    config = graphene.JSONString()
    priority = graphene.Int()
    enforcement = graphene.String()
    enabled = graphene.Boolean()
    inherited_from = graphene.String()
    overrides = graphene.JSONString()


class EffectivePolicyConnection(graphene.relay.Connection):
    class Meta:
        node = EffectivePolicyType

    total_count = graphene.Int()

    @staticmethod
    def resolve_total_count(root, info, **kwargs):
        if root.iterable is not None:
            try:
                return len(list(root.iterable))
            except (AttributeError, TypeError):
                pass
        return 0


# ---------------------------------------------------------------------------
# Audit Analytics Types (ClickHouse-backed)
# ---------------------------------------------------------------------------

class AuditTimelinePointType(graphene.ObjectType):
    """A single time-bucketed point in the audit event timeline."""
    bucket = graphene.DateTime()
    event_type = graphene.String()
    count = graphene.Int()


class AuditEventCountType(graphene.ObjectType):
    """Audit event count broken down by event type."""
    event_type = graphene.String()
    count = graphene.Int()


class AuditTopAgentType(graphene.ObjectType):
    """Agent ranked by total event count."""
    agent_id = graphene.String()
    event_count = graphene.Int()


class AuditAnalyticsType(graphene.ObjectType):
    """Aggregated audit analytics sourced from ClickHouse."""
    timeline = graphene.List(AuditTimelinePointType)
    by_type = graphene.List(AuditEventCountType)
    top_agents = graphene.List(AuditTopAgentType)
