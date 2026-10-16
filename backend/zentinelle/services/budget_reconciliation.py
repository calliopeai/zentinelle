"""Idempotent reconciliation of conservative budget reservations.

A hard budget reserves an upper bound at admission (services/budgets.admit).
A charge's commitment is then settled from the call's actual cost:

- Authenticated provider usage (`reconcile_charge`, `cancel_charge`) settles
  it to the provider's figure.
- Reported usage (the metered usage events, `reconcile_reported_usage`)
  records the actual cost and raises the commitment when the call cost more
  than was reserved. It releases the rest of the reservation only when every
  budget on the charge sets `reconcile_with_reported_usage`, because an agent
  can report its own usage and must not be able to free budget by
  under-reporting. Repeat reports only ever raise the actual.

A charge's effective commitment is its settled actual once reconciled, else the
larger of its reservation and any reported actual.
"""
from decimal import ROUND_UP, Decimal

from django.db import router, transaction
from django.utils import timezone

from zentinelle.models import BudgetAccount, BudgetCharge, Policy

PRECISION = Decimal('0.00000001')

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
    from zentinelle.services.usage_tracking import (price_tokens,
                                                    resolve_model_pricing)
    if billed_usd is None:
        pricing = resolve_model_pricing(model, provider.strip().lower())
        if not pricing:
            raise ValueError('No current pricing source for provider model')
        input_cost, output_cost = price_tokens(pricing, input_tokens, output_tokens)
        actual = (input_cost + output_cost).quantize(PRECISION, rounding=ROUND_UP)
    with transaction.atomic(using=router.db_for_write(BudgetCharge)):
        charge = BudgetCharge.objects.select_for_update().get(id=charge_id, tenant_id=tenant_id)
        if _provider_settled(charge):
            return charge
        provider_request_id = provider_usage.get('request_id')
        if not provider_request_id or str(provider_request_id) != str(charge.request_id):
            raise ValueError('Provider usage request_id does not match the reserved charge')
        verifier = _PROVIDER_USAGE_VERIFIERS.get(provider.strip().lower())
        if verifier is None or not verifier(provider_usage, tenant_id, str(charge.request_id)):
            raise ValueError('Provider usage failed authenticated verification')
        # The actual is priced with today's prices (the one resolver), so a
        # charge reserved under an older catalog still reconciles.
        reservation = charge.amount_usd
        if actual > reservation:
            # A provider bill above the conservative reservation is an
            # anomaly. Do not partially release or mark it reconciled; keep
            # the reservation intact for operator review.
            raise ValueError('Provider usage exceeds the reserved budget')
        _settle(charge, actual, f'{source}:{provider.strip().lower()}', reconciled=True)
        return charge


def cancel_charge(charge_id, *, tenant_id, provider_request_id, provider='', attestation=None, source='provider-api'):
    """Release a reservation after an authenticated provider cancellation.

    Cancellation is deliberately separate from telemetry: callers must supply
    the provider request ID that matches the reservation, and the operation is
    idempotent under the same row lock as usage reconciliation.
    """
    if source != 'provider-api' or not provider_request_id or not isinstance(provider, str) or not provider.strip():
        raise ValueError('Budget cancellation requires authenticated provider confirmation')
    with transaction.atomic(using=router.db_for_write(BudgetCharge)):
        charge = BudgetCharge.objects.select_for_update().get(id=charge_id, tenant_id=tenant_id)
        if _provider_settled(charge):
            return charge
        if str(provider_request_id) != str(charge.request_id):
            raise ValueError('Provider request_id does not match the reserved charge')
        verifier = _PROVIDER_USAGE_VERIFIERS.get(provider.strip().lower())
        if verifier is None or not verifier({'provider': provider, 'request_id': provider_request_id,
                                             'attestation': attestation, 'operation': 'cancellation'},
                                            tenant_id, str(charge.request_id)):
            raise ValueError('Provider cancellation failed authenticated verification')
        _settle(charge, Decimal('0'), f'provider-api:cancellation:{provider.strip().lower()}', reconciled=True)
        return charge


def reconcile_reported_usage(*, tenant_id, endpoint_id, request_id, cost):
    """Apply one metered usage report's cost to the call's reservation, if any.

    `cost` is the server's price for the report (None for an unpriced model,
    which leaves the reservation as it is). The actual only rises across
    repeat reports. Returns the charge, or None when the call reserved nothing.
    """
    if cost is None or not request_id or endpoint_id is None:
        return None
    cost = Decimal(cost).quantize(PRECISION, rounding=ROUND_UP)
    with transaction.atomic(using=router.db_for_write(BudgetCharge)):
        charge = BudgetCharge.objects.select_for_update().filter(
            tenant_id=tenant_id, endpoint_id_ext=endpoint_id, request_id=request_id).first()
        if charge is None or _provider_settled(charge):
            return charge
        actual = max(cost, charge.actual_usd or Decimal('0'))
        if charge.actual_usd is not None and actual == charge.actual_usd:
            return charge
        _settle(charge, actual, 'reported-usage', reconciled=_releases_on_reported_usage(charge))
        return charge


def effective_commitment(charge):
    """What a charge holds against its budgets now."""
    if charge.reconciled_at:
        return charge.actual_usd or Decimal('0')
    return max(charge.amount_usd, charge.actual_usd or Decimal('0'))


def _provider_settled(charge):
    return bool(charge.reconciled_at) and charge.reconciliation_source.startswith('provider-api')


def _releases_on_reported_usage(charge):
    accounts = BudgetAccount.objects.filter(tenant_id=charge.tenant_id, id__in=charge.account_ids)
    policy_ids = [account.policy_id_ext for account in accounts]
    policies = Policy.objects.filter(tenant_id=charge.tenant_id, id__in=policy_ids)
    return bool(policy_ids) and len(policies) == len(set(policy_ids)) and all(
        (policy.config or {}).get('reconcile_with_reported_usage') is True for policy in policies)


def _settle(charge, actual, source, *, reconciled):
    """Record `actual` and move each account by the change in commitment.

    Called with the charge row locked. A reconciled charge commits its actual;
    an unreconciled one never commits less than its reservation.
    """
    before = effective_commitment(charge)
    charge.actual_usd = actual
    charge.reconciled_at = timezone.now() if reconciled else None
    charge.reconciliation_source = source[:64]
    delta = effective_commitment(charge) - before
    if delta:
        for account_id in charge.account_ids:
            account = BudgetAccount.objects.select_for_update().get(id=account_id, tenant_id=charge.tenant_id)
            account.committed_usd = max(Decimal('0'), account.committed_usd + delta)
            account.save(update_fields=['committed_usd'])
    charge.save(update_fields=['actual_usd', 'reconciled_at', 'reconciliation_source'])
