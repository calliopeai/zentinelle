"""Pricing, budgets and reconciliation (audit C11, H5, M5, M14, H22, H19).

Before this: model prices matched by substring, so gpt-4 was priced as
gpt-4o-mini and current models priced at $0; hard-budget reservations were
never reconciled; budget usage alerts filtered on the wrong enum value; budget
admission refused under an alert action; a soft budget never alerted; and the
seeded human_oversight policy matched every evaluation because the cost was
never known.
"""
import io
from datetime import datetime
from datetime import timezone as dt_timezone
from decimal import Decimal
from types import SimpleNamespace

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from zentinelle.auth.roles import ROLE_VIEWER, assign_role
from zentinelle.models import (AIModel, AIProvider, BudgetAccount,
                               BudgetCharge, Event, Policy)
from zentinelle.models.compliance import InteractionLog
from zentinelle.models.notification import Notification
from zentinelle.models.usage import UsageMetric
from zentinelle.services.budgets import month_start, request_upper_bound
from zentinelle.services.policy_engine import PolicyEngine
from zentinelle.services.usage_tracking import (UsageTrackingService,
                                                resolve_model_pricing)
from zentinelle.tasks.events import process_event_batch
from zentinelle.tests._two_tenants import (TENANT_A, TENANT_B, TwoTenantMixin,
                                           make_endpoint)

# The tenant a portal session resolves to in standalone mode.
PORTAL_TENANT = '00000000-0000-0000-0000-000000000001'


def price(model, provider=''):
    p = resolve_model_pricing(model, provider)
    return None if p is None else (p['input'], p['output'])


class ExactPricingTest(TestCase):
    """C11: one resolver, exact model IDs, unpriced is unknown."""

    def test_gpt4_is_priced_as_gpt4_not_gpt4o_mini(self):
        self.assertEqual(price('gpt-4'), (Decimal('30'), Decimal('60')))
        self.assertEqual(price('gpt-4-0613'), (Decimal('30'), Decimal('60')))

    def test_current_models_are_priced(self):
        for model, expected in {
            'gpt-5': ('1.25', '10'), 'gpt-4.1': ('2', '8'), 'o3': ('2', '8'), 'o4-mini': ('1.10', '4.40'),
            'gpt-6-sol': ('2', '10'),
            'claude-opus-4-5-20251101': ('5', '25'), 'claude-haiku-4-5': ('1', '5'),
            'claude-opus-5-5': ('4', '20'), 'claude-sonnet-5': ('2', '10'),
            'gemini-2.5-pro': ('1.25', '10'), 'gemini-2.5-flash': ('0.30', '2.50'),
        }.items():
            with self.subTest(model=model):
                self.assertEqual(price(model), tuple(Decimal(v) for v in expected))

    def test_names_that_only_contain_a_priced_id_are_unpriced(self):
        for model in ('4o', 'claude', 'gpt-4o-custom', 'my-gpt-5', 'gemini-2.5-pro-002', ''):
            with self.subTest(model=model):
                self.assertIsNone(resolve_model_pricing(model))

    def test_the_registry_is_authoritative_and_provider_specific(self):
        openai = AIProvider.objects.create(slug='openai-test', name='OpenAI test')
        azure = AIProvider.objects.create(slug='azure-test', name='Azure test')
        AIModel.objects.create(provider=openai, model_id='gpt-4o', name='GPT-4o',
                               input_price_per_million=Decimal('3'), output_price_per_million=Decimal('12'))
        AIModel.objects.create(provider=azure, model_id='gpt-4o', name='GPT-4o',
                               input_price_per_million=Decimal('2.75'), output_price_per_million=Decimal('11'))
        self.assertEqual(price('gpt-4o', 'azure-test'), (Decimal('2.75'), Decimal('11')))
        # Without a provider an ambiguous ID takes the higher price.
        self.assertEqual(price('gpt-4o'), (Decimal('3'), Decimal('12')))
        # A row with no price does not hide the catalog.
        AIModel.objects.create(provider=openai, model_id='gpt-5', name='GPT-5')
        self.assertEqual(price('gpt-5'), (Decimal('1.25'), Decimal('10')))

    def test_long_prompts_and_scheduled_prices(self):
        short = UsageTrackingService.calculate_cost('gemini-2.5-pro', 200_000, 1_000_000)
        long = UsageTrackingService.calculate_cost('gemini-2.5-pro', 200_001, 1_000_000)
        self.assertEqual(short[1], Decimal('10'))
        self.assertEqual(long[1], Decimal('15'))
        before = resolve_model_pricing('gemini-4-argon', at=datetime(2026, 11, 30, tzinfo=dt_timezone.utc))
        after = resolve_model_pricing('gemini-4-argon', at=datetime(2026, 12, 1, tzinfo=dt_timezone.utc))
        self.assertEqual((before['input'], after['input']), (Decimal('2'), Decimal('4')))

    def test_an_unpriced_call_is_recorded_with_unknown_cost_not_zero(self):
        UsageTrackingService.record_usage(tenant_id=TENANT_A, user_identifier='u', provider='acme',
                                          model='acme-large', input_tokens=100, output_tokens=10)
        metadata = UsageMetric.objects.filter(tenant_id=TENANT_A).first().metadata
        self.assertEqual(metadata['pricing'], 'unpriced')
        self.assertIsNone(metadata['total_estimated_cost'])

    def test_the_hard_budget_bound_uses_the_real_gpt4_price(self):
        bound = request_upper_bound({'model': 'gpt-4', 'input_text': 'x' * 4000, 'max_output_tokens': 8000})
        # 8000 output tokens at $60/M alone is $0.48.
        self.assertGreaterEqual(bound, Decimal('0.48'))


