"""Feature and entitlement status for the optional policy copilot."""
from django.http import JsonResponse
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess
from zentinelle.models import LLMProviderKey, TenantConfig
from zentinelle.schema.auth_helpers import get_request_tenant_id


class PolicyCopilotStatusView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def get(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        values = config.settings if config else {}
        key_configured = LLMProviderKey.objects.filter(
            tenant_id=tenant_id, is_active=True, enabled_for_assistant=True,
        ).exists()
        enabled = bool(values.get('policy_copilot_enabled', False))
        return JsonResponse({
            'enabled': enabled and key_configured,
            'configured': enabled,
            'available': key_configured,
            'reason': None if (enabled and key_configured) else (
                'Configure an active provider key' if enabled else 'Disabled by tenant policy'
            ),
            'model': values.get('assistant_model', ''),
            'provider': values.get('assistant_provider', ''),
        })
