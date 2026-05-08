"""
Unified LLM provider abstraction.

Supports 20+ providers through a single async streaming interface.
Most providers are OpenAI-compatible (same httpx client, different base URL).
Only Anthropic and Google need custom request/response handling.

Usage:
    from zentinelle.services.llm_provider import stream_chat, detect_provider

    async for chunk in stream_chat(messages, model='claude-sonnet-4-20250514'):
        print(chunk, end='')
"""
import json
import logging
import os
from typing import AsyncGenerator, Optional

import httpx

logger = logging.getLogger(__name__)

OPENAI_COMPAT_PROVIDERS = {
    'openai': {
        'base_url': 'https://api.openai.com/v1',
        'env': 'OPENAI_API_KEY',
    },
    'mistral': {
        'base_url': 'https://api.mistral.ai/v1',
        'env': 'MISTRAL_API_KEY',
    },
    'deepseek': {
        'base_url': 'https://api.deepseek.com/v1',
        'env': 'DEEPSEEK_API_KEY',
    },
    'fireworks': {
        'base_url': 'https://api.fireworks.ai/inference/v1',
        'env': 'FIREWORKS_API_KEY',
    },
    'together': {
        'base_url': 'https://api.together.xyz/v1',
        'env': 'TOGETHER_API_KEY',
    },
    'groq': {
        'base_url': 'https://api.groq.com/openai/v1',
        'env': 'GROQ_API_KEY',
    },
    'cerebras': {
        'base_url': 'https://api.cerebras.ai/v1',
        'env': 'CEREBRAS_API_KEY',
    },
    'sambanova': {
        'base_url': 'https://api.sambanova.ai/v1',
        'env': 'SAMBANOVA_API_KEY',
    },
    'nvidia': {
        'base_url': 'https://integrate.api.nvidia.com/v1',
        'env': 'NVIDIA_API_KEY',
    },
    'perplexity': {
        'base_url': 'https://api.perplexity.ai',
        'env': 'PERPLEXITY_API_KEY',
    },
    'xai': {
        'base_url': 'https://api.x.ai/v1',
        'env': 'XAI_API_KEY',
    },
    'openrouter': {
        'base_url': 'https://openrouter.ai/api/v1',
        'env': 'OPENROUTER_API_KEY',
    },
    'litellm': {
        'base_url': os.environ.get('LITELLM_URL', 'http://localhost:4000'),
        'env': 'LITELLM_API_KEY',
    },
    'ollama': {
        'base_url': os.environ.get(
            'OLLAMA_URL', 'http://localhost:11434'
        ) + '/v1',
        'env': None,
    },
    'lmstudio': {
        'base_url': os.environ.get(
            'LMSTUDIO_URL', 'http://localhost:1234'
        ) + '/v1',
        'env': None,
    },
    'cohere': {
        'base_url': 'https://api.cohere.com/v2',
        'env': 'COHERE_API_KEY',
    },
    'ai21': {
        'base_url': 'https://api.ai21.com/studio/v1',
        'env': 'AI21_API_KEY',
    },
    'huggingface': {
        'base_url': 'https://api-inference.huggingface.co/models',
        'env': 'HF_API_TOKEN',
    },
}


def detect_provider(model_id: str) -> str:
    """Auto-detect provider from model ID prefix/name."""
    m = model_id.lower()
    if 'claude' in m:
        return 'anthropic'
    if m.startswith(('gpt', 'o1', 'o3', 'o4')):
        return 'openai'
    if 'gemini' in m:
        return 'google'
    if 'mistral' in m or 'mixtral' in m:
        return 'mistral'
    if 'command' in m:
        return 'cohere'
    if 'deepseek' in m:
        return 'deepseek'
    if 'llama' in m:
        return 'together'
    if 'jamba' in m:
        return 'ai21'
    return os.environ.get('DEFAULT_LLM_PROVIDER', 'openai')


def get_api_key(provider: str) -> str:
    """Get API key for a provider from environment."""
    if provider == 'anthropic':
        return os.environ.get('ANTHROPIC_API_KEY', '')
    if provider == 'google':
        return os.environ.get('GOOGLE_API_KEY', '')
    config = OPENAI_COMPAT_PROVIDERS.get(provider, {})
    env_var = config.get('env')
    if not env_var:
        return ''
    return os.environ.get(env_var, '')


