"""
GET    /api/zentinelle/v1/settings/llm-providers — list configured providers
POST   /api/zentinelle/v1/settings/llm-providers — set/update a provider key
DELETE /api/zentinelle/v1/settings/llm-providers/{provider} — remove a key

Tenant-scoped, encrypted-at-rest provider API key storage.
"""
import json
import os
from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from zentinelle.models import LLMProviderKey
from zentinelle.schema.auth_helpers import get_request_tenant_id


def _resolve_tenant_id(request) -> str:
    """Resolve tenant_id, with open-mode fallback to standalone tenant."""
    tid = get_request_tenant_id(request.user)
    if not tid and os.environ.get('AUTH_MODE', 'open').lower() == 'open':
        return '00000000-0000-0000-0000-000000000001'
    return tid or 'default'


@method_decorator(csrf_exempt, name='dispatch')
class LLMProviderKeysView(View):

    def get(self, request):
        tenant_id = _resolve_tenant_id(request)
        keys = LLMProviderKey.objects.filter(tenant_id=tenant_id)
        return JsonResponse({
            'providers': [
                {
                    'provider': k.provider,
                    'keyPrefix': k.key_prefix,
                    'isActive': k.is_active,
                    'enabledForAssistant': k.enabled_for_assistant,
                    'lastUsedAt': k.last_used_at.isoformat() if k.last_used_at else None,
                    'updatedAt': k.updated_at.isoformat(),
                }
                for k in keys
            ],
        })

    def patch(self, request):
        """Toggle enabled_for_assistant without changing the key itself.

        For local providers (ollama, lmstudio) without a stored key,
        creates a placeholder row to track the toggle state.
        """
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        provider = data.get('provider', '').strip().lower()
        if not provider:
            return JsonResponse({'error': 'provider is required'}, status=400)

        tenant_id = _resolve_tenant_id(request)
        obj, _ = LLMProviderKey.objects.get_or_create(
            tenant_id=tenant_id, provider=provider,
            defaults={
                'encrypted_key': b'',
                'key_prefix': '',
                'is_active': True,
                'enabled_for_assistant': True,
            },
        )

        if 'enabledForAssistant' in data:
            obj.enabled_for_assistant = bool(data['enabledForAssistant'])
        if 'isActive' in data:
            obj.is_active = bool(data['isActive'])
        obj.save()

        return JsonResponse({
            'provider': obj.provider,
            'keyPrefix': obj.key_prefix,
            'isActive': obj.is_active,
            'enabledForAssistant': obj.enabled_for_assistant,
        })

    def post(self, request):
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        provider = data.get('provider', '').strip().lower()
        api_key = data.get('apiKey', '').strip()

        if not provider:
            return JsonResponse({'error': 'provider is required'}, status=400)
        if not api_key:
            return JsonResponse({'error': 'apiKey is required'}, status=400)

        tenant_id = _resolve_tenant_id(request)

        obj, created = LLMProviderKey.objects.get_or_create(
            tenant_id=tenant_id,
            provider=provider,
        )
        obj.set_key(api_key)
        obj.is_active = True
        obj.save()

        # Invalidate model cache so the live fetch picks up the new key
        try:
            from zentinelle.services.llm_model_discovery import clear_cache
            clear_cache(provider=provider, tenant_id=tenant_id)
        except Exception:
            pass

        return JsonResponse({
            'provider': obj.provider,
            'keyPrefix': obj.key_prefix,
            'isActive': obj.is_active,
            'created': created,
        }, status=201 if created else 200)


@method_decorator(csrf_exempt, name='dispatch')
class LLMProviderKeyDeleteView(View):

    def delete(self, request, provider):
        tenant_id = _resolve_tenant_id(request)
        deleted, _ = LLMProviderKey.objects.filter(
            tenant_id=tenant_id,
            provider=provider.lower(),
        ).delete()
        return JsonResponse({'deleted': deleted > 0})
