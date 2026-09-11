"""Tenant-scoped, allowlisted runtime settings for administrators."""
import json

from django.conf import settings
from django.http import JsonResponse
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAdminAccess
from zentinelle.auth.mode import is_open_mode
from zentinelle.models import TenantConfig
from zentinelle.schema.auth_helpers import get_request_tenant_id

SETTING_DEFAULTS = {
    'assistant_allowed_topics': lambda: list(getattr(settings, 'ASSISTANT_ALLOWED_TOPICS', ())),
    'content_capture_mode': lambda: getattr(settings, 'CONTENT_CAPTURE_MODE', 'metadata'),
    'assistant_model': lambda: getattr(settings, 'ASSISTANT_MODEL', ''),
    'assistant_provider': lambda: getattr(settings, 'ASSISTANT_PROVIDER', ''),
    'taxonomy_extensions': lambda: [],
}


def _tenant_id(request):
    tenant_id = get_request_tenant_id(request.user)
    if not tenant_id and is_open_mode():
        return '00000000-0000-0000-0000-000000000001'
    return tenant_id or ''


class RuntimeSettingsView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def get(self, request):
        tenant_id = _tenant_id(request)
        config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        stored = config.settings if config else {}
        values = {key: stored.get(key, factory()) for key, factory in SETTING_DEFAULTS.items()}
        return JsonResponse({'settings': values, 'allowedKeys': list(SETTING_DEFAULTS)})

    def patch(self, request):
        try:
            payload = json.loads(request.body)
        except (TypeError, ValueError, json.JSONDecodeError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        updates = payload.get('settings')
        if not isinstance(updates, dict) or not updates:
            return JsonResponse({'error': 'settings object is required'}, status=400)
        unknown = sorted(set(updates) - set(SETTING_DEFAULTS))
        if unknown:
            return JsonResponse({'error': 'Unknown or unsafe settings', 'keys': unknown}, status=400)
        if 'content_capture_mode' in updates and updates['content_capture_mode'] not in {'metadata', 'full'}:
            return JsonResponse({'error': 'content_capture_mode must be metadata or full'}, status=400)
        if 'assistant_allowed_topics' in updates and not isinstance(updates['assistant_allowed_topics'], list):
            return JsonResponse({'error': 'assistant_allowed_topics must be a list'}, status=400)
        if 'taxonomy_extensions' in updates:
            if not isinstance(updates['taxonomy_extensions'], list) or not all(isinstance(item, str) for item in updates['taxonomy_extensions']):
                return JsonResponse({'error': 'taxonomy_extensions must be a list of strings'}, status=400)
        tenant_id = _tenant_id(request)
        config, _ = TenantConfig.objects.get_or_create(tenant_id=tenant_id)
        config.settings = {**config.settings, **updates}
        config.save(update_fields=['settings', 'updated_at'])
        return JsonResponse({'settings': {key: config.settings.get(key, factory()) for key, factory in SETTING_DEFAULTS.items()}})
