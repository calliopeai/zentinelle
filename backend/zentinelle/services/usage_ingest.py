"""One canonical AI usage record for every producer.

The gateway posts `llm:usage` with `prompt_tokens`/`completion_tokens`. The
Python SDK posts `model_usage` and `model_request` with `input_tokens` and
`output_tokens`. Older clients post `ai_request`. SDK `log_interaction` sends
`input_tokens` where the interaction endpoint reads `input_token_count`. All of
them describe the same thing, so all of them are read through this module.

Canonical usage payload (what a producer should send, as `ai_request`):

    provider            str
    model               str
    input_tokens        int >= 0, uncached input only
    output_tokens       int >= 0
    cache_read_tokens   int >= 0, input served from the provider's prompt cache
    cache_write_tokens  int >= 0, input written to the provider's prompt cache
    request_id          str, one per provider call; the idempotency key
    user_id             str, optional

`input_tokens` excludes cache tokens, as Anthropic reports them and as the
billing export ships them. Provider shapes that count cached input inside the
prompt count (OpenAI `prompt_tokens_details.cached_tokens`, the Responses API
`input_tokens_details.cached_tokens`, Gemini `cachedContentTokenCount`) are
split here, so no cached token is lost and none is counted twice.

Counts are validated, never coerced: a negative, fractional, boolean or
non-numeric count is an `InvalidUsage`, because a negative count is how a
caller erases spend.
"""
import hashlib
import logging
import math
from decimal import Decimal, InvalidOperation

from django.db import connections, router, transaction

logger = logging.getLogger(__name__)

# Every event type a producer uses for one metered model call.
USAGE_EVENT_TYPES = frozenset({'ai_request', 'llm:usage', 'model_usage', 'model_request'})

# Larger than any single call, and inside InteractionLog's 32-bit columns.
MAX_TOKENS = 2_000_000_000
# The cost columns are DECIMAL(10, 6).
MAX_COST_USD = Decimal('10000')

# First present key wins, canonical spelling first.
_TOKEN_KEYS = {
    'input_tokens': ('input_tokens', 'prompt_tokens', 'input_token_count',
                     'promptTokenCount', 'prompt_token_count', 'inputTokens'),
    'output_tokens': ('output_tokens', 'completion_tokens', 'output_token_count',
                      'candidatesTokenCount', 'candidates_token_count', 'outputTokens'),
    # Flat cache counts are reported beside the input count, not inside it.
    'cache_read_tokens': ('cache_read_tokens', 'cache_read_input_tokens', 'cacheReadTokens'),
    'cache_write_tokens': ('cache_write_tokens', 'cache_creation_input_tokens', 'cacheWriteTokens'),
}

# Cached counts that are already included in the input count they sit beside.
_INCLUDED_CACHE_KEYS = (
    ('prompt_tokens_details', 'cached_tokens'),
    ('input_tokens_details', 'cached_tokens'),
    (None, 'cachedContentTokenCount'),
)


class InvalidUsage(ValueError):
    """A usage report that cannot be metered as sent."""


def token_count(value, key):
    """Return a validated count, or None when the value is absent."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidUsage(f'{key} must be a whole number')
    if isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer():
            raise InvalidUsage(f'{key} must be a whole number')
        value = int(value)
    if value < 0:
        raise InvalidUsage(f'{key} must not be negative')
    if value > MAX_TOKENS:
        raise InvalidUsage(f'{key} is out of range')
    return value


def _first(data, keys):
    for key in keys:
        if key in data and data[key] is not None:
            return token_count(data[key], key)
    return None


def carries_tokens(payload):
    """Whether a payload holds a token count in any producer spelling."""
    return isinstance(payload, dict) and any(
        key in payload for keys in _TOKEN_KEYS.values() for key in keys)


def normalize_tokens(data):
    """Read token counts in any producer spelling into the canonical four.

    Missing counts are 0. Raises InvalidUsage on a bad count.
    """
    if not isinstance(data, dict):
        raise InvalidUsage('usage must be an object')
    counts = {name: _first(data, keys) for name, keys in _TOKEN_KEYS.items()}
    for parent, key in _INCLUDED_CACHE_KEYS:
        source = data.get(parent) if parent else data
        if not isinstance(source, dict) or source.get(key) is None:
            continue
        cached = token_count(source[key], key)
        if counts['cache_read_tokens'] is None:
            counts['cache_read_tokens'] = cached
            input_tokens = counts['input_tokens'] or 0
            if cached > input_tokens:
                raise InvalidUsage(f'{key} exceeds the input token count')
            counts['input_tokens'] = input_tokens - cached
        break
    return {name: value or 0 for name, value in counts.items()}


def cost_amount(value, key):
    """Return a validated non-negative Decimal cost, or None when absent."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise InvalidUsage(f'{key} must be a number')
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        raise InvalidUsage(f'{key} must be a number')
    if not amount.is_finite():
        raise InvalidUsage(f'{key} must be a number')
    if amount < 0:
        raise InvalidUsage(f'{key} must not be negative')
    if amount >= MAX_COST_USD:
        raise InvalidUsage(f'{key} is out of range')
    return amount


