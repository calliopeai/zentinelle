"""
Sync AI model registry from live provider APIs.

Fetches model lists from OpenAI, Anthropic, and Google, then upserts
into the AIModel table. Run via management command or Celery beat.
"""
import logging
from decimal import Decimal

import httpx

from zentinelle.models.ai_provider import AIProvider
from zentinelle.models.model_registry import AIModel

logger = logging.getLogger(__name__)

PROVIDER_FETCHERS = {}


def register_fetcher(slug):
    def decorator(fn):
        PROVIDER_FETCHERS[slug] = fn
        return fn
    return decorator


def sync_all_providers():
    results = {}
    for provider in AIProvider.objects.filter(is_active=True):
        fetcher = PROVIDER_FETCHERS.get(provider.slug)
        if not fetcher:
            continue
        try:
            models = fetcher(provider)
            upserted = _upsert_models(provider, models)
            results[provider.slug] = upserted
            logger.info('Synced %d models from %s', upserted, provider.slug)
        except Exception as e:
            logger.warning('Failed to sync models from %s: %s', provider.slug, e)
            results[provider.slug] = str(e)
    return results


def sync_provider(slug: str):
    provider = AIProvider.objects.filter(slug=slug, is_active=True).first()
    if not provider:
        raise ValueError(f'Provider {slug} not found or inactive')
    fetcher = PROVIDER_FETCHERS.get(slug)
    if not fetcher:
        raise ValueError(f'No fetcher registered for {slug}')
    models = fetcher(provider)
    return _upsert_models(provider, models)


def _upsert_models(provider, models):
    count = 0
    for m in models:
        _, created = AIModel.objects.update_or_create(
            provider=provider,
            model_id=m['model_id'],
            defaults={
                'name': m.get('name', m['model_id']),
                'description': m.get('description', ''),
                'model_type': m.get('model_type', AIModel.ModelType.LLM),
                'context_window': m.get('context_window'),
                'max_output_tokens': m.get('max_output_tokens'),
                'input_price_per_million': Decimal(str(m['input_price'])) if m.get('input_price') else None,
                'output_price_per_million': Decimal(str(m['output_price'])) if m.get('output_price') else None,
                'is_available': m.get('is_available', True),
                'deprecated': m.get('deprecated', False),
                'is_global': True,
                'capabilities': m.get('capabilities', []),
            },
        )
        count += 1
    return count


@register_fetcher('openai')
def _fetch_openai(provider):
    import os
    api_key = os.environ.get('OPENAI_API_KEY', '')
    if not api_key:
        logger.info('OPENAI_API_KEY not set, using known model list')
        return _openai_known_models()

    resp = httpx.get(
        'https://api.openai.com/v1/models',
        headers={'Authorization': f'Bearer {api_key}'},
        timeout=15.0,
    )
    resp.raise_for_status()

    models = []
    pricing = _openai_pricing()
    for m in resp.json().get('data', []):
        mid = m['id']
        if mid.startswith('ft:') or mid.startswith('davinci') or '-instruct' in mid:
            continue
        p = pricing.get(mid, {})
        models.append({
            'model_id': mid,
            'name': mid,
            'model_type': _classify_openai_model(mid),
            'context_window': p.get('context_window'),
            'max_output_tokens': p.get('max_output_tokens'),
            'input_price': p.get('input'),
            'output_price': p.get('output'),
            'capabilities': _openai_capabilities(mid),
        })
    return models


@register_fetcher('anthropic')
def _fetch_anthropic(provider):
    return _anthropic_known_models()


@register_fetcher('google')
def _fetch_google(provider):
    import os
    api_key = os.environ.get('GOOGLE_API_KEY', '')
    if not api_key:
        return _google_known_models()

    resp = httpx.get(
        f'https://generativelanguage.googleapis.com/v1beta/models?key={api_key}',
        timeout=15.0,
    )
    resp.raise_for_status()

    models = []
    pricing = _google_pricing()
    for m in resp.json().get('models', []):
        mid = m.get('name', '').replace('models/', '')
        if not mid:
            continue
        p = pricing.get(mid, {})
        models.append({
            'model_id': mid,
            'name': m.get('displayName', mid),
            'description': m.get('description', ''),
            'model_type': AIModel.ModelType.LLM,
            'context_window': m.get('inputTokenLimit'),
            'max_output_tokens': m.get('outputTokenLimit'),
            'input_price': p.get('input'),
            'output_price': p.get('output'),
            'capabilities': ['chat'],
        })
    return models


