"""
Usage tracking service for AI token usage and costs.
"""
import logging
from decimal import Decimal
from typing import Optional

from django.utils import timezone

from zentinelle.models.usage import UsageMetric

logger = logging.getLogger(__name__)
MODEL_PRICING_VERSION = 'catalog-2026-10-16'
MILLION = Decimal(1000000)


def _catalog():
    from zentinelle.services.model_prices import CATALOG
    return {model_id: {'provider': provider, 'input': Decimal(input_price), 'output': Decimal(output_price),
                       **extra}
            for model_id, provider, _name, input_price, output_price, extra in CATALOG}


# Shipped prices by exact model ID (services/model_prices.py).
MODEL_PRICING = _catalog()


def _registry_pricing(model, provider):
    """The registry's price for an exact model ID, or None.

    A provider-specific row wins. Without one, the highest price any provider
    lists for the ID is used, so an ambiguous ID is never under-priced.
    """
    from zentinelle.models.model_registry import AIModel
    rows = [row for row in AIModel.objects.select_related('provider').filter(model_id=model)
            if row.input_price_per_million is not None and row.output_price_per_million is not None]
    if provider:
        rows = [row for row in rows if row.provider.slug == provider] or rows
    if not rows:
        return None
    row = max(rows, key=lambda r: (r.provider.slug == provider, r.input_price_per_million + r.output_price_per_million))
    pricing = {'input': row.input_price_per_million, 'output': row.output_price_per_million,
               'source': 'registry'}
    # Long-context and scheduled prices were published with the catalog's
    # base price; they apply only while the registry still holds that price.
    shipped = MODEL_PRICING.get(model)
    if shipped and (shipped['input'], shipped['output']) == (pricing['input'], pricing['output']):
        for key in ('long_context', 'schedule'):
            if shipped.get(key):
                pricing[key] = shipped[key]
    return pricing


def resolve_model_pricing(model: str, provider: str = '', at=None):
    """The price of an exact model ID, or None when the model is unpriced.

    The one pricing resolver: admission, reconciliation, metering, alerts and
    the dashboards all price through it. The model registry is authoritative;
    the shipped catalog prices a model the registry has no price for. There is
    no fuzzy matching: a model ID that is not priced exactly is unpriced, and
    callers treat that as unknown cost, never as $0.

    Returns {'input', 'output'} in USD per 1M tokens, plus 'long_context' when
    the provider prices long prompts higher. A published scheduled price is
    applied once its date is reached.
    """
    if not isinstance(model, str) or not model:
        return None
    provider = provider.strip().lower() if isinstance(provider, str) else ''
    pricing = None
    try:
        pricing = _registry_pricing(model, provider)
    except Exception:
        # Pricing must remain usable during bootstrap and when the registry
        # database is temporarily unavailable.
        logger.warning('Model registry unavailable; pricing %s from the shipped catalog', model)
    if pricing is None:
        pricing = MODEL_PRICING.get(model)
    if pricing is None:
        return None
    pricing = {**pricing, 'input': Decimal(str(pricing['input'])), 'output': Decimal(str(pricing['output']))}
    today = (at or timezone.now()).date().isoformat()
    for change in sorted(pricing.pop('schedule', None) or [], key=lambda c: c['from']):
        if today >= change['from']:
            pricing['input'], pricing['output'] = Decimal(str(change['input'])), Decimal(str(change['output']))
            pricing.pop('long_context', None)
    return pricing


def price_tokens(pricing, input_tokens, output_tokens):
    """(input cost, output cost) in USD for one request at a resolved price.

    A request whose input is above a long-context threshold is priced at the
    long-context rate in full, as the providers bill it.
    """
    rates = pricing
    tier = pricing.get('long_context')
    if tier and input_tokens > int(tier['above_input_tokens']):
        rates = tier
    return (Decimal(input_tokens) * Decimal(str(rates['input'])) / MILLION,
            Decimal(output_tokens) * Decimal(str(rates['output'])) / MILLION)


class UsageTrackingService:
    @staticmethod
    def calculate_cost(model: str, input_tokens: int, output_tokens: int,
                       provider: str = '') -> tuple[Optional[Decimal], Optional[Decimal]]:
        """Cost of a call, or (None, None) when the model is unpriced.

        An unpriced model's cost is unknown, not zero: callers record it as
        unknown so it is never shown or budgeted as free.
        """
        pricing = resolve_model_pricing(model, provider)
        if not pricing:
            return None, None
        return price_tokens(pricing, input_tokens, output_tokens)

    @classmethod
    def record_usage(
        cls,
        tenant_id: str,
        user_identifier: str,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        request_id: str = '',
        endpoint=None,
        deployment_id_ext: str = '',
        occurred_at=None,
        metadata: dict = None,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
    ):
        """Record AI usage and calculate costs."""
        occurred_at = occurred_at or timezone.now()

        # Calculate costs if not provided. Cache tokens are input the provider
        # bills; until per-model cache rates exist they are priced as input.
        input_cost, output_cost = cls.calculate_cost(
            model, input_tokens + cache_read_tokens + cache_write_tokens, output_tokens, provider)

        # Combine into metadata for the UsageMetric record
        combined_metadata = metadata or {}
        if input_cost is None:
            logger.warning('No price for model %r (provider %r); usage recorded with unknown cost', model, provider)
            combined_metadata.update({
                'pricing': 'unpriced',
                'calculated_input_cost': None,
                'calculated_output_cost': None,
                'total_estimated_cost': None,
            })
        else:
            combined_metadata.update({
                'calculated_input_cost': float(input_cost),
                'calculated_output_cost': float(output_cost),
                'total_estimated_cost': float(input_cost + output_cost),
            })

        return UsageMetric.record_ai_usage(
            organization=tenant_id,
            user_identifier=user_identifier,
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            request_id=request_id,
            cache_read_tokens=cache_read_tokens,
            cache_write_tokens=cache_write_tokens,
            endpoint=endpoint,
            deployment=deployment_id_ext,
            occurred_at=occurred_at,
            metadata=combined_metadata
        )
