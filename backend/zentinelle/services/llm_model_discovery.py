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


def _classify_model_type(model_id: str) -> str:
    """Best-effort classification into AIModel.ModelType values.

    Used so the registry knows what KIND of model this is. The chat picker
    filters by enabled_for_chat (which defaults False for non-chat types),
    while pages like Model Compare can still see the full set.
    """
    m = model_id.lower()
    if any(x in m for x in ['embedding']) or m.startswith('text-embedding'):
        return 'embedding'
    if any(x in m for x in ['whisper', 'transcribe']):
        return 'speech_to_text'
    if any(x in m for x in ['tts', 'text-to-speech']):
        return 'text_to_speech'
    if any(x in m for x in ['dall-e', 'gpt-image', 'chatgpt-image',
                              'stable-diffusion', 'sdxl', 'flux', 'midjourney']):
        return 'image_gen'
    if any(x in m for x in ['sora', '-video', 'video-']):
        return 'image_gen'  # closest existing bucket; no 'video' enum yet
    if any(x in m for x in ['realtime', 'audio', 'voice']):
        return 'multimodal'  # voice/realtime are conversational but not standard chat
    if any(x in m for x in ['o1', 'o3', 'o4', 'reasoning', 'thinking']):
        return 'reasoning'
    if any(x in m for x in ['vision', 'gpt-4o', 'gpt-5', 'claude', 'gemini']):
        return 'multimodal'
    if any(x in m for x in ['codex', 'code-']):
        return 'code'
    return 'llm'


# Types that should default to enabled_for_chat=True (text chat / reasoning).
# Voice/realtime/image/audio are deliberately excluded because they don't use
# standard /chat/completions or aren't text-chat.
CHAT_CAPABLE_TYPES = frozenset({'llm', 'reasoning', 'code'})

# Specific model_id patterns that DO appear in /v1/models but don't actually
# work via /chat/completions (specialized API surfaces). Default-disable
# these for chat too.
NON_CHAT_PATTERNS = (
    'realtime', 'audio', 'voice',
    '-image', 'image-', 'gpt-image', 'chatgpt-image', 'sora',
    'search-api', 'search-preview',
    'deep-research', 'computer-use',
    'transcribe', 'whisper', 'tts',
    'embedding', 'rerank', 'moderation',
)


def _default_enabled_for_chat(model_id: str, model_type: str) -> bool:
    m = model_id.lower()
    if any(p in m for p in NON_CHAT_PATTERNS):
        return False
    if m.startswith(('text-embedding', 'sora-')):
        return False
    return model_type in CHAT_CAPABLE_TYPES or model_type == 'multimodal'


