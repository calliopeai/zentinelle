"""Feature and entitlement status for the optional policy copilot."""
from django.http import JsonResponse
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess
from zentinelle.models import AuditLog, LLMProviderKey, Policy, TenantConfig
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


class PolicyCopilotDraftView(APIView):
    """Validate a structured policy draft without mutating live policy state."""
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def post(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        values = config.settings if config else {}
        if not values.get('policy_copilot_enabled', False):
            return JsonResponse({'error': 'Policy copilot is disabled'}, status=403)
        if not LLMProviderKey.objects.filter(tenant_id=tenant_id, is_active=True, enabled_for_assistant=True).exists():
            return JsonResponse({'error': 'Configure an active provider key before using the copilot'}, status=503)
        payload = request.data if isinstance(request.data, dict) else {}
        policy_type = payload.get('policy_type')
        draft_config = payload.get('config')
        valid_types = {choice[0] for choice in Policy.PolicyType.choices}
        errors = {}
        if policy_type not in valid_types:
            errors['policy_type'] = 'Unsupported policy type'
        if not isinstance(draft_config, dict):
            errors['config'] = 'Policy config must be an object'
        if errors:
            return JsonResponse({'error': 'Invalid policy draft', 'fields': errors}, status=400)
        AuditLog.objects.create(
            tenant_id=tenant_id, ext_user_id=str(request.user.pk), action=AuditLog.Action.ACCESS,
            resource_type='policy_copilot', resource_id=tenant_id,
            metadata={'operation': 'draft', 'policy_type': policy_type},
        )
        draft = {
            'name': payload.get('name', ''),
            'policy_type': policy_type,
            'config': draft_config,
            'scope_type': payload.get('scope_type', Policy.ScopeType.ORGANIZATION),
            'enforcement': payload.get('enforcement', Policy.Enforcement.ENFORCE),
        }
        return JsonResponse({
            'draft': draft,
            'mutated': False,
            'next_step': 'Submit through the staged policy change workflow for validation and approval',
        })
