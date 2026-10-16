"""Token usage from a provider response, in the canonical usage keys.

The Python port of the gateway's parser (gateway/usage.go), checked against
the same fixtures (gateway/testdata/provider_usage). It returns:

    input_tokens        uncached input only
    output_tokens       output, including reasoning and thinking tokens
    cache_read_tokens   input served from the provider's prompt cache
    cache_write_tokens  input written to the provider's prompt cache
    usage_reported      whether the response carried a usage object at all

A stream spreads usage over several events (Anthropic sends input in
message_start and output in message_delta; Gemini repeats cumulative
usageMetadata in every chunk), so every usage object is read and each count
takes the largest value seen. Every count the providers stream is cumulative.
"""
import json


def parse_usage(body, provider):
    """Read the usage a provider bills from a decoded response body."""
    if isinstance(body, bytes):
        body = body.decode('utf-8', errors='replace')
    totals = {'prompt': 0, 'completion': 0, 'cache_read': 0, 'cache_write': 0}
    reported = False
    for usage in _usage_maps(body or ''):
        reported = True
        for key, value in _parse_usage_map(usage, provider).items():
            totals[key] = max(totals[key], value)
    return {
        # The prompt total includes cached input on every provider once
        # parsed; the canonical input count is the uncached remainder.
        'input_tokens': max(0, totals['prompt'] - totals['cache_read'] - totals['cache_write']),
        'output_tokens': totals['completion'],
        'cache_read_tokens': totals['cache_read'],
        'cache_write_tokens': totals['cache_write'],
        'usage_reported': reported,
    }


def _usage_maps(text):
    """Every usage object in a JSON body, a JSON array (Gemini
    streamGenerateContent without alt=sse) or an SSE stream."""
    trimmed = text.strip()
    if not trimmed:
        return []
    objects = []
    if trimmed[0] in '{[':
        try:
            parsed = json.loads(trimmed)
        except ValueError:
            parsed = None
        objects = parsed if isinstance(parsed, list) else [parsed]
    else:
        for line in text.split('\n'):
            line = line.strip()
            if not line.startswith('data:'):
                continue
            data = line[len('data:'):].strip()
            if 'sage' not in data:
                continue
            try:
                objects.append(json.loads(data))
            except ValueError:
                continue
    maps = []
    for obj in objects:
        usage = _usage_map_in(obj)
        if usage is not None:
            maps.append(usage)
    return maps


def _usage_map_in(obj):
    """Chat Completions puts `usage` at the top level; the Responses API wraps
    it in `response`, Anthropic's message_start in `message`; Gemini calls it
    `usageMetadata`."""
    if not isinstance(obj, dict):
        return None
    for key in ('usage', 'usageMetadata'):
        if isinstance(obj.get(key), dict):
            return obj[key]
    for wrapper in ('response', 'message'):
        inner = obj.get(wrapper)
        if isinstance(inner, dict) and isinstance(inner.get('usage'), dict):
            return inner['usage']
    return None


_GEMINI_KEYS = ('promptTokenCount', 'prompt_token_count', 'candidatesTokenCount',
                'candidates_token_count', 'totalTokenCount', 'total_token_count')


def _parse_usage_map(usage, provider):
    counts = {'prompt': 0, 'completion': 0, 'cache_read': 0, 'cache_write': 0}
    if provider in ('google', 'vertex') and not any(key in usage for key in _GEMINI_KEYS):
        # Not every model behind a Google host is Gemini: Vertex serves Claude
        # (publishers/anthropic, Anthropic usage) and both hosts serve an
        # OpenAI-compatible chat endpoint. Read those in their own shape, or
        # they would meter as zero.
        provider = 'openai' if 'prompt_tokens' in usage or 'completion_tokens' in usage else 'anthropic'
    if provider == 'anthropic':
        # input_tokens is only the uncached remainder; cache reads and writes
        # are billed on top of it.
        counts['cache_write'] = _int(usage, 'cache_creation_input_tokens')
        counts['cache_read'] = _int(usage, 'cache_read_input_tokens')
        counts['prompt'] = _int(usage, 'input_tokens') + counts['cache_write'] + counts['cache_read']
        counts['completion'] = _int(usage, 'output_tokens')
    elif provider == 'openai':
        # The Responses API names the same counts input_tokens and output_tokens.
        counts['prompt'] = _int(usage, 'prompt_tokens') or _int(usage, 'input_tokens')
        counts['completion'] = _int(usage, 'completion_tokens') or _int(usage, 'output_tokens')
        # Cached tokens are inside the prompt count, reasoning inside completion.
        for details in ('prompt_tokens_details', 'input_tokens_details'):
            if isinstance(usage.get(details), dict) and not counts['cache_read']:
                counts['cache_read'] = _int(usage[details], 'cached_tokens')
    elif provider in ('google', 'vertex'):
        # Gemini bills thinking as output and tool-use prompts as input, and
        # counts neither in candidatesTokenCount or promptTokenCount.
        # cachedContentTokenCount is inside promptTokenCount.
        counts['prompt'] = (_int_either(usage, 'promptTokenCount', 'prompt_token_count')
                            + _int_either(usage, 'toolUsePromptTokenCount', 'tool_use_prompt_token_count'))
        counts['completion'] = (_int_either(usage, 'candidatesTokenCount', 'candidates_token_count')
                                + _int_either(usage, 'thoughtsTokenCount', 'thoughts_token_count'))
        counts['cache_read'] = _int_either(usage, 'cachedContentTokenCount', 'cached_content_token_count')
    else:
        counts['prompt'] = _int(usage, 'prompt_tokens') or _int(usage, 'input_tokens')
        counts['completion'] = _int(usage, 'completion_tokens') or _int(usage, 'output_tokens')
    return counts


def _int_either(usage, camel, snake):
    return _int(usage, camel) or _int(usage, snake)


def _int(usage, key):
    """A count, or 0 for anything that is not a non-negative whole number."""
    value = usage.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    if isinstance(value, float) and not value.is_integer():
        return 0
    return max(0, int(value))