def _classify_openai_model(model_id):
    if 'embedding' in model_id:
        return AIModel.ModelType.EMBEDDING
    if 'dall-e' in model_id or 'image' in model_id:
        return AIModel.ModelType.IMAGE_GEN
    if 'tts' in model_id or 'whisper' in model_id:
        return AIModel.ModelType.SPEECH_TO_TEXT
    if 'o1' in model_id or 'o3' in model_id:
        return AIModel.ModelType.REASONING
    return AIModel.ModelType.LLM


def _openai_capabilities(model_id):
    caps = ['chat']
    if any(x in model_id for x in ['gpt-4', 'o1', 'o3']):
        caps.append('function_calling')
    if any(x in model_id for x in ['gpt-4o', 'gpt-4-turbo']):
        caps.append('vision')
    if 'o1' in model_id or 'o3' in model_id:
        caps.append('long_context')
    return caps


def _openai_pricing():
    return {
        'gpt-4o': {'input': 2.50, 'output': 10.00, 'context_window': 128000, 'max_output_tokens': 16384},
        'gpt-4o-mini': {'input': 0.15, 'output': 0.60, 'context_window': 128000, 'max_output_tokens': 16384},
        'gpt-4-turbo': {'input': 10.00, 'output': 30.00, 'context_window': 128000, 'max_output_tokens': 4096},
        'o1': {'input': 15.00, 'output': 60.00, 'context_window': 200000, 'max_output_tokens': 100000},
        'o1-mini': {'input': 3.00, 'output': 12.00, 'context_window': 128000, 'max_output_tokens': 65536},
        'o3-mini': {'input': 1.10, 'output': 4.40, 'context_window': 200000, 'max_output_tokens': 100000},
    }


def _openai_known_models():
    pricing = _openai_pricing()
    return [
        {
            'model_id': mid,
            'name': mid,
            'model_type': _classify_openai_model(mid),
            'context_window': p.get('context_window'),
            'max_output_tokens': p.get('max_output_tokens'),
            'input_price': p.get('input'),
            'output_price': p.get('output'),
            'capabilities': _openai_capabilities(mid),
        }
        for mid, p in pricing.items()
    ]


def _anthropic_known_models():
    models = [
        {'model_id': 'claude-opus-4-20250514', 'name': 'Claude Opus 4', 'input_price': 15.00, 'output_price': 75.00, 'context_window': 200000, 'max_output_tokens': 32000, 'capabilities': ['chat', 'function_calling', 'vision', 'long_context']},
        {'model_id': 'claude-sonnet-4-20250514', 'name': 'Claude Sonnet 4', 'input_price': 3.00, 'output_price': 15.00, 'context_window': 200000, 'max_output_tokens': 64000, 'capabilities': ['chat', 'function_calling', 'vision', 'long_context']},
        {'model_id': 'claude-3-5-haiku-20241022', 'name': 'Claude 3.5 Haiku', 'input_price': 0.80, 'output_price': 4.00, 'context_window': 200000, 'max_output_tokens': 8192, 'capabilities': ['chat', 'function_calling']},
    ]
    for m in models:
        m['model_type'] = AIModel.ModelType.LLM
    return models


def _google_known_models():
    return [
        {'model_id': 'gemini-2.5-pro', 'name': 'Gemini 2.5 Pro', 'input_price': 1.25, 'output_price': 10.00, 'context_window': 1048576, 'max_output_tokens': 65536, 'model_type': AIModel.ModelType.LLM, 'capabilities': ['chat', 'function_calling', 'vision', 'long_context']},
        {'model_id': 'gemini-2.5-flash', 'name': 'Gemini 2.5 Flash', 'input_price': 0.15, 'output_price': 0.60, 'context_window': 1048576, 'max_output_tokens': 65536, 'model_type': AIModel.ModelType.LLM, 'capabilities': ['chat', 'function_calling', 'vision', 'long_context']},
        {'model_id': 'gemini-2.0-flash', 'name': 'Gemini 2.0 Flash', 'input_price': 0.10, 'output_price': 0.40, 'context_window': 1048576, 'max_output_tokens': 8192, 'model_type': AIModel.ModelType.LLM, 'capabilities': ['chat', 'function_calling']},
    ]


def _google_pricing():
    return {m['model_id']: {'input': m['input_price'], 'output': m['output_price']} for m in _google_known_models()}
