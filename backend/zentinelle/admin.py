from django.contrib import admin
from zentinelle.models import (
    AgentEndpoint,
    Policy,
    Event,
    AuditLog,
)


@admin.register(AgentEndpoint)
class AgentEndpointAdmin(admin.ModelAdmin):
    list_display = ['name', 'agent_id', 'tenant_id', 'agent_type', 'status', 'health', 'last_heartbeat']
    list_filter = ['agent_type', 'status', 'health']
    search_fields = ['name', 'agent_id', 'api_key_prefix', 'tenant_id']
    readonly_fields = ['id', 'registered_at', 'last_heartbeat', 'created_at', 'updated_at']
    actions = ['regenerate_api_key']

    def save_model(self, request, obj, form, change):
        # Generate API key on create if not provided
        if not change and not obj.api_key_hash:
            api_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
            obj.api_key_hash = key_hash
            obj.api_key_prefix = key_prefix
            self.message_user(request, f"Generated API Key (save this!): {api_key}", level='WARNING')
        super().save_model(request, obj, form, change)

    @admin.action(description="Regenerate API key (CAUTION: old key will stop working)")
    def regenerate_api_key(self, request, queryset):
        for endpoint in queryset:
            new_key = endpoint.rotate_api_key()
            self.message_user(request, f"{endpoint.agent_id} new key: {new_key}", level='WARNING')


@admin.register(Policy)
class PolicyAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant_id', 'policy_type', 'scope_type', 'priority', 'enabled', 'enforcement']
    list_filter = ['policy_type', 'scope_type', 'enabled', 'enforcement']
    search_fields = ['name', 'description', 'tenant_id']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ['event_type', 'event_category', 'endpoint', 'status', 'occurred_at', 'received_at']
    list_filter = ['event_category', 'event_type', 'status']
    search_fields = ['event_type', 'user_identifier', 'correlation_id', 'tenant_id']
    readonly_fields = ['id', 'received_at']
    raw_id_fields = ['endpoint']
    date_hierarchy = 'occurred_at'


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['action', 'resource_type', 'resource_name', 'ext_user_id', 'timestamp']
    list_filter = ['action', 'resource_type']
    search_fields = ['resource_name', 'resource_id', 'ext_user_id', 'tenant_id']
    readonly_fields = ['id', 'timestamp']
    date_hierarchy = 'timestamp'