class PriceSeedTest(TestCase):
    """The migration fills the registry's prices and never overwrites an operator's."""

    def seed(self):
        from importlib import import_module
        migration = import_module('zentinelle.migrations.0066_seed_model_prices')
        migration.seed_prices(apps, SimpleNamespace(connection=connection))

    def test_missing_and_stale_prices_are_filled_and_operator_prices_kept(self):
        google, _ = AIProvider.objects.get_or_create(slug='google', defaults={'name': 'Google'})
        openai, _ = AIProvider.objects.get_or_create(slug='openai', defaults={'name': 'OpenAI'})
        AIModel.objects.filter(model_id__in=['gemini-2.5-flash', 'gpt-5', 'gpt-4.1']).delete()
        stale = AIModel.objects.create(provider=google, model_id='gemini-2.5-flash', name='f',
                                       input_price_per_million=Decimal('0.15'),
                                       output_price_per_million=Decimal('0.60'))
        empty = AIModel.objects.create(provider=openai, model_id='gpt-5', name='g')
        operator = AIModel.objects.create(provider=openai, model_id='gpt-4.1', name='o',
                                          input_price_per_million=Decimal('1.80'),
                                          output_price_per_million=Decimal('7.20'))
        models_before = AIModel.objects.count()

        self.seed()

        for row, expected in ((stale, ('0.30', '2.50')), (empty, ('1.25', '10')), (operator, ('1.80', '7.20'))):
            row.refresh_from_db()
            self.assertEqual((row.input_price_per_million, row.output_price_per_million),
                             tuple(Decimal(v) for v in expected))
        self.assertEqual(empty.metadata['pricing']['source'], 'https://developers.openai.com/api/docs/pricing')
        # Rows are never created: the registry also drives the picker and routing.
        self.assertEqual(AIModel.objects.count(), models_before)

    def test_a_model_sync_never_clears_or_replaces_a_price(self):
        from zentinelle.services.model_sync import _upsert_models
        openai, _ = AIProvider.objects.get_or_create(slug='openai', defaults={'name': 'OpenAI'})
        AIModel.objects.filter(model_id__in=['gpt-4o', 'o3']).delete()
        AIModel.objects.create(provider=openai, model_id='gpt-4o', name='GPT-4o',
                               input_price_per_million=Decimal('2.40'), output_price_per_million=Decimal('9.60'))
        _upsert_models(openai, [{'model_id': 'gpt-4o'}, {'model_id': 'o3'}])
        self.assertEqual(price('gpt-4o', 'openai'), (Decimal('2.40'), Decimal('9.60')))
        row = AIModel.objects.get(provider=openai, model_id='o3')
        self.assertEqual((row.input_price_per_million, row.output_price_per_million), (Decimal('2'), Decimal('8')))


