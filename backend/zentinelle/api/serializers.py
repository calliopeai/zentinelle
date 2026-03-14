"""
DRF Serializers for Zentinelle API.
"""
from rest_framework import serializers
from zentinelle.models import (
    AgentEndpoint,
    Policy,
    Event,
    AuditLog,
)


# =============================================================================
# Agent-Facing Serializers (used by SDK)
# =============================================================================

class RegisterRequestSerializer(serializers.Serializer):
    """Request to register a new agent."""
    agent_id = serializers.SlugField(max_length=100, required=False, allow_blank=True)
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
    """Request to evaluate policies for an action."""
    agent_id = serializers.CharField()
    action = serializers.CharField(max_length=50)
    user_id = serializers.CharField(max_length=255, required=False, allow_blank=True)
    context = serializers.JSONField(default=dict)


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
    category = serializers.ChoiceField(
        choices=Event.Category.choices,
        default=Event.Category.TELEMETRY
    )
    payload = serializers.JSONField(default=dict)
    timestamp = serializers.DateTimeField()
    user_id = serializers.CharField(max_length=255, required=False, allow_blank=True)


class EventsRequestSerializer(serializers.Serializer):
    """Request to ingest batch of events."""
    agent_id = serializers.CharField()
    events = EventInputSerializer(many=True)


class EventsResponseSerializer(serializers.Serializer):
    """Response after accepting events."""
    accepted = serializers.IntegerField()
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
