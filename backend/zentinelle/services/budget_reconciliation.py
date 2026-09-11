"""Idempotent reconciliation of conservative budget reservations."""
from decimal import ROUND_UP, Decimal

from django.db import transaction
from django.utils import timezone

from zentinelle.models import BudgetAccount, BudgetCharge


def reconcile_charge(charge_id, *, tenant_id, provider_usage, source='provider-api'):
    """Apply authenticated provider usage once and release only the difference.

    ``provider_usage`` must be a provider-authenticated object containing model,
    input_tokens and output_tokens. Agent telemetry is rejected as a source.
    """
    if source != 'provider-api':
        raise ValueError('Budget reconciliation requires authenticated provider usage')
    if not isinstance(provider_usage, dict):
        raise ValueError('provider_usage must be an object')
    model = provider_usage.get('model')
    input_tokens = provider_usage.get('input_tokens')
    output_tokens = provider_usage.get('output_tokens')
    if not isinstance(model, str) or not isinstance(input_tokens, int) or not isinstance(output_tokens, int):
        raise ValueError('Provider usage requires model and integer token counts')
    if min(input_tokens, output_tokens) < 0:
        raise ValueError('Provider token counts cannot be negative')
    from zentinelle.services.usage_tracking import (MODEL_PRICING,
                                                    MODEL_PRICING_VERSION)
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        raise ValueError('No current pricing source for provider model')
    actual = ((Decimal(input_tokens) * Decimal(str(pricing['input'])) +
               Decimal(output_tokens) * Decimal(str(pricing['output']))) / Decimal(1000000)).quantize(
                   Decimal('0.00000001'), rounding=ROUND_UP)
    with transaction.atomic():
        charge = BudgetCharge.objects.select_for_update().get(id=charge_id, tenant_id=tenant_id)
        if charge.reconciled_at:
            return charge
        provider_request_id = provider_usage.get('request_id')
        if provider_request_id is not None and str(provider_request_id) != str(charge.request_id):
            raise ValueError('Provider usage request_id does not match the reserved charge')
        if charge.pricing_version and charge.pricing_version != MODEL_PRICING_VERSION:
            raise ValueError('Budget reservation uses a stale pricing source')
        reservation = charge.amount_usd
        release = max(Decimal('0'), reservation - actual)
        for account_id in charge.account_ids:
            account = BudgetAccount.objects.select_for_update().get(id=account_id, tenant_id=tenant_id)
            account.committed_usd = max(Decimal('0'), account.committed_usd - release)
            account.save(update_fields=['committed_usd'])
        charge.actual_usd = actual
        charge.reconciled_at = timezone.now()
        charge.reconciliation_source = source
        charge.save(update_fields=['actual_usd', 'reconciled_at', 'reconciliation_source'])
        return charge