def budget(tenant, enforcement='enforce', action='block', **config):
    defaults = {'monthly_budget_usd': 500, 'alert_threshold_percent': 80, 'hard_limit': True}
    return Policy.objects.create(tenant_id=tenant, policy_type=Policy.PolicyType.BUDGET_LIMIT, name='Budget',
                                 config={**defaults, **config}, enforcement=enforcement, action=action)


def call(endpoint, request_id, **context):
    return PolicyEngine().evaluate(endpoint, 'llm:invoke', None, {
        'input_text': 'hi', 'model': 'gpt-4o', 'max_output_tokens': 100, 'request_id': request_id, **context})


class ReconciliationTest(TwoTenantMixin, TestCase):
    """H5: a reservation is reconciled with the call's metered cost."""

    def setUp(self):
        super().setUp()
        cache.clear()

    def report(self, request_id, prompt_tokens, completion_tokens, endpoint=None, model='gpt-4o'):
        endpoint = endpoint or self.endpoint_a
        event = Event.objects.create(
            tenant_id=endpoint.tenant_id, endpoint=endpoint, event_type='llm:usage',
            event_category=Event.Category.TELEMETRY, occurred_at=timezone.now(), status=Event.Status.PENDING,
            payload={'provider': 'openai', 'model': model, 'prompt_tokens': prompt_tokens,
                     'completion_tokens': completion_tokens, 'request_id': request_id, 'source': 'gateway'})
        process_event_batch([str(event.id)], 'telemetry')
        event.refresh_from_db()
        self.assertEqual(event.status, Event.Status.PROCESSED)

    def admitted(self, request_id, **config):
        policy = budget(TENANT_A, **config)
        self.assertTrue(call(self.endpoint_a, request_id).allowed)
        charge = BudgetCharge.objects.get(tenant_id=TENANT_A, request_id=request_id)
        return policy, charge, BudgetAccount.objects.get(id=charge.account_ids[0])

    def test_reported_usage_records_the_actual_and_holds_the_reservation(self):
        _policy, charge, account = self.admitted('r-1')
        self.report('r-1', 10, 5)
        charge.refresh_from_db()
        account.refresh_from_db()
        self.assertEqual(charge.actual_usd, Decimal('0.00007500'))
        self.assertIsNone(charge.reconciled_at)
        self.assertEqual(charge.reconciliation_source, 'reported-usage')
        # Reported usage alone never frees budget: an agent could under-report.
        self.assertEqual(account.committed_usd, charge.amount_usd)

    def test_a_budget_that_opts_in_releases_to_the_actual(self):
        _policy, charge, account = self.admitted('r-2', reconcile_with_reported_usage=True)
        self.report('r-2', 10, 5)
        charge.refresh_from_db()
        account.refresh_from_db()
        self.assertIsNotNone(charge.reconciled_at)
        self.assertEqual(account.committed_usd, Decimal('0.00007500'))
        # A lower repeat cannot lower it; a higher one raises it.
        self.report('r-2', 1, 1)
        account.refresh_from_db()
        self.assertEqual(account.committed_usd, Decimal('0.00007500'))
        self.report('r-2', 1000, 200)
        account.refresh_from_db()
        self.assertEqual(account.committed_usd, Decimal('0.00450000'))

    def test_a_call_that_cost_more_than_its_reservation_raises_the_commitment(self):
        _policy, charge, account = self.admitted('r-3')
        reserved = charge.amount_usd
        self.report('r-3', 100_000, 10_000)
        account.refresh_from_db()
        charge.refresh_from_db()
        self.assertEqual(charge.actual_usd, Decimal('0.35000000'))
        self.assertGreater(charge.actual_usd, reserved)
        self.assertEqual(account.committed_usd, charge.actual_usd)

    def test_an_unpriced_report_leaves_the_reservation(self):
        _policy, charge, account = self.admitted('r-4', reconcile_with_reported_usage=True)
        self.report('r-4', 10, 5, model='acme-large')
        charge.refresh_from_db()
        self.assertIsNone(charge.actual_usd)

    def test_another_tenant_cannot_reconcile_the_charge(self):
        _policy, charge, account = self.admitted('shared-id', reconcile_with_reported_usage=True)
        self.report('shared-id', 10, 5, endpoint=self.endpoint_b)
        charge.refresh_from_db()
        account.refresh_from_db()
        self.assertIsNone(charge.actual_usd)
        self.assertEqual(account.committed_usd, charge.amount_usd)

    def test_a_charge_reserved_under_an_older_catalog_still_reconciles(self):
        from zentinelle.services.budget_reconciliation import (
            clear_provider_usage_verifiers, reconcile_charge,
            register_provider_usage_verifier)
        register_provider_usage_verifier('fixture', lambda *a: True)
        try:
            charge = BudgetCharge.objects.create(tenant_id=TENANT_A, endpoint_id_ext=self.endpoint_a.id,
                                                 request_id='r-old', amount_usd=Decimal('1'), account_ids=[],
                                                 pricing_version='catalog-2026-09-13')
            result = reconcile_charge(charge.id, tenant_id=TENANT_A, provider_usage={
                'provider': 'fixture', 'request_id': 'r-old', 'model': 'gpt-4o-2024-08-06',
                'input_tokens': 10, 'output_tokens': 10})
        finally:
            clear_provider_usage_verifiers()
        self.assertEqual(result.actual_usd, Decimal('0.00012500'))


