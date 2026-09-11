"""Idempotent reconciliation of conservative budget reservations."""
from decimal import ROUND_UP, Decimal

from django.db import transaction
from django.utils import timezone

from zentinelle.models import BudgetAccount, BudgetCharge


_PROVIDER_USAGE_VERIFIERS = {}


def register_provider_usage_verifier(provider, verifier):
    """Register an integration-owned verifier for provider billing evidence.

    ``verifier`` receives ``(usage, tenant_id, request_id)`` and must return
    ``True`` only after authenticating the provider response (for example with
    a signed webhook or provider API lookup). The reconciler never treats a
    source string as authentication.
    """
    if not isinstance(provider, str) or not provider.strip() or not callable(verifier):
        raise ValueError('provider and callable verifier are required')
    _PROVIDER_USAGE_VERIFIERS[provider.strip().lower()] = verifier


def clear_provider_usage_verifiers():
    _PROVIDER_USAGE_VERIFIERS.clear()


def reconcile_charge(charge_id, *, tenant_id, provider_usage, source='provider-api'):
    """Apply authenticated provider usage once and release only the difference.

    ``provider_usage`` must be a provider-authenticated object containing model,
    input_tokens and output_tokens. Agent telemetry is rejected as a source.
    """
    if source != 'provider-api':
        raise ValueError('Budget reconciliation requires authenticated provider usage')
    if not isinstance(provider_usage, dict):
        raise ValueError('provider_usage must be an object')
    provider = provider_usage.get('provider')
    if not isinstance(provider, str) or not provider.strip():
        raise ValueError('Provider usage requires an authenticated provider name')
    model = provider_usage.get('model')
    billed_usd = provider_usage.get('billed_usd')
    input_tokens = provider_usage.get('input_tokens')
    output_tokens = provider_usage.get('output_tokens')
    if billed_usd is not None:
        try:
            actual = Decimal(str(billed_usd)).quantize(Decimal('0.00000001'), rounding=ROUND_UP)
        except Exception as exc:
            raise ValueError('Provider billed_usd must be a non-negative decimal') from exc
        if not actual.is_finite() or actual < 0:
            raise ValueError('Provider billed_usd cannot be negative')
    else:
        if (not isinstance(model, str) or not model or
                not isinstance(input_tokens, int) or isinstance(input_tokens, bool) or
                not isinstance(output_tokens, int) or isinstance(output_tokens, bool)):
            raise ValueError('Provider usage requires model and integer token counts, or billed_usd')
        if min(input_tokens, output_tokens) < 0:
            raise ValueError('Provider token counts cannot be negative')
        if max(input_tokens, output_tokens) > 10_000_000_000:
            raise ValueError('Provider token counts exceed the supported bound')
    from zentinelle.services.usage_tracking import (MODEL_PRICING,
                                                    MODEL_PRICING_VERSION)
    if billed_usd is None:
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
        verifier = _PROVIDER_USAGE_VERIFIERS.get(provider.strip().lower())
        if verifier is None or not verifier(provider_usage, tenant_id, str(charge.request_id)):
            raise ValueError('Provider usage failed authenticated verification')
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
        charge.reconciliation_source = f'{source}:{provider.strip().lower()}'[:64]
        charge.save(update_fields=['actual_usd', 'reconciled_at', 'reconciliation_source'])
        return charge


def cancel_charge(charge_id, *, tenant_id, provider_request_id, provider='', attestation=None, source='provider-api'):
    """Release a reservation after an authenticated provider cancellation.

    Cancellation is deliberately separate from telemetry: callers must supply
    the provider request ID that matches the reservation, and the operation is
    idempotent under the same row lock as usage reconciliation.
    """
    if source != 'provider-api' or not provider_request_id or not isinstance(provider, str) or not provider.strip():
        raise ValueError('Budget cancellation requires authenticated provider confirmation')
    with transaction.atomic():
        charge = BudgetCharge.objects.select_for_update().get(id=charge_id, tenant_id=tenant_id)
        if charge.reconciled_at:
            return charge
        if str(provider_request_id) != str(charge.request_id):
            raise ValueError('Provider request_id does not match the reserved charge')
        verifier = _PROVIDER_USAGE_VERIFIERS.get(provider.strip().lower())
        if verifier is None or not verifier({'provider': provider, 'request_id': provider_request_id,
                                             'attestation': attestation, 'operation': 'cancellation'},
                                            tenant_id, str(charge.request_id)):
            raise ValueError('Provider cancellation failed authenticated verification')
        for account_id in charge.account_ids:
            account = BudgetAccount.objects.select_for_update().get(id=account_id, tenant_id=tenant_id)
            account.committed_usd = max(Decimal('0'), account.committed_usd - charge.amount_usd)
            account.save(update_fields=['committed_usd'])
        charge.actual_usd = Decimal('0')
        charge.reconciled_at = timezone.now()
        charge.reconciliation_source = f'provider-api:cancellation:{provider.strip().lower()}'[:64]
        charge.save(update_fields=['actual_usd', 'reconciled_at', 'reconciliation_source'])
        return charge
