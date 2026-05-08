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
import asyncio
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


def _env_api_key(provider: str) -> str:
    """Fetch provider API key from environment variables only."""
    if provider == 'anthropic':
        return os.environ.get('ANTHROPIC_API_KEY', '')
    if provider == 'google':
        return os.environ.get('GOOGLE_API_KEY', '')
    config = OPENAI_COMPAT_PROVIDERS.get(provider, {})
    env_var = config.get('env')
    if not env_var:
        return ''
    return os.environ.get(env_var, '')


def get_api_key(provider: str, tenant_id: str = None) -> str:
    """Get API key for a provider.

    Resolution order:
      1. Tenant-specific encrypted key from LLMProviderKey (portal-managed)
      2. Environment variable (deployment-level)

    NOTE: This function does ORM access. Don't call it from async code —
    look up the key with this in sync context, then pass into async.
    """
    if tenant_id:
        try:
            from zentinelle.models import LLMProviderKey
            obj = LLMProviderKey.objects.filter(
                tenant_id=tenant_id,
                provider=provider,
                is_active=True,
            ).first()
            if obj:
                key = obj.get_key()
                if key:
                    return key
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "Failed to load tenant key for %s: %s", provider, e
            )

    return _env_api_key(provider)


def _hash_action(name: str, args: dict) -> str:
    """Stable hash for (tool_name, args) so the frontend can confirm a specific call."""
    import hashlib
    payload = json.dumps({'name': name, 'args': args or {}}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


async def agentic_chat(
    messages: list[dict],
    model: str,
    provider: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    system_prompt: Optional[str] = None,
    tenant_id: Optional[str] = None,
    max_tool_iterations: int = 6,
    approved_actions: Optional[list[str]] = None,
    actor: Optional[str] = None,
) -> AsyncGenerator[dict, None]:
    """Tool-use loop for the assistant — streams progressively.

    Yields structured events:
      {'type': 'tool_call', 'name': str, 'args': dict, 'hash': str}
      {'type': 'tool_result', 'name': str, 'result': dict}
      {'type': 'pending_action', 'name': str, 'args': dict, 'hash': str, 'preview': str}
      {'type': 'text', 'content': str}              # streamed deltas
      {'type': 'navigation', 'path': str, 'label': str}
      {'type': 'done'}

    approved_actions: list of action hashes the user has approved this session.
    actor: identifier for audit logging (e.g. user.id or 'open-mode').

    Anthropic and OpenAI both support tools. Other providers fall through.
    """
    if not provider:
        provider = detect_provider(model)

    if tenant_id:
        api_key = await asyncio.to_thread(get_api_key, provider, tenant_id)
    else:
        api_key = _env_api_key(provider)

    approved = set(approved_actions or [])

    if provider == 'anthropic':
        async for ev in _anthropic_tool_loop(
            messages, model, api_key, temperature, max_tokens,
            system_prompt, tenant_id, max_tool_iterations,
            approved, actor,
        ):
            yield ev
        return

    if provider in OPENAI_COMPAT_PROVIDERS or provider == 'openai':
        async for ev in _openai_tool_loop(
            messages, model, provider, api_key,
            temperature, max_tokens, system_prompt, tenant_id,
            max_tool_iterations, approved, actor,
        ):
            yield ev
        return

    # Fallback: plain text stream, no tools
    async for chunk in stream_chat(
        messages, model, provider, temperature, max_tokens,
        system_prompt, tenant_id,
    ):
        yield {'type': 'text', 'content': chunk}
    yield {'type': 'done'}


def _resource_id_from_args(name: str, args: dict, result_obj: dict) -> tuple[str, str]:
    """Pull (resource_type, resource_id) from a tool's args/result, best-effort."""
    a = args or {}
    r = result_obj if isinstance(result_obj, dict) else {}
    if name in ('create_policy', 'update_policy', 'toggle_policy'):
        return ('policy', str(a.get('policy_id') or r.get('policy_id') or ''))
    if name in ('create_risk', 'update_risk', 'review_risk'):
        return ('risk', str(a.get('risk_id') or r.get('risk_id') or ''))
    if name in ('acknowledge_incident', 'resolve_incident'):
        return ('incident', str(a.get('incident_id') or r.get('incident_id') or ''))
    if name == 'acknowledge_alert':
        return ('alert', str(a.get('alert_id') or r.get('alert_id') or ''))
    if name in ('run_compliance_check', 'generate_compliance_report'):
        return ('compliance_assessment', str(r.get('assessment_id') or ''))
    return ('assistant_action', '')


async def _execute_tool_with_audit(name: str, args: dict, tenant_id: str,
                                   actor: Optional[str]) -> str:
    """Execute a tool and write an audit log entry for mutations."""
    from zentinelle.services.llm_tools import (MUTATION_TOOLS, execute_tool)

    result_str = await asyncio.to_thread(execute_tool, name, args, tenant_id)

    if name in MUTATION_TOOLS:
        try:
            result_obj = json.loads(result_str)
        except json.JSONDecodeError:
            result_obj = {}

        def _audit():
            from zentinelle.models import AuditLog
            res_type, res_id = _resource_id_from_args(name, args, result_obj)
            AuditLog.log(
                tenant_id=tenant_id,
                action=f'assistant.{name}',
                resource_type=res_type,
                resource_id=res_id,
                resource_name=str(args.get('name', '') or '')[:255],
                ext_user_id=actor or 'ai_assistant',
                changes={'args': args},
                metadata={'tool': name, 'success': bool(result_obj.get('success'))},
            )

        try:
            await asyncio.to_thread(_audit)
        except Exception as e:
            logger.warning('Audit log write failed for %s: %s', name, e)

    return result_str


async def _process_tool_calls(content_blocks: list, tenant_id: str,
                              approved: set, actor: Optional[str]):
    """Yield events for tool_use blocks. Returns list of tool_result blocks
    to send back to the model.

    Tools that require confirmation and aren't pre-approved emit a
    'pending_action' event instead of executing — and the tool result fed
    back to the model says "awaiting user approval".
    """
    from zentinelle.services.llm_tools import REQUIRES_CONFIRMATION

    tool_results = []
    for block in content_blocks:
        if block.get('type') != 'tool_use':
            continue
        tool_name = block.get('name', '')
        tool_args = block.get('input', {}) or {}
        tool_use_id = block.get('id', '')
        action_hash = _hash_action(tool_name, tool_args)

        needs_confirm = (
            tool_name in REQUIRES_CONFIRMATION and action_hash not in approved
        )

        if needs_confirm:
            preview = _format_action_preview(tool_name, tool_args)
            yield {
                'type': 'pending_action',
                'name': tool_name,
                'args': tool_args,
                'hash': action_hash,
                'preview': preview,
            }
            pending_msg = {
                'pending_confirmation': True,
                'message': (
                    f'Action "{tool_name}" is awaiting user confirmation. '
                    f'Tell the user what you intend to do and that they '
                    f'must click Approve to proceed.'
                ),
            }
            tool_results.append({
                'type': 'tool_result',
                'tool_use_id': tool_use_id,
                'content': json.dumps(pending_msg),
            })
            continue

        yield {
            'type': 'tool_call',
            'name': tool_name,
            'args': tool_args,
            'hash': action_hash,
        }

        result_str = await _execute_tool_with_audit(
            tool_name, tool_args, tenant_id, actor
        )
        try:
            result_obj = json.loads(result_str)
        except json.JSONDecodeError:
            result_obj = {'raw': result_str}

        yield {
            'type': 'tool_result',
            'name': tool_name,
            'result': result_obj,
        }

        nav = result_obj.get('navigation') if isinstance(result_obj, dict) else None
        if nav and isinstance(nav, dict):
            yield {
                'type': 'navigation',
                'path': nav.get('path', ''),
                'label': nav.get('label', ''),
            }

        tool_results.append({
            'type': 'tool_result',
            'tool_use_id': tool_use_id,
            'content': result_str,
        })

    yield {'type': '__results__', 'results': tool_results}


def _format_action_preview(name: str, args: dict) -> str:
    """Short human-readable description of a pending action."""
    if name == 'create_policy':
        return f"Create policy '{args.get('name', '?')}' ({args.get('policy_type', '?')})"
    if name == 'update_policy':
        return f"Update policy {args.get('policy_id', '?')}"
    if name == 'create_risk':
        return f"Add risk '{args.get('name', '?')}'"
    if name == 'toggle_policy':
        return f"Toggle policy {args.get('policy_id', '?')}"
    if name == 'acknowledge_incident':
        return f"Acknowledge incident {args.get('incident_id', '?')}"
    if name == 'resolve_incident':
        return f"Resolve incident {args.get('incident_id', '?')}"
    if name == 'run_compliance_check':
        return "Run compliance assessment now"
    return f"{name}({json.dumps(args)[:120]})"


async def _anthropic_tool_loop(messages, model, api_key, temperature,
                               max_tokens, system_prompt, tenant_id,
                               max_iter, approved, actor):
    from zentinelle.services.llm_tools import TOOL_SCHEMAS

    convo = list(messages)
    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
    }

    for _ in range(max_iter):
        body = {
            'model': model,
            'messages': convo,
            'max_tokens': max_tokens,
            'temperature': temperature,
            'tools': TOOL_SCHEMAS,
            'stream': True,
        }
        if system_prompt:
            body['system'] = system_prompt

        # Per-block accumulator: index → block dict
        blocks: dict = {}
        stop_reason = None

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                'POST',
                'https://api.anthropic.com/v1/messages',
                headers=headers, json=body,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith('data: '):
                        continue
                    raw = line[6:].strip()
                    if not raw:
                        continue
                    try:
                        ev = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    et = ev.get('type')
                    if et == 'content_block_start':
                        idx = ev.get('index')
                        cb = ev.get('content_block', {}) or {}
                        kind = cb.get('type')
                        if kind == 'text':
                            blocks[idx] = {'type': 'text', 'text': ''}
                        elif kind == 'tool_use':
                            blocks[idx] = {
                                'type': 'tool_use',
                                'id': cb.get('id', ''),
                                'name': cb.get('name', ''),
                                'input': '',
                            }
                    elif et == 'content_block_delta':
                        idx = ev.get('index')
                        delta = ev.get('delta', {}) or {}
                        block = blocks.get(idx)
                        if not block:
                            continue
                        dt = delta.get('type')
                        if dt == 'text_delta':
                            piece = delta.get('text', '')
                            block['text'] += piece
                            if piece:
                                yield {'type': 'text', 'content': piece}
                        elif dt == 'input_json_delta':
                            block['input'] += delta.get('partial_json', '')
                    elif et == 'content_block_stop':
                        idx = ev.get('index')
                        block = blocks.get(idx)
                        if block and block.get('type') == 'tool_use':
                            try:
                                block['input'] = json.loads(block['input'] or '{}')
                            except json.JSONDecodeError:
                                block['input'] = {}
                    elif et == 'message_delta':
                        sr = (ev.get('delta') or {}).get('stop_reason')
                        if sr:
                            stop_reason = sr
                    elif et == 'message_stop':
                        pass

        # Reconstruct ordered content_blocks list for the assistant turn
        content_blocks = [blocks[i] for i in sorted(blocks.keys())]

        if stop_reason != 'tool_use':
            break

        convo.append({'role': 'assistant', 'content': content_blocks})

        tool_results = []
        async for ev in _process_tool_calls(content_blocks, tenant_id, approved, actor):
            if ev.get('type') == '__results__':
                tool_results = ev['results']
            else:
                yield ev

        if not tool_results:
            break

        # If every tool call was pending, stop the loop — user must approve
        # before we re-prompt.
        all_pending = all(
            isinstance(tr.get('content'), str)
            and 'pending_confirmation' in tr['content']
            for tr in tool_results
        )
        convo.append({'role': 'user', 'content': tool_results})
        if all_pending:
            # Let the model produce a one-pass explanation, then stop.
            # We do another iteration so the model can narrate, but it
            # won't be able to call the same tool again until approved.
            pass

    yield {'type': 'done'}


