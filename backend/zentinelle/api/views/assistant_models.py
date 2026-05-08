"""
Per-model enable/disable for the assistant chat picker.

GET  /api/zentinelle/v1/assistant/models?provider=openai
POST /api/zentinelle/v1/assistant/models/toggle  {model_id, enabled}
POST /api/zentinelle/v1/assistant/models/bulk    {provider, enabled_ids: [...]}

Backed by AIModel.enabled_for_chat. Models the user disables are filtered
out of the assistant chat picker (see assistant_providers.py).
"""
import json
import logging

from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView

from zentinelle.api.views.assistant import IsAuthenticatedOrOpenMode
from zentinelle.services.llm_model_discovery import (clear_cache,
                                                      fetch_live_models)

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class AssistantModelsListView(APIView):
    """List all models for a provider with their enabled_for_chat state."""

    permission_classes = [IsAuthenticatedOrOpenMode]
    authentication_classes = []

    def get(self, request):
        from zentinelle.models import AIModel
        from zentinelle.schema.auth_helpers import get_request_tenant_id
        import os

        provider_slug = request.GET.get('provider', '')
        if not provider_slug:
            return JsonResponse({'error': 'provider is required'}, status=400)

        tenant_id = get_request_tenant_id(request.user)
        if not tenant_id and os.environ.get('AUTH_MODE', 'open').lower() == 'open':
            tenant_id = '00000000-0000-0000-0000-000000000001'

        # Trigger discovery so the registry is up to date
        try:
            fetch_live_models(provider_slug, tenant_id)
        except Exception as e:
            logger.debug('Live model fetch failed for %s: %s', provider_slug, e)

        qs = AIModel.objects.filter(
            provider__slug=provider_slug,
            model_type__in=['llm', 'multimodal', 'reasoning'],
        ).order_by('-release_date', 'name')

        models = [
            {
                'id': str(m.id),
                'model_id': m.model_id,
                'name': m.name,
                'release_date': m.release_date.isoformat() if m.release_date else None,
                'context_window': m.context_window,
                'capabilities': m.capabilities or [],
                'is_available': m.is_available,
                'enabled_for_chat': m.enabled_for_chat,
                'deprecated': m.deprecated,
            }
            for m in qs
        ]
        return JsonResponse({'provider': provider_slug, 'models': models})


@method_decorator(csrf_exempt, name='dispatch')
class AssistantModelsToggleView(APIView):
    """Toggle one model's enabled_for_chat flag."""

    permission_classes = [IsAuthenticatedOrOpenMode]
    authentication_classes = []

    def post(self, request):
        from zentinelle.models import AIModel

        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        model_id = data.get('model_id')
        enabled = data.get('enabled')
        if not model_id or enabled is None:
            return JsonResponse(
                {'error': 'model_id and enabled are required'}, status=400
            )

        provider_slug = data.get('provider')
        qs = AIModel.objects.filter(model_id=model_id)
        if provider_slug:
            qs = qs.filter(provider__slug=provider_slug)

        obj = qs.first()
        if not obj:
            return JsonResponse({'error': 'Model not found'}, status=404)

        obj.enabled_for_chat = bool(enabled)
        obj.save(update_fields=['enabled_for_chat', 'updated_at'])

        return JsonResponse({
            'model_id': obj.model_id,
            'enabled_for_chat': obj.enabled_for_chat,
        })


@method_decorator(csrf_exempt, name='dispatch')
class AssistantModelsBulkView(APIView):
    """Set the enabled set for an entire provider at once."""

    permission_classes = [IsAuthenticatedOrOpenMode]
    authentication_classes = []

    def post(self, request):
        from zentinelle.models import AIModel

        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        provider_slug = data.get('provider')
        enabled_ids = data.get('enabled_ids')
        if not provider_slug or enabled_ids is None:
            return JsonResponse(
                {'error': 'provider and enabled_ids are required'}, status=400
            )

        enabled_set = set(enabled_ids)
        qs = AIModel.objects.filter(provider__slug=provider_slug)

        updated = 0
        for m in qs:
            target = m.model_id in enabled_set
            if m.enabled_for_chat != target:
                m.enabled_for_chat = target
                m.save(update_fields=['enabled_for_chat', 'updated_at'])
                updated += 1

        # Clear discovery cache so the picker refreshes
        clear_cache(provider_slug)

        return JsonResponse({'provider': provider_slug, 'updated': updated})
