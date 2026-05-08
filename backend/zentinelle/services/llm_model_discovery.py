"""
Live model discovery from LLM provider APIs.

Each provider exposes a /models endpoint we can hit to get the current
list of available models. Results are cached for 1 hour to avoid hammering
provider APIs on every page load.

Cache: per-tenant, per-provider, in-memory (fine for single-process or
shared-redis deployments).
"""
import logging
import os
import time
from typing import Optional

import httpx

from zentinelle.services.llm_provider import OPENAI_COMPAT_PROVIDERS, get_api_key

logger = logging.getLogger(__name__)

# Cache: { (tenant_id, provider): (timestamp, models_list) }
_CACHE: dict = {}
_CACHE_TTL_SECONDS = 3600  # 1 hour


def _is_chat_model(model_id: str) -> bool:
    """Filter out non-chat models (embeddings, audio, image gen, moderation)."""
    m = model_id.lower()
    if any(x in m for x in [
        'embedding', 'whisper', 'tts', 'dall-e', 'davinci',
        'babbage', 'ada', 'curie', 'moderation', 'instructpix',
        'stable-diffusion', 'sdxl', 'flux', 'midjourney',
    ]):
        return False
    if m.startswith('text-embedding'):
        return False
    return True


def _clean_label(model_id: str, provider: str) -> str:
    """Generate a human-readable label from a model ID."""
    if provider == 'anthropic':
        # claude-opus-4-7-20250101 → Claude Opus 4.7
        parts = model_id.replace('claude-', '').split('-')
        if parts and parts[0] in ('opus', 'sonnet', 'haiku'):
            family = parts[0].capitalize()
            version_parts = []
            for p in parts[1:]:
                if p.isdigit() or '.' in p:
                    version_parts.append(p)
                elif len(p) == 8 and p.isdigit():
                    break
                else:
                    break
            version = '.'.join(version_parts)
            return f"Claude {family} {version}".strip()
    if provider == 'openai':
        # gpt-4o-2024-11-20 → GPT-4o
        if model_id.startswith('gpt-'):
            base = model_id[4:].split('-')[0]
            return f"GPT-{base.upper() if len(base) <= 4 else base}"
        if model_id.startswith('o1') or model_id.startswith('o3') or model_id.startswith('o4'):
            return model_id
    return model_id


def _fetch_anthropic_models(api_key: str) -> Optional[list]:
    if not api_key:
        return None
    try:
        r = httpx.get(
            'https://api.anthropic.com/v1/models',
            headers={
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01',
            },
            timeout=10.0,
        )
        if r.status_code != 200:
            logger.warning("Anthropic /models returned %d", r.status_code)
            return None
        data = r.json()
        models = []
        for m in data.get('data', []):
            mid = m.get('id', '')
            if not _is_chat_model(mid):
                continue
            models.append({
                'value': mid,
                'label': m.get('display_name') or _clean_label(mid, 'anthropic'),
                'capabilities': ['chat', 'function_calling', 'vision'],
                'contextWindow': 200000,
                'releaseDate': m.get('created_at', '')[:10] or None,
                'supportsTools': True,
                'supportsVision': True,
                'riskLevel': 'limited',
            })
        return models
    except Exception as e:
        logger.warning("Failed to fetch Anthropic models: %s", e)
        return None


