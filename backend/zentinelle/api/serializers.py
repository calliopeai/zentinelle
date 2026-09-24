"""
DRF Serializers for Zentinelle API.
"""
from rest_framework import serializers

from zentinelle.models import AgentEndpoint, AuditLog, Event, Policy
from zentinelle.services.astrolift_clusters import (CLUSTER_ID_PATTERN,
                                                    DEFAULT_OVERLAP,
                                                    MAX_AGENT_KEY_TTL,
                                                    MAX_OVERLAP)

# =============================================================================
# Agent-Facing Serializers (used by SDK)
# =============================================================================


class RegisterRequestSerializer(serializers.Serializer):
    """Request to register a new agent."""
    agent_id = serializers.SlugField(max_length=100, required=False, allow_blank=True)
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    agent_type = serializers.ChoiceField(choices=AgentEndpoint.AgentType.choices)
    capabilities = serializers.ListField(
        child=serializers.CharField(max_length=50),
        default=list
    )
    metadata = serializers.JSONField(default=dict)


class RegisterResponseSerializer(serializers.Serializer):
    """Response after registering an agent."""
    agent_id = serializers.CharField()
    api_key = serializers.CharField()  # Only returned on registration
    config = serializers.JSONField()
    policies = serializers.ListField()


class ConfigResponseSerializer(serializers.Serializer):
    """Response with agent config and policies."""
    agent_id = serializers.CharField()
    config = serializers.JSONField()
    policies = serializers.ListField()
    updated_at = serializers.DateTimeField()


class PolicyConfigSerializer(serializers.Serializer):
    """Serializer for policy in config response."""
    id = serializers.UUIDField()
    name = serializers.CharField()
    type = serializers.CharField(source='policy_type')
    enforcement = serializers.CharField()
    config = serializers.JSONField()


class SecretsResponseSerializer(serializers.Serializer):
    """Response with secrets for an agent."""
    secrets = serializers.DictField(child=serializers.CharField())
    providers = serializers.JSONField()
    expires_at = serializers.DateTimeField()