def server_cost(model, tokens):
    """Price a call from the model registry, or None when the model is unpriced.

    Cache tokens are priced at the full input rate until per-model cache rates
    exist, so a cached workload is never shown as cheaper than it can be.
    """
    from zentinelle.services.usage_tracking import (UsageTrackingService,
                                                    resolve_model_pricing)
    if not model or not resolve_model_pricing(model):
        return None
    input_cost, output_cost = UsageTrackingService.calculate_cost(
        model, billable_input(tokens), tokens['output_tokens'])
    return input_cost + output_cost


def billable_input(tokens):
    return tokens['input_tokens'] + tokens['cache_read_tokens'] + tokens['cache_write_tokens']


def _lock_id(tenant_id, key):
    digest = hashlib.sha256(f'usage|{tenant_id}|{key}'.encode()).digest()
    return int.from_bytes(digest[:8], 'big', signed=True)


def record_usage_event(event):
    """Meter one usage event exactly once.

    The idempotency key is the producer's request_id, else the stored event's
    id (a redelivered producer event_id never becomes a second row), so a
    retried or requeued event never writes a second set of metrics. Returns
    the metrics written, or [] for a repeat.
    """
    from zentinelle.models.usage import UsageMetric
    from zentinelle.services.usage_tracking import UsageTrackingService

    if not event.tenant_id:
        raise InvalidUsage('usage event has no tenant')
    payload = event.payload or {}
    if not isinstance(payload, dict):
        raise InvalidUsage('usage payload must be an object')
    tokens = normalize_tokens(payload)
    provider = str(payload.get('provider') or '').lower()[:50]
    model = str(payload.get('model') or '')[:100]
    if not model:
        raise InvalidUsage('usage event has no model')
    request_id = str(payload.get('request_id') or '')[:255]
    key = request_id or f'event:{event.id}'

    using = router.db_for_write(UsageMetric)
    with transaction.atomic(using=using):
        with connections[using].cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(%s)', [_lock_id(event.tenant_id, key)])
        if UsageMetric.objects.using(using).filter(
            tenant_id=event.tenant_id,
            ai_request_id=key,
            metric_type=UsageMetric.MetricType.AI_REQUESTS,
        ).exists():
            logger.info('Usage for %s already recorded; event %s is a repeat', key, event.id)
            return []
        records = UsageTrackingService.record_usage(
            tenant_id=event.tenant_id,
            user_identifier=str(payload.get('user_id') or event.user_identifier or 'unknown')[:255],
            provider=provider,
            model=model,
            input_tokens=tokens['input_tokens'],
            output_tokens=tokens['output_tokens'],
            cache_read_tokens=tokens['cache_read_tokens'],
            cache_write_tokens=tokens['cache_write_tokens'],
            request_id=key,
            endpoint=event.endpoint,
            deployment_id_ext=event.deployment_id_ext or '',
            occurred_at=event.occurred_at,
            metadata={
                'event_id': str(event.id),
                'event_type': event.event_type,
                'source': str(payload.get('source') or '')[:50],
            },
        )

    if request_id and event.endpoint_id:
        _fill_interaction(event, request_id, model, tokens)
    return records


def _fill_interaction(event, request_id, model, tokens):
    """Give the call's InteractionLog row its tokens and cost.

    The gateway logs the call when it evaluates it and reports usage after the
    response, under the same request_id. Only a row with no token count yet is
    filled, so a repeat changes nothing and a client-logged row is not
    overwritten.
    """
    from zentinelle.models.compliance import InteractionLog

    input_count = billable_input(tokens)
    InteractionLog.objects.filter(
        tenant_id=event.tenant_id,
        endpoint_id=event.endpoint_id,
        request_id=request_id,
        total_tokens__isnull=True,
    ).update(
        input_token_count=input_count,
        output_token_count=tokens['output_tokens'],
        total_tokens=input_count + tokens['output_tokens'],
        estimated_cost_usd=server_cost(model, tokens),
    )
