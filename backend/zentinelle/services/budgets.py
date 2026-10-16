"""Authoritative scoped budgets with atomic, conservative admission charges.

Admitted upper bounds remain committed until the call's usage is reconciled
(services/budget_reconciliation.py). Reported usage that exceeds a reservation
raises the commitment; only authenticated provider usage, or reported usage on
a budget that opts in, releases the rest.
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


# The actions that are one model call, and so spend provider budget.
MODEL_CALL_ACTIONS = ('llm:invoke', 'llm_call', 'ai_request', 'chain_input')
# The configured actions that refuse a call (actions.denies under enforce).
_DENYING_ACTIONS = ('block', 'require_approval', 'redact')


def _scoped_interactions(policy):
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
    return qs


def historical_spend(policy):
    qs = _scoped_interactions(policy)
    return max(Decimal('0'), qs.aggregate(total=Sum('estimated_cost_usd'))['total'] or Decimal('0'))


def unpriced_calls(policy):
    """This month's calls in the budget's scope whose cost is unknown.

    Their model has no price, so their spend is not in the budget's total;
    callers surface the count rather than treat those calls as free.
    """
    return _scoped_interactions(policy).filter(estimated_cost_usd__isnull=True, total_tokens__gt=0).count()


def current_spend(policy):
    account = BudgetAccount.objects.filter(tenant_id=policy.tenant_id, policy_id_ext=policy.pk, period=month_start().date()).first()
    return account.committed_usd if account else historical_spend(policy)


def budget_status(policy):
    """Where one budget_limit policy stands this month.

    The evaluator, the usage alerts and the dashboards all read a budget
    through this, so they agree on the limit, the scoped spend and the level.
    `level` is None, 'threshold' (at or past alert_threshold_percent) or
    'exceeded'. Raises ValueError on an invalid budget configuration.
    """
    limit = monthly_limit(policy)
    raw = policy.config.get('alert_threshold_percent', 80)
    threshold = None if isinstance(raw, bool) else Decimal(str(raw))
    if threshold is None or not threshold.is_finite() or not 0 <= threshold <= 100:
        raise ValueError('alert_threshold_percent must be a number from 0 to 100')
    spend = current_spend(policy)
    percent = (spend / limit * 100) if limit > 0 else (Decimal('100') if spend > 0 else Decimal('0'))
    level = 'exceeded' if spend >= limit else ('threshold' if percent >= threshold else None)
    return {'limit': limit, 'spend': spend, 'remaining': limit - spend, 'percent': percent,
            'threshold_percent': threshold, 'level': level, 'unpriced_calls': unpriced_calls(policy)}


def request_upper_bound(context):
    from zentinelle.services.usage_tracking import resolve_model_pricing
    model = context.get('model') or context.get('ai_model')
    price = resolve_model_pricing(model, context.get('provider') or '')
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
        if not isinstance(body, dict):
            raise ValueError('Hard budget request_body must be an object')
        tools = body.get('tools', [])
        if not isinstance(tools, list) or any(not isinstance(t, dict) or t.get('type', 'function') != 'function' for t in tools):
            raise ValueError('Hard budget does not support multiple candidates or provider-hosted tools')
    from zentinelle.services.usage_tracking import price_tokens
    input_cost, output_cost = price_tokens(price, inputs * 2, tokens)
    return (input_cost + output_cost).quantize(Decimal('0.00000001'), rounding=ROUND_UP)


def estimated_call_cost(action, context):
    """The server's upper bound on what this call can cost, or None if unknown.

    Only a model call spends provider budget, so any other action has no model
    cost (Decimal 0). A model call's bound is the hard-budget reservation:
    known only for a priced model with a bounded text request and an explicit
    maximum output.
    """
    if action not in MODEL_CALL_ACTIONS:
        return Decimal('0')
    try:
        return request_upper_bound(context)
    except (ValueError, TypeError, ArithmeticError):
        return None


def _can_refuse(policy):
    escalation = policy.escalation or {}
    steps = [step['action'] for key in ('repeat', 'severity') for step in escalation.get(key, [])]
    return any(action in _DENYING_ACTIONS for action in [policy.action, *steps])


def admit(policies, endpoint, action, context):
    from zentinelle.services.approvals import consume_approvals

    # Only a budget that can refuse reserves: enforce, hard_limit, and an
    # action (configured, or an escalation step) that refuses a call. An
    # enforced hard budget that can only alert or warn alerts through its
    # evaluator and never refuses here.
    budgets = sorted([p for p in policies if p.policy_type == 'budget_limit' and
                      p.enforcement == 'enforce' and p.config.get('hard_limit', True) and
                      _can_refuse(p)], key=lambda p: str(p.id))
    # Responses were charged at invocation. Read-only checks consume no provider budget.
    if action not in MODEL_CALL_ACTIONS:
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
                from zentinelle.services.usage_tracking import \
                    MODEL_PRICING_VERSION
                dimensions = {
                    key: str(context.get(key, '') or '')[:255]
                    for key in ('team_id_ext', 'app_id_ext', 'session_id_ext', 'task_id_ext')
                }
                charge = BudgetCharge.objects.create(tenant_id=endpoint.tenant_id, endpoint_id_ext=endpoint.pk,
                                                     request_id=request_id, amount_usd=amount, account_ids=accounts,
                                                     pricing_version=MODEL_PRICING_VERSION, **dimensions)
                context['budget_reservation'] = {'id': str(charge.pk), 'committed_usd': str(amount),
                                                 'basis': 'conservative_upper_bound', 'refundable_by_telemetry': False}
            if not consume_approvals(context.get('_validated_approval_ids', []), tenant_id=endpoint.tenant_id):
                raise ValueError('Approval has already been used or expired')
    except (ValueError, InvalidOperation) as exc:
        return str(exc)
    except IntegrityError:
        return 'This request_id has already been admitted; use a new ID for a new execution'
    return None
