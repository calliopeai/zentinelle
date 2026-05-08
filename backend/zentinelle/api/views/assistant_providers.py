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

        # In open auth mode, default to the standalone tenant
        tenant_id = get_request_tenant_id(request.user)
        if not tenant_id and os.environ.get('AUTH_MODE', 'open').lower() == 'open':
            tenant_id = '00000000-0000-0000-0000-000000000001'
        if not tenant_id:
            tenant_id = 'default'
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

        # Group registry models by provider
        registry_by_provider = {}
        for model in qs:
            slug = model.provider.slug
            caps = model.capabilities or []

            if require_tools and 'function_calling' not in caps:
                continue

            if slug not in registry_by_provider:
                registry_by_provider[slug] = {
                    'id': slug,
                    'name': PROVIDER_LABELS.get(slug, model.provider.name),
                    'models': [],
                }

            registry_by_provider[slug]['models'].append({
                'value': model.model_id,
                'label': model.name,
                'capabilities': caps,
                'contextWindow': model.context_window,
                'releaseDate': model.release_date.isoformat() if model.release_date else None,
                'supportsTools': 'function_calling' in caps,
                'supportsVision': 'vision' in caps,
                'riskLevel': model.risk_level,
            })

        # For each provider with credentials, use registry models if any,
        # else fall back to curated list. This way we always show models
        # for every configured provider.
        from zentinelle.api.views.assistant_providers_fallback import FALLBACK_PROVIDERS
        by_provider = {}
        all_provider_slugs = set(FALLBACK_PROVIDERS.keys()) | set(registry_by_provider.keys())

        for slug in all_provider_slugs:
            if not _has_credentials(slug, tenant_id):
                continue

            # Prefer registry data, fall back to curated list
            if slug in registry_by_provider and registry_by_provider[slug]['models']:
                by_provider[slug] = registry_by_provider[slug]
            elif slug in FALLBACK_PROVIDERS:
                models = FALLBACK_PROVIDERS[slug]
                if require_tools:
                    models = [m for m in models if m.get('supportsTools')]
                if models:
                    by_provider[slug] = {
                        'id': slug,
                        'name': PROVIDER_LABELS.get(slug, slug),
                        'models': models,
                    }

        return JsonResponse({'providers': list(by_provider.values())})