class EvaluateRequestSerializer(serializers.Serializer):
    """Identity is derived from the authenticated key; an explicit ID must match."""
    agent_id = serializers.CharField(required=False, allow_blank=True)
    action = serializers.CharField(max_length=50)
    user_id = serializers.CharField(max_length=255, required=False, allow_blank=True)
    authority = serializers.DictField(required=False, default=dict)
    context = serializers.DictField(default=dict)
    # What the caller can honour, e.g. {"supports_steer": true} (#396). Kept
    # out of `context` so it never changes the approval digest.
    target_capabilities = serializers.JSONField(required=False)

    def validate_target_capabilities(self, value):
        from zentinelle.services.actions import normalize_capabilities
        try:
            return normalize_capabilities(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class HostToolCallContextSerializer(serializers.Serializer):
    """What an agent host's tool_call context must say (#377).

    One host key serves many sessions, so each call names its harness, session
    and tool. Validation only: the context is evaluated as sent.
    """
    harness = serializers.RegexField(r'^[a-z0-9][a-z0-9_.-]*$', max_length=50)
    session_id = serializers.CharField(max_length=255)
    chat_id = serializers.CharField(max_length=255, required=False)
    tool_call_id = serializers.CharField(max_length=255, required=False)
    tool_name = serializers.CharField(max_length=255)
    tool_input = serializers.JSONField(required=False)


class GatewayProviderKeyRequestSerializer(serializers.Serializer):
    """Which provider's key the gateway wants for the agent's tenant (#380).

    Spelled as LLMProviderKey stores it: lowercase, the way the settings page
    saves it and the gateway's routing table names it.
    """
    provider = serializers.RegexField(r'^[a-z0-9][a-z0-9_.-]*$', max_length=50)


class AstroliftInstallInfoSerializer(serializers.Serializer):
    """How an Astrolift install describes itself when it connects (#389)."""
    base_url = serializers.URLField(max_length=500)
    name = serializers.CharField(max_length=255)

    def validate_base_url(self, value):
        if not value.lower().startswith(('https://', 'http://')):
            raise serializers.ValidationError('base_url must be an http or https URL')
        return value.rstrip('/')


class AstroliftConnectSerializer(serializers.Serializer):
    """The one-time enrollment code, and the install it connects."""
    code = serializers.CharField(max_length=128)
    install = AstroliftInstallInfoSerializer()


class AstroliftClusterSerializer(serializers.Serializer):
    """A cluster an install registers. tenant_ids may only narrow the install's."""
    cluster_id = serializers.RegexField(CLUSTER_ID_PATTERN)
    provider = serializers.RegexField(r'^[a-z0-9][a-z0-9_.-]*$', max_length=50, required=False, allow_blank=True,
                                      default='')
    region = serializers.RegexField(r'^[A-Za-z0-9][A-Za-z0-9_.-]*$', max_length=100, required=False,
                                    allow_blank=True, default='')
    tenant_ids = serializers.ListField(
        child=serializers.CharField(max_length=255), required=False, min_length=1, max_length=100)


class AstroliftRotateSerializer(serializers.Serializer):
    """How long the credentials a rotation replaces keep working. 0 ends them now."""
    overlap_seconds = serializers.IntegerField(
        min_value=0, max_value=int(MAX_OVERLAP.total_seconds()), default=int(DEFAULT_OVERLAP.total_seconds()))


class AstroliftAgentKeySerializer(serializers.Serializer):
    """An agent key an install mints for one of its tasks or boxes (#400).

    No tenant_id means the install's only tenant.
    """
    agent_id = serializers.SlugField(max_length=100)
    ttl_seconds = serializers.IntegerField(min_value=1, max_value=int(MAX_AGENT_KEY_TTL.total_seconds()))
    tenant_id = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    deployment_id = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class AstroliftAgentRenewSerializer(serializers.Serializer):
    """How long from now an agent key minted by the install keeps working."""
    ttl_seconds = serializers.IntegerField(min_value=1, max_value=int(MAX_AGENT_KEY_TTL.total_seconds()))
    tenant_id = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class AstroliftHeartbeatCountersSerializer(serializers.Serializer):
    """Counts since the gateway started. Counters it does not know are dropped."""
    requests = serializers.IntegerField(min_value=0, required=False)
    blocked = serializers.IntegerField(min_value=0, required=False)
    agents_seen = serializers.IntegerField(min_value=0, required=False)


class AstroliftHeartbeatSerializer(serializers.Serializer):
    """A gateway reporting on its cluster."""
    status = serializers.ChoiceField(choices=['healthy', 'degraded', 'unhealthy'])
    version = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')
    counters = AstroliftHeartbeatCountersSerializer(required=False)


class EnrollmentCodeRequestSerializer(serializers.Serializer):
    """An admin asking for an enrollment code. No tenant_ids means the admin's own tenant."""
    tenant_ids = serializers.ListField(
        child=serializers.CharField(max_length=255), required=False, min_length=1, max_length=100)
    ttl_minutes = serializers.IntegerField(min_value=1, max_value=60, default=15)


class ApprovalDecisionSerializer(serializers.Serializer):
    """An operator's decision on a held action."""
    decision = serializers.ChoiceField(choices=['approve', 'deny'])
    reason = serializers.CharField(max_length=1000, allow_blank=True, default='')


class EvaluateResponseSerializer(serializers.Serializer):
    """Response from policy evaluation."""
    allowed = serializers.BooleanField()
    reason = serializers.CharField(allow_null=True, required=False)
    policies_evaluated = serializers.ListField()
    warnings = serializers.ListField(child=serializers.CharField())
    context = serializers.JSONField()


class EventInputSerializer(serializers.Serializer):
    """Single event in batch."""
    type = serializers.CharField(max_length=100)
    event_id = serializers.CharField(max_length=255, required=False, allow_blank=False)
    category = serializers.ChoiceField(
        choices=Event.Category.choices,
        default=Event.Category.TELEMETRY
    )
    payload = serializers.JSONField(default=dict)
    timestamp = serializers.DateTimeField()
    user_id = serializers.CharField(max_length=255, required=False, allow_blank=True)


class EventsRequestSerializer(serializers.Serializer):
    """Request to ingest batch of events.

    The key names its agent, so agent_id may be left out; the gateway's usage
    reports leave it blank (#406).
    """
    agent_id = serializers.CharField(required=False, allow_blank=True, default='')
    events = EventInputSerializer(many=True)


class EventsResponseSerializer(serializers.Serializer):
    """Response after accepting events."""
    accepted = serializers.IntegerField()
    duplicates = serializers.IntegerField(default=0)
    batch_id = serializers.CharField()


class HeartbeatRequestSerializer(serializers.Serializer):
    """Heartbeat request from agent."""
    agent_id = serializers.CharField()
    status = serializers.ChoiceField(
        choices=AgentEndpoint.Health.choices,
        default=AgentEndpoint.Health.HEALTHY
    )
    metrics = serializers.JSONField(default=dict)

    # Config hash fields for drift detection
    config_hash = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=64,
        help_text='SHA256 hash of current running configuration'
    )
    secrets_hash = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=64,
        help_text='SHA256 hash of loaded secrets'
    )
    version = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
        help_text='Agent/hub version'
    )
    telemetry = serializers.JSONField(
        required=False,
        default=dict,
        help_text='Live telemetry data (active_sessions, uptime, build info)'
    )


