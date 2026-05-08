"""
GET /api/zentinelle/v1/assistant/providers

Returns LLM providers with API keys configured (tenant or env), filtered to
chat-capable models from the AIModel registry. Sorted by release date,
deprecated models excluded.

Query params:
  - require_tools=true — only return models with function_calling capability
  - all=true — include deprecated models
"""
import os
from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from zentinelle.services.llm_provider import OPENAI_COMPAT_PROVIDERS

PROVIDER_LABELS = {
    'anthropic': 'Anthropic',
    'openai': 'OpenAI',
    'google': 'Google',
    'mistral': 'Mistral AI',
    'deepseek': 'DeepSeek',
    'fireworks': 'Fireworks',
    'together': 'Together',
    'groq': 'Groq',
    'cerebras': 'Cerebras',
    'sambanova': 'SambaNova',
    'xai': 'xAI',
    'openrouter': 'OpenRouter',
    'litellm': 'LiteLLM',
    'ollama': 'Ollama',
    'lmstudio': 'LM Studio',
    'perplexity': 'Perplexity',
    'cohere': 'Cohere',
    'nvidia': 'NVIDIA',
    'huggingface': 'Hugging Face',
}


def _has_credentials(provider: str, tenant_id: str = None) -> bool:
    """Check if a provider has API keys configured (tenant or env)."""
    if tenant_id:
        try:
            from zentinelle.models import LLMProviderKey
            if LLMProviderKey.objects.filter(
                tenant_id=tenant_id,
                provider=provider,
                is_active=True,
            ).exists():
                return True
        except Exception:
            pass

    if provider == 'anthropic':
        return bool(os.environ.get('ANTHROPIC_API_KEY'))
    if provider == 'google':
        return bool(os.environ.get('GOOGLE_API_KEY'))
    if provider in ('ollama', 'lmstudio'):
        return True
    config = OPENAI_COMPAT_PROVIDERS.get(provider, {})
    env_var = config.get('env')
    if not env_var:
        return False
    return bool(os.environ.get(env_var))


@method_decorator(csrf_exempt, name='dispatch')
class AssistantProvidersView(View):
    """List providers + their available chat models from the AIModel registry."""

    def get(self, request):
        from zentinelle.models import AIModel
        from zentinelle.schema.auth_helpers import get_request_tenant_id

        tenant_id = get_request_tenant_id(request.user) or 'default'
        require_tools = request.GET.get('require_tools', '').lower() == 'true'
        include_deprecated = request.GET.get('all', '').lower() == 'true'

        # Query the AIModel registry — chat-capable models, available, sorted by recency
        qs = AIModel.objects.filter(
            is_available=True,
            model_type__in=['llm', 'multimodal', 'reasoning'],
        ).select_related('provider')

        if not include_deprecated:
            qs = qs.filter(deprecated=False)

        # Order: most recent first, then by name
        qs = qs.order_by('-release_date', 'provider__slug', 'name')

        # Group by provider
        by_provider = {}
        for model in qs:
            slug = model.provider.slug
            caps = model.capabilities or []

            if require_tools and 'function_calling' not in caps:
                continue

            if not _has_credentials(slug, tenant_id):
                continue

            if slug not in by_provider:
                by_provider[slug] = {
                    'id': slug,
                    'name': PROVIDER_LABELS.get(slug, model.provider.name),
                    'models': [],
                }

            by_provider[slug]['models'].append({
                'value': model.model_id,
                'label': model.name,
                'capabilities': caps,
                'contextWindow': model.context_window,
                'releaseDate': model.release_date.isoformat() if model.release_date else None,
                'supportsTools': 'function_calling' in caps,
                'supportsVision': 'vision' in caps,
                'riskLevel': model.risk_level,
            })

        # If we found nothing in the registry, fall back to env-only providers
        # so the assistant doesn't return empty when models haven't been synced
        if not by_provider:
            from zentinelle.api.views.assistant_providers_fallback import FALLBACK_PROVIDERS
            for slug, models in FALLBACK_PROVIDERS.items():
                if _has_credentials(slug, tenant_id):
                    by_provider[slug] = {
                        'id': slug,
                        'name': PROVIDER_LABELS.get(slug, slug),
                        'models': models,
                    }

        return JsonResponse({'providers': list(by_provider.values())})