async def _openai_tool_loop(messages, model, provider, api_key, temperature,
                            max_tokens, system_prompt, tenant_id, max_iter,
                            approved, actor):
    """OpenAI-style function calling. Translates our schemas, accumulates
    tool_call deltas from the stream, dispatches, feeds back as tool messages.
    """
    from zentinelle.services.llm_tools import TOOL_SCHEMAS

    config = OPENAI_COMPAT_PROVIDERS.get(
        provider, OPENAI_COMPAT_PROVIDERS['openai']
    )
    base_url = config['base_url']

    # OpenAI tool schema: {type: function, function: {name, description, parameters}}
    openai_tools = [
        {
            'type': 'function',
            'function': {
                'name': t['name'],
                'description': t.get('description', ''),
                'parameters': t.get('input_schema', {'type': 'object', 'properties': {}}),
            },
        }
        for t in TOOL_SCHEMAS
    ]

    convo = []
    if system_prompt:
        convo.append({'role': 'system', 'content': system_prompt})
    convo.extend(messages)

    headers = {'Content-Type': 'application/json'}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'

    for _ in range(max_iter):
        body = {
            'model': model,
            'messages': convo,
            'temperature': temperature,
            'max_tokens': max_tokens,
            'stream': True,
            'tools': openai_tools,
            'tool_choice': 'auto',
        }

        # Accumulators
        text_buf = ''
        tool_calls: dict = {}  # index → {id, name, arguments}
        finish_reason = None

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                'POST', f'{base_url}/chat/completions',
                headers=headers, json=body,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith('data: '):
                        continue
                    raw = line[6:].strip()
                    if raw == '[DONE]':
                        break
                    try:
                        chunk = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    choice = (chunk.get('choices') or [{}])[0]
                    delta = choice.get('delta', {}) or {}
                    fr = choice.get('finish_reason')
                    if fr:
                        finish_reason = fr

                    txt = delta.get('content')
                    if txt:
                        text_buf += txt
                        yield {'type': 'text', 'content': txt}

                    for tc in delta.get('tool_calls', []) or []:
                        idx = tc.get('index', 0)
                        slot = tool_calls.setdefault(idx, {
                            'id': '', 'name': '', 'arguments': '',
                        })
                        if tc.get('id'):
                            slot['id'] = tc['id']
                        fn = tc.get('function', {}) or {}
                        if fn.get('name'):
                            slot['name'] = fn['name']
                        if fn.get('arguments'):
                            slot['arguments'] += fn['arguments']

        if finish_reason != 'tool_calls' or not tool_calls:
            break

        # Build assistant message with the tool calls
        ordered = [tool_calls[i] for i in sorted(tool_calls.keys())]
        convo.append({
            'role': 'assistant',
            'content': text_buf or None,
            'tool_calls': [
                {
                    'id': tc['id'],
                    'type': 'function',
                    'function': {
                        'name': tc['name'],
                        'arguments': tc['arguments'],
                    },
                }
                for tc in ordered
            ],
        })

        any_pending = False
        any_executed = False
        for tc in ordered:
            try:
                args = json.loads(tc['arguments'] or '{}')
            except json.JSONDecodeError:
                args = {}
            name = tc['name']
            action_hash = _hash_action(name, args)

            from zentinelle.services.llm_tools import REQUIRES_CONFIRMATION
            needs_confirm = (
                name in REQUIRES_CONFIRMATION and action_hash not in approved
            )

            if needs_confirm:
                any_pending = True
                yield {
                    'type': 'pending_action',
                    'name': name,
                    'args': args,
                    'hash': action_hash,
                    'preview': _format_action_preview(name, args),
                }
                convo.append({
                    'role': 'tool',
                    'tool_call_id': tc['id'],
                    'content': json.dumps({
                        'pending_confirmation': True,
                        'message': 'Awaiting user approval.',
                    }),
                })
                continue

            yield {'type': 'tool_call', 'name': name, 'args': args, 'hash': action_hash}
            result_str = await _execute_tool_with_audit(
                name, args, tenant_id, actor
            )
            any_executed = True
            try:
                result_obj = json.loads(result_str)
            except json.JSONDecodeError:
                result_obj = {'raw': result_str}
            yield {'type': 'tool_result', 'name': name, 'result': result_obj}
            nav = result_obj.get('navigation') if isinstance(result_obj, dict) else None
            if nav and isinstance(nav, dict):
                yield {
                    'type': 'navigation',
                    'path': nav.get('path', ''),
                    'label': nav.get('label', ''),
                }
            convo.append({
                'role': 'tool',
                'tool_call_id': tc['id'],
                'content': result_str,
            })

        if any_pending and not any_executed:
            # All calls pending — let model narrate once more then stop.
            pass

    yield {'type': 'done'}


async def stream_chat(
    messages: list[dict],
    model: str,
    provider: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    system_prompt: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream a chat completion from any supported provider.

    Dispatches to the appropriate backend based on provider. If provider
    is not specified, it is auto-detected from the model name. If tenant_id
    is provided, looks up tenant-specific encrypted API key first.

    Yields text content chunks as they arrive.
    """
    if not provider:
        provider = detect_provider(model)

    # Resolve API key BEFORE async path — get_api_key uses Django ORM which
    # can't run inside an async loop without explicit sync_to_async.
    if tenant_id:
        api_key = await asyncio.to_thread(get_api_key, provider, tenant_id)
    else:
        api_key = _env_api_key(provider)

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