@override_settings(DATABASE_ROUTERS=['zentinelle.db_router.ZentinelleRouter'])
class ReconciliationWithRouterTest(TransactionTestCase):
    """T6: the settlement locks BudgetCharge on its own database alias."""

    databases = '__all__'

    def test_reported_usage_settles_with_the_router_enabled(self):
        from zentinelle.services.budget_reconciliation import \
            reconcile_reported_usage
        endpoint, _ = make_endpoint(TENANT_A, 'routed-agent')
        policy = Policy.objects.create(tenant_id=TENANT_A, policy_type='budget_limit', name='b',
                                       config={'monthly_budget_usd': 5, 'reconcile_with_reported_usage': True})
        account = BudgetAccount.objects.create(tenant_id=TENANT_A, policy_id_ext=policy.pk,
                                               period=month_start().date(), committed_usd=Decimal('1'))
        BudgetCharge.objects.create(tenant_id=TENANT_A, endpoint_id_ext=endpoint.id, request_id='routed',
                                    amount_usd=Decimal('1'), account_ids=[account.id])
        charge = reconcile_reported_usage(tenant_id=TENANT_A, endpoint_id=endpoint.id, request_id='routed',
                                          cost=Decimal('0.25'))
        account.refresh_from_db()
        self.assertIsNotNone(charge.reconciled_at)
        self.assertEqual(account.committed_usd, Decimal('0.25'))