async def stream_chat(
    messages: list[dict],
    model: str,
    provider: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    system_prompt: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream a chat completion from any supported provider.

    Dispatches to the appropriate backend based on provider. If provider
    is not specified, it is auto-detected from the model name.

    Yields text content chunks as they arrive.
    """
    if not provider:
        provider = detect_provider(model)

    api_key = get_api_key(provider)

    if provider == 'anthropic':
        async for chunk in _stream_anthropic(
            messages, model, api_key, temperature, max_tokens, system_prompt
        ):
            yield chunk
    elif provider == 'google':
        async for chunk in _stream_google(
            messages, model, api_key, temperature, max_tokens, system_prompt
        ):
            yield chunk
    else:
        async for chunk in _stream_openai_compat(
            messages, model, provider, api_key,
            temperature, max_tokens, system_prompt
        ):
            yield chunk


async def _stream_openai_compat(
    messages, model, provider, api_key, temperature, max_tokens, system_prompt
):
    """Stream from any OpenAI-compatible API."""
    config = OPENAI_COMPAT_PROVIDERS.get(
        provider, OPENAI_COMPAT_PROVIDERS['openai']
    )
    base_url = config['base_url']

    all_messages = []
    if system_prompt:
        all_messages.append({'role': 'system', 'content': system_prompt})
    all_messages.extend(messages)

    headers = {'Content-Type': 'application/json'}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'

    body = {
        'model': model,
        'messages': all_messages,
        'temperature': temperature,
        'max_tokens': max_tokens,
        'stream': True,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            'POST',
            f'{base_url}/chat/completions',
            headers=headers,
            json=body,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith('data: '):
                    continue
                data = line[6:].strip()
                if data == '[DONE]':
                    break
                try:
                    chunk = json.loads(data)
                    delta = chunk.get(
                        'choices', [{}]
                    )[0].get('delta', {})
                    content = delta.get('content', '')
                    if content:
                        yield content
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue


async def _stream_anthropic(
    messages, model, api_key, temperature, max_tokens, system_prompt
):
    """Stream from Anthropic Messages API."""
    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
    }
    body = {
        'model': model,
        'messages': messages,
        'max_tokens': max_tokens,
        'temperature': temperature,
        'stream': True,
    }
    if system_prompt:
        body['system'] = system_prompt

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            'POST',
            'https://api.anthropic.com/v1/messages',
            headers=headers,
            json=body,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith('data: '):
                    continue
                data = line[6:].strip()
                try:
                    chunk = json.loads(data)
                    if chunk.get('type') == 'content_block_delta':
                        delta = chunk.get('delta', {})
                        if delta.get('type') == 'text_delta':
                            yield delta.get('text', '')
                except (json.JSONDecodeError, KeyError):
                    continue


async def _stream_google(
    messages, model, api_key, temperature, max_tokens, system_prompt
):
    """Stream from Google Gemini API."""
    contents = []
    for msg in messages:
        role = 'user' if msg['role'] == 'user' else 'model'
        contents.append({
            'role': role,
            'parts': [{'text': msg['content']}],
        })

    body = {
        'contents': contents,
        'generationConfig': {
            'temperature': temperature,
            'maxOutputTokens': max_tokens,
        },
    }
    if system_prompt:
        body['systemInstruction'] = {'parts': [{'text': system_prompt}]}

    url = (
        f'https://generativelanguage.googleapis.com/v1beta/models/'
        f'{model}:streamGenerateContent?alt=sse&key={api_key}'
    )

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream('POST', url, json=body) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith('data: '):
                    continue
                try:
                    chunk = json.loads(line[6:])
                    candidates = chunk.get('candidates', [])
                    if candidates:
                        parts = candidates[0].get(
                            'content', {}
                        ).get('parts', [])
                        for part in parts:
                            text = part.get('text', '')
                            if text:
                                yield text
                except (json.JSONDecodeError, KeyError):
                    continue
