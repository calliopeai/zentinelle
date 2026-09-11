"""Authoritative scoped budgets with atomic, conservative admission charges.

Admitted upper bounds remain committed. Untrusted usage reports never refund them.
A trusted provider reconciliation path can be added without weakening admission.
"""
from decimal import ROUND_UP, Decimal, InvalidOperation

from django.db import IntegrityError, router, transaction
from django.db.models import Sum
from django.utils import timezone

from zentinelle.models.budget import BudgetAccount, BudgetCharge


def monthly_limit(policy):
    canonical = policy.config.get('monthly_budget_usd')
    legacy = policy.config.get('monthly_limit_usd')
    if canonical is not None and legacy is not None and Decimal(str(canonical)) != Decimal(str(legacy)):
        raise ValueError('Conflicting monthly budget settings')
    value = Decimal(str(canonical if canonical is not None else legacy))
    if not value.is_finite() or value < 0:
        raise ValueError('Monthly budget must be a finite nonnegative amount')
    return value


def month_start():
    return timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def historical_spend(policy):
    from zentinelle.models.compliance import InteractionLog
    qs = InteractionLog.objects.filter(tenant_id=policy.tenant_id, occurred_at__gte=month_start())
    if policy.scope_type == 'endpoint':
        qs = qs.filter(endpoint_id=policy.scope_endpoint_id)
    elif policy.scope_type == 'deployment':
        qs = qs.filter(deployment_id_ext=policy.scope_deployment_id_ext)
    elif policy.scope_type == 'sub_organization':
        qs = qs.filter(endpoint__sub_organization_id_ext=policy.scope_sub_organization_id_ext)
    elif policy.scope_type == 'user':
        qs = qs.filter(user_identifier=policy.scope_user_id_ext)
    return max(Decimal('0'), qs.aggregate(total=Sum('estimated_cost_usd'))['total'] or Decimal('0'))


def current_spend(policy):
    account = BudgetAccount.objects.filter(tenant_id=policy.tenant_id, policy_id_ext=policy.pk, period=month_start().date()).first()
    return account.committed_usd if account else historical_spend(policy)


def request_upper_bound(context):
    from zentinelle.services.usage_tracking import MODEL_PRICING
    model = context.get('model') or context.get('ai_model')
    price = MODEL_PRICING.get(model)
    tokens = context.get('max_output_tokens')
    if not price or not isinstance(tokens, int) or isinstance(tokens, bool) or tokens <= 0:
        raise ValueError('Hard budget requires known model pricing and an explicit positive maximum output token count')
    if context.get('has_multimodal') or not isinstance(context.get('input_text'), str):
        raise ValueError('Hard budget requires a bounded text request')
    # UTF-8 bytes plus framing allowance conservatively bound text tokenization.
    inputs = len(context['input_text'].encode()) + 4096
    if context.get('request_body'):
        import json
        body = context['request_body']
        body = json.loads(body) if isinstance(body, str) else body
        if body.get('n', 1) != 1 or any(t.get('type', 'function') != 'function' for t in body.get('tools', [])):
            raise ValueError('Hard budget does not support multiple candidates or provider-hosted tools')
    amount = (Decimal(inputs * 2) * Decimal(str(price['input'])) + Decimal(tokens) * Decimal(str(price['output']))) / Decimal(1000000)
    return amount.quantize(Decimal('0.00000001'), rounding=ROUND_UP)


def admit(policies, endpoint, action, context):
    from zentinelle.services.approvals import consume_approvals
    budgets = sorted([p for p in policies if p.policy_type == 'budget_limit' and
                      p.enforcement == 'enforce' and p.config.get('hard_limit', True)], key=lambda p: str(p.id))
    # Responses were charged at invocation. Read-only checks consume no provider budget.
    if action not in ('llm:invoke', 'llm_call', 'ai_request', 'chain_input'):
        budgets = []
    using = router.db_for_write(BudgetAccount)
    try:
        with transaction.atomic(using=using):
            if budgets:
                request_id = context.get('request_id')
                if not isinstance(request_id, str) or not request_id or len(request_id) > 255:
                    raise ValueError('Hard budget requires a unique request_id')
                amount = request_upper_bound(context)
                accounts = []
                for policy in budgets:
                    account, _ = BudgetAccount.objects.get_or_create(
                        tenant_id=endpoint.tenant_id, policy_id_ext=policy.pk, period=month_start().date(),
                        defaults={'committed_usd': historical_spend(policy)},
                    )
                    account = BudgetAccount.objects.select_for_update().get(tenant_id=endpoint.tenant_id, pk=account.pk)
                    if account.committed_usd + amount > monthly_limit(policy):
                        raise ValueError(f'Monthly budget cannot admit this request: {policy.name}')
                    account.committed_usd += amount
                    account.save(update_fields=['committed_usd'])
                    accounts.append(account.pk)
                charge = BudgetCharge.objects.create(tenant_id=endpoint.tenant_id, endpoint_id_ext=endpoint.pk,
                                                     request_id=request_id, amount_usd=amount, account_ids=accounts)
                context['budget_reservation'] = {'id': str(charge.pk), 'committed_usd': str(amount),
                                                 'basis': 'conservative_upper_bound', 'refundable_by_telemetry': False}
            if not consume_approvals(context.get('_validated_approval_ids', []), tenant_id=endpoint.tenant_id):
                raise ValueError('Approval has already been used or expired')
    except (ValueError, InvalidOperation) as exc:
        return str(exc)
    except IntegrityError:
        return 'This request_id has already been admitted; use a new ID for a new execution'
    return None