def _fetch_openai_compat_models(provider: str, api_key: str) -> Optional[list]:
    if not api_key:
        return None
    config = OPENAI_COMPAT_PROVIDERS.get(provider)
    if not config:
        return None
    base_url = config['base_url']
    try:
        r = httpx.get(
            f'{base_url}/models',
            headers={'Authorization': f'Bearer {api_key}'} if api_key else {},
            timeout=10.0,
        )
        if r.status_code != 200:
            logger.warning("%s /models returned %d", provider, r.status_code)
            return None
        data = r.json()
        items = data.get('data', data) if isinstance(data, dict) else data
        models = []
        for m in items:
            if isinstance(m, str):
                mid = m
                created = None
            else:
                mid = m.get('id') or m.get('name') or ''
                created = m.get('created')
            if not mid or not _is_chat_model(mid):
                continue
            release_date = None
            if created:
                try:
                    release_date = time.strftime('%Y-%m-%d', time.gmtime(int(created)))
                except (ValueError, TypeError):
                    pass
            models.append({
                'value': mid,
                'label': _clean_label(mid, provider),
                'capabilities': ['chat', 'function_calling'],
                'contextWindow': 128000,
                'releaseDate': release_date,
                'supportsTools': True,
                'supportsVision': False,
                'riskLevel': 'limited',
            })
        return models
    except Exception as e:
        logger.warning("Failed to fetch %s models: %s", provider, e)
        return None


def _fetch_google_models(api_key: str) -> Optional[list]:
    if not api_key:
        return None
    try:
        r = httpx.get(
            f'https://generativelanguage.googleapis.com/v1beta/models?key={api_key}',
            timeout=10.0,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        models = []
        for m in data.get('models', []):
            mid = m.get('name', '').replace('models/', '')
            if not mid or not _is_chat_model(mid):
                continue
            methods = m.get('supportedGenerationMethods', [])
            if 'generateContent' not in methods:
                continue
            models.append({
                'value': mid,
                'label': m.get('displayName') or _clean_label(mid, 'google'),
                'capabilities': ['chat', 'function_calling', 'vision'],
                'contextWindow': m.get('inputTokenLimit', 1048576),
                'releaseDate': None,
                'supportsTools': True,
                'supportsVision': True,
                'riskLevel': 'limited',
            })
        return models
    except Exception as e:
        logger.warning("Failed to fetch Google models: %s", e)
        return None


def _fetch_ollama_models() -> Optional[list]:
    base = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
    try:
        r = httpx.get(f'{base}/api/tags', timeout=5.0)
        if r.status_code != 200:
            return None
        data = r.json()
        models = []
        for m in data.get('models', []):
            mid = m.get('name', '')
            if not mid:
                continue
            models.append({
                'value': mid,
                'label': mid,
                'capabilities': ['chat'],
                'contextWindow': 32000,
                'releaseDate': m.get('modified_at', '')[:10] or None,
                'supportsTools': False,
                'supportsVision': False,
                'riskLevel': 'unknown',
            })
        return models
    except Exception:
        return None


def fetch_live_models(provider: str, tenant_id: str) -> Optional[list]:
    """Fetch live model list from a provider's API (with caching)."""
    cache_key = (tenant_id, provider)
    now = time.time()

    cached = _CACHE.get(cache_key)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    if provider == 'ollama':
        models = _fetch_ollama_models()
    elif provider == 'anthropic':
        models = _fetch_anthropic_models(get_api_key('anthropic', tenant_id))
    elif provider == 'google':
        models = _fetch_google_models(get_api_key('google', tenant_id))
    elif provider in OPENAI_COMPAT_PROVIDERS:
        models = _fetch_openai_compat_models(provider, get_api_key(provider, tenant_id))
    else:
        models = None

    if models:
        # Sort by release date desc, then by value
        models.sort(key=lambda m: (m.get('releaseDate') or '', m.get('value', '')), reverse=True)
        _CACHE[cache_key] = (now, models)
    # Don't cache failures (None or empty) — let the next request retry

    return models


def clear_cache(provider: str = None, tenant_id: str = None) -> None:
    """Clear the model cache. Pass nothing to clear all."""
    global _CACHE
    if provider is None and tenant_id is None:
        _CACHE = {}
    else:
        keys_to_remove = [
            k for k in _CACHE
            if (tenant_id is None or k[0] == tenant_id)
            and (provider is None or k[1] == provider)
        ]
        for k in keys_to_remove:
            _CACHE.pop(k, None)