def _dedupe_by_label(models: list) -> list:
    """Collapse snapshot/dated aliases (gpt-5.5, gpt-5.5-2026-04-01, ...) to one entry.

    Keeps the entry with the latest releaseDate per label, falling back to the
    shortest (most canonical) model ID when dates tie or are missing.
    """
    if not models:
        return models
    by_label: dict = {}
    for m in models:
        label = m.get('label') or m.get('value', '')
        existing = by_label.get(label)
        if existing is None:
            by_label[label] = m
            continue
        # Prefer entry with later releaseDate; tie-break on shorter (canonical) id
        new_date = m.get('releaseDate') or ''
        old_date = existing.get('releaseDate') or ''
        if new_date > old_date:
            by_label[label] = m
        elif new_date == old_date:
            if len(m.get('value', '')) < len(existing.get('value', '')):
                by_label[label] = m
    return list(by_label.values())


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
        # gpt-4o-mini-2024-11-20 → GPT-4o mini
        # gpt-5.5-mini → GPT-5.5 mini
        if model_id.startswith('gpt-'):
            stem = model_id[4:]
            # Strip trailing date snapshots: -YYYY-MM-DD or -YYYYMMDD
            import re
            stem = re.sub(r'-\d{4}-\d{2}-\d{2}$', '', stem)
            stem = re.sub(r'-\d{8}$', '', stem)
            stem = re.sub(r'-\d{4}-\d{2}$', '', stem)
            return f"GPT-{stem}"
        if model_id.startswith(('o1', 'o3', 'o4')):
            import re
            return re.sub(r'-\d{4}-\d{2}-\d{2}$', '', model_id)
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
            if not mid:
                continue
            mtype = _classify_model_type(mid)
            models.append({
                'value': mid,
                'label': m.get('display_name') or _clean_label(mid, 'anthropic'),
                'capabilities': ['chat', 'function_calling', 'vision'],
                'contextWindow': 200000,
                'releaseDate': m.get('created_at', '')[:10] or None,
                'supportsTools': True,
                'supportsVision': True,
                'riskLevel': 'limited',
                'modelType': mtype,
                'defaultEnabledForChat': _default_enabled_for_chat(mid, mtype),
            })
        return _dedupe_by_label(models)
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
            if not mid:
                continue
            release_date = None
            if created:
                try:
                    release_date = time.strftime('%Y-%m-%d', time.gmtime(int(created)))
                except (ValueError, TypeError):
                    pass
            mtype = _classify_model_type(mid)
            models.append({
                'value': mid,
                'label': _clean_label(mid, provider),
                'capabilities': ['chat', 'function_calling'],
                'contextWindow': 128000,
                'releaseDate': release_date,
                'supportsTools': True,
                'supportsVision': False,
                'riskLevel': 'limited',
                'modelType': mtype,
                'defaultEnabledForChat': _default_enabled_for_chat(mid, mtype),
            })
        return _dedupe_by_label(models)
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
            if not mid:
                continue
            methods = m.get('supportedGenerationMethods', [])
            mtype = _classify_model_type(mid)
            # Google: only generateContent-capable models go in chat by default
            default_enabled = (
                _default_enabled_for_chat(mid, mtype)
                and 'generateContent' in methods
            )
            models.append({
                'value': mid,
                'label': m.get('displayName') or _clean_label(mid, 'google'),
                'capabilities': ['chat', 'function_calling', 'vision'],
                'contextWindow': m.get('inputTokenLimit', 1048576),
                'releaseDate': None,
                'supportsTools': True,
                'supportsVision': True,
                'riskLevel': 'limited',
                'modelType': mtype,
                'defaultEnabledForChat': default_enabled,
            })
        return _dedupe_by_label(models)
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
            mtype = _classify_model_type(mid)
            models.append({
                'value': mid,
                'label': mid,
                'capabilities': ['chat'],
                'contextWindow': 32000,
                'releaseDate': m.get('modified_at', '')[:10] or None,
                'supportsTools': False,
                'supportsVision': False,
                'riskLevel': 'unknown',
                'modelType': mtype,
                'defaultEnabledForChat': _default_enabled_for_chat(mid, mtype),
            })
        return _dedupe_by_label(models)
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
        # Also persist into AIModel registry so other features see them
        try:
            _persist_to_registry(provider, models)
        except Exception as e:
            logger.warning("Failed to persist %s models to registry: %s", provider, e)
    # Don't cache failures (None or empty) — let the next request retry

    return models


def _persist_to_registry(provider_slug: str, models: list) -> None:
    """Upsert discovered models into the AIModel registry."""
    from zentinelle.models import AIModel, AIProvider
    from datetime import datetime

    provider, _ = AIProvider.objects.get_or_create(
        slug=provider_slug,
        defaults={
            'name': provider_slug.title(),
            'is_active': True,
        },
    )

    for m in models:
        release_date = None
        if m.get('releaseDate'):
            try:
                release_date = datetime.strptime(m['releaseDate'], '%Y-%m-%d').date()
            except (ValueError, TypeError):
                pass

        # Common fields always synced from the provider
        defaults = {
            'name': m.get('label', m['value']),
            'capabilities': m.get('capabilities', []),
            'context_window': m.get('contextWindow') or 0,
            'release_date': release_date,
            'is_available': True,
            'deprecated': False,
            'risk_level': m.get('riskLevel', 'unknown'),
            'model_type': m.get('modelType') or 'llm',
        }
        obj, created = AIModel.objects.update_or_create(
            provider=provider,
            model_id=m['value'],
            defaults=defaults,
        )
        # Only set enabled_for_chat on creation — preserve user toggles on update
        if created:
            obj.enabled_for_chat = bool(m.get('defaultEnabledForChat', True))
            obj.save(update_fields=['enabled_for_chat'])


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