class BudgetActionsTest(TwoTenantMixin, TestCase):
    """M14 and H22: a budget's action decides what a match does."""

    def setUp(self):
        super().setUp()
        cache.clear()

    def spend(self, policy, amount):
        BudgetAccount.objects.create(tenant_id=policy.tenant_id, policy_id_ext=policy.pk,
                                     period=month_start().date(), committed_usd=amount)

    def alerts(self):
        return Notification.objects.filter(tenant_id=TENANT_A, subject__startswith='Policy alert')

    def test_an_enforced_hard_budget_with_the_alert_action_alerts_and_admits(self):
        policy = budget(TENANT_A, action='alert')
        self.spend(policy, 600)
        result = call(self.endpoint_a, 'm14')
        self.assertTrue(result.allowed, result.reason)
        self.assertEqual(result.enforcement['action'], 'alert')
        self.assertEqual(self.alerts().count(), 1)
        # And it reserves nothing: only a budget that refuses does.
        self.assertFalse(BudgetCharge.objects.filter(tenant_id=TENANT_A).exists())

    def test_a_hard_budget_that_escalates_to_block_still_reserves(self):
        # Its configured action alerts, but an escalation step can refuse the
        # call, so admission must hold its limit like a block budget does.
        policy = Policy.objects.create(
            tenant_id=TENANT_A, policy_type=Policy.PolicyType.BUDGET_LIMIT, name='Budget', enforcement='enforce',
            config={'monthly_budget_usd': 500, 'alert_threshold_percent': 80, 'hard_limit': True}, action='alert',
            escalation={'severity': [{'min_severity': 'info', 'action': 'block'}]})
        self.spend(policy, Decimal('499.9999'))
        self.assertFalse(call(self.endpoint_a, 'm14-escalates').allowed)

    def test_an_enforced_hard_budget_with_the_block_action_still_refuses(self):
        policy = budget(TENANT_A)
        self.spend(policy, 600)
        self.assertFalse(call(self.endpoint_a, 'm14-block').allowed)

    def test_the_seeded_soft_budget_alerts_when_exceeded_and_at_threshold(self):
        call_command('seed_integration_policies', '--tenant', TENANT_A, '--source', 'workbench',
                     stdout=io.StringIO())
        policy = Policy.objects.get(tenant_id=TENANT_A, policy_type='budget_limit')
        self.assertEqual((policy.config['hard_limit'], policy.action), (False, 'alert'))
        for spent, expected in ((Decimal('900'), 'exceeded'), (Decimal('420'), 'Approaching')):
            with self.subTest(spent=spent):
                Notification.objects.all().delete()
                BudgetAccount.objects.filter(policy_id_ext=policy.pk).delete()
                self.spend(policy, spent)
                for mode in ('audit', 'enforce'):
                    Policy.objects.filter(pk=policy.pk).update(enforcement=mode)
                    cache.clear()
                    result = PolicyEngine().evaluate(self.endpoint_a, 'tool_call', None, {'tool_name': 'ls'})
                    entry = next(e for e in result.policies_evaluated if e['type'] == 'budget_limit')
                    self.assertTrue(result.allowed)
                    self.assertEqual((entry['result'], entry['action']), ('fail', 'alert'))
                    self.assertIn(expected, entry['message'])
                self.assertEqual(Notification.objects.filter(
                    tenant_id=TENANT_A, subject='Policy alert: Monthly budget').count(), 1)

    def test_a_soft_budget_under_its_threshold_is_quiet(self):
        policy = budget(TENANT_A, hard_limit=False, action='alert')
        self.spend(policy, 100)
        result = call(self.endpoint_a, 'quiet')
        self.assertTrue(result.allowed)
        self.assertEqual(self.alerts().count(), 0)

    def test_a_soft_budget_with_the_block_action_alerts_and_never_refuses(self):
        policy = budget(TENANT_A, hard_limit=False)
        self.spend(policy, 600)
        result = call(self.endpoint_a, 'soft-block')
        self.assertTrue(result.allowed, result.reason)
        self.assertEqual(result.enforcement['action'], 'alert')

    def test_unpriced_calls_are_named_not_counted_as_free(self):
        budget(TENANT_A, hard_limit=False)
        InteractionLog.objects.create(tenant_id=TENANT_A, endpoint=self.endpoint_a, ai_model='acme-large',
                                      total_tokens=500, estimated_cost_usd=None, occurred_at=timezone.now())
        result = PolicyEngine().evaluate(self.endpoint_a, 'tool_call', None, {'tool_name': 'ls'})
        self.assertTrue(any('no price' in w for w in result.warnings), result.warnings)