class HeartbeatResponseSerializer(serializers.Serializer):
    """Heartbeat response."""
    acknowledged = serializers.BooleanField()
    drift_detected = serializers.BooleanField(
        required=False,
        help_text='Whether configuration drift was detected'
    )
    sync_required = serializers.BooleanField(
        required=False,
        help_text='Whether a config sync is required'
    )


# =============================================================================
# Admin-Facing Serializers (used by Portal)
# =============================================================================

class AgentEndpointSerializer(serializers.ModelSerializer):
    """Full endpoint serializer for admin."""

    class Meta:
        model = AgentEndpoint
        fields = [
            'id', 'tenant_id', 'agent_id', 'name', 'description',
            'agent_type', 'api_key_prefix', 'registered_at', 'last_heartbeat',
            'status', 'health', 'capabilities', 'metadata', 'config',
            'deployment_id_ext', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'api_key_prefix', 'registered_at', 'last_heartbeat',
            'created_at', 'updated_at',
        ]


class AgentEndpointListSerializer(serializers.ModelSerializer):
    """Lightweight endpoint serializer for lists."""

    class Meta:
        model = AgentEndpoint
        fields = [
            'id', 'agent_id', 'name', 'agent_type', 'status', 'health',
            'last_heartbeat', 'capabilities',
        ]


class PolicySerializer(serializers.ModelSerializer):
    """Full policy serializer for admin."""

    class Meta:
        model = Policy
        fields = [
            'id', 'tenant_id', 'scope_type',
            'scope_deployment_id_ext', 'scope_endpoint',
            'name', 'description', 'policy_type', 'config',
            'priority', 'enabled', 'enforcement',
            'user_id', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PolicyListSerializer(serializers.ModelSerializer):
    """Lightweight policy serializer for lists."""
    scope_name = serializers.SerializerMethodField()

    class Meta:
        model = Policy
        fields = [
            'id', 'name', 'policy_type', 'scope_type', 'scope_name',
            'priority', 'enabled', 'enforcement', 'created_at',
        ]

    def get_scope_name(self, obj):
        if obj.scope_type == Policy.ScopeType.ENDPOINT and obj.scope_endpoint:
            return obj.scope_endpoint.name
        return "Organization-wide"


class EventSerializer(serializers.ModelSerializer):
    """Event serializer for admin viewing."""
    endpoint_name = serializers.CharField(source='endpoint.name', read_only=True)

    class Meta:
        model = Event
        fields = [
            'id', 'tenant_id', 'endpoint', 'endpoint_name',
            'deployment_id_ext', 'user_identifier',
            'event_type', 'event_category', 'payload',
            'status', 'processed_at', 'error_message',
            'occurred_at', 'received_at', 'correlation_id',
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    """Audit log serializer for admin viewing."""

    class Meta:
        model = AuditLog
        fields = [
            'id', 'tenant_id', 'ext_user_id',
            'api_key_prefix', 'ip_address',
            'action', 'resource_type', 'resource_id', 'resource_name',
            'changes', 'metadata', 'timestamp',
        ]
