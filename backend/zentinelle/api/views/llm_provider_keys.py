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
                    'lastUsedAt': k.last_used_at.isoformat() if k.last_used_at else None,
                    'updatedAt': k.updated_at.isoformat(),
                }
                for k in keys
            ],
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