@override_settings(AUTH_MODE='local')
class UsageAlertsTest(TestCase):
    """M5: the alerts read each budget_limit policy the way the evaluator does."""

    QUERY = '{ usageAlerts { severity title currentValue thresholdValue message } }'

    def setUp(self):
        user = get_user_model().objects.create_user(username='viewer', password='test-only-pass')
        assign_role(user, ROLE_VIEWER)
        self.client = APIClient()
        self.client.force_login(user)
        self.endpoint, _ = make_endpoint(PORTAL_TENANT, 'alerts-agent')
        self.other, _ = make_endpoint(TENANT_B, 'alerts-agent')

    def alerts(self):
        response = self.client.post('/gql/zentinelle/', {'query': self.QUERY}, format='json').json()
        self.assertNotIn('errors', response)
        return response['data']['usageAlerts']

    def log(self, endpoint, cost):
        InteractionLog.objects.create(tenant_id=endpoint.tenant_id, endpoint=endpoint, ai_model='gpt-4o',
                                      total_tokens=10, estimated_cost_usd=cost, occurred_at=timezone.now())

    def test_a_budget_over_its_threshold_alerts_with_its_own_tenants_spend(self):
        Policy.objects.create(tenant_id=PORTAL_TENANT, policy_type=Policy.PolicyType.BUDGET_LIMIT, name='Team',
                              config={'monthly_budget_usd': 10, 'alert_threshold_percent': 80})
        Policy.objects.create(tenant_id=TENANT_B, policy_type=Policy.PolicyType.BUDGET_LIMIT, name='Other',
                              config={'monthly_budget_usd': 1})
        self.log(self.endpoint, Decimal('8.50'))
        self.log(self.other, Decimal('500'))

        alerts = self.alerts()

        self.assertEqual(len(alerts), 1)
        self.assertEqual((alerts[0]['severity'], alerts[0]['currentValue'], alerts[0]['thresholdValue']),
                         ('warning', 8.5, 10.0))

    def test_an_endpoint_scoped_budget_counts_only_its_endpoint(self):
        second, _ = make_endpoint(PORTAL_TENANT, 'second-agent')
        Policy.objects.create(tenant_id=PORTAL_TENANT, policy_type=Policy.PolicyType.BUDGET_LIMIT, name='Scoped',
                              scope_type=Policy.ScopeType.ENDPOINT, scope_endpoint=self.endpoint,
                              config={'monthly_limit_usd': 10})
        self.log(second, Decimal('50'))
        self.assertEqual(self.alerts(), [])
        self.log(self.endpoint, Decimal('11'))
        self.assertEqual([a['severity'] for a in self.alerts()], ['critical'])


class HumanOversightCostTest(TwoTenantMixin, TestCase):
    """H19: the seeded human_oversight policy matches on a real cost, not on every call."""

    def setUp(self):
        super().setUp()
        cache.clear()
        call_command('seed_integration_policies', '--tenant', TENANT_A, '--source', 'workbench',
                     stdout=io.StringIO())
        Policy.objects.filter(tenant_id=TENANT_A).exclude(policy_type='human_oversight').delete()

    def oversight(self, action, context):
        result = PolicyEngine().evaluate(self.endpoint_a, action, None, context)
        return next(e for e in result.policies_evaluated if e['type'] == 'human_oversight')

    def test_a_tool_call_with_no_model_cost_does_not_match(self):
        self.assertEqual(self.oversight('tool_call', {'tool_name': 'ls'})['result'], 'pass')
        self.assertFalse(Notification.objects.filter(tenant_id=TENANT_A).exists())

    def test_a_bounded_priced_model_call_is_priced_by_the_server(self):
        entry = self.oversight('llm:invoke', {'input_text': 'hi', 'model': 'gpt-4o', 'max_output_tokens': 100})
        self.assertEqual(entry['result'], 'pass')
        expensive = self.oversight('llm:invoke', {'input_text': 'hi', 'model': 'o1-pro',
                                                  'max_output_tokens': 100_000})
        self.assertEqual(expensive['result'], 'fail')
        self.assertIn('high_cost', expensive['message'])

    def test_a_caller_cannot_lower_the_cost(self):
        for context in ({'input_text': 'hi', 'model': 'acme-large', 'max_output_tokens': 10},
                        {'input_text': 'hi', 'model': 'gpt-4o'}):
            with self.subTest(context=context):
                entry = self.oversight('llm:invoke', {**context, 'estimated_cost_usd': 0})
                self.assertEqual(entry['result'], 'fail')
                self.assertIn('unknown cost', entry['message'])
        entry = self.oversight('llm:invoke', {'input_text': 'hi', 'model': 'o1-pro', 'max_output_tokens': 100_000,
                                              'estimated_cost_usd': '0.01'})
        self.assertIn('high_cost', entry['message'])

    def test_a_caller_can_declare_a_high_cost(self):
        entry = self.oversight('tool_call', {'tool_name': 'render', 'estimated_cost_usd': 5})
        self.assertEqual(entry['result'], 'fail')
