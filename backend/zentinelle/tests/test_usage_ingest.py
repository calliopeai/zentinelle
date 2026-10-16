"""Canonical usage ingest: every producer's usage reaches the meter, once.

Before this, the gateway's `llm:usage` and the SDK's `model_usage` and
`model_request` were marked processed and recorded nothing; `ai_request`
crashed on a removed field and the error was swallowed; an agent could post a
negative cost and erase its month's spend; SDK `log_interaction` was stored
with null tokens; Anthropic cache tokens were never written; and one gateway
call made three InteractionLog rows.
"""
import builtins
import sys
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from zentinelle.models import Event, Policy
from zentinelle.models.compliance import InteractionLog
from zentinelle.models.usage import UsageMetric
from zentinelle.services.usage_ingest import (USAGE_EVENT_TYPES, InvalidUsage,
                                              normalize_tokens)
from zentinelle.services.usage_tracking import UsageTrackingService
from zentinelle.tasks.events import process_event_batch
from zentinelle.tests._two_tenants import TENANT_A, TwoTenantMixin

M = UsageMetric.MetricType

# What each producer actually sends for one call.
GATEWAY = ('llm:usage', {'provider': 'openai', 'model': 'gpt-4o', 'prompt_tokens': 1000,
                         'completion_tokens': 200, 'total_tokens': 1200, 'latency_ms': 840,
                         'request_id': 'gw-1', 'source': 'gateway'})
SDK_TRACK_USAGE = ('model_usage', {'provider': 'openai', 'model': 'gpt-4o', 'input_tokens': 1000,
                                   'output_tokens': 200, 'estimated_cost': 0.0045})
SDK_MODEL_REQUEST = ('model_request', {'provider': 'openai', 'model': 'gpt-4o', 'input_tokens': 1000,
                                       'output_tokens': 200, 'duration_ms': 40})
AI_REQUEST = ('ai_request', {'provider': 'openai', 'model': 'gpt-4o', 'input_tokens': 1000,
                             'output_tokens': 200, 'request_id': 'req-1'})


def metrics(tenant_id):
    return {row.metric_type: row.value for row in UsageMetric.objects.filter(tenant_id=tenant_id)}


class NormalizeTokensTest(TestCase):
    def test_every_producer_spelling_reads_the_same(self):
        for payload in (GATEWAY[1], SDK_TRACK_USAGE[1],
                        {'input_token_count': 1000, 'output_token_count': 200},
                        {'promptTokenCount': 1000, 'candidatesTokenCount': 200}):
            with self.subTest(payload=payload):
                self.assertEqual(normalize_tokens(payload), {
                    'input_tokens': 1000, 'output_tokens': 200,
                    'cache_read_tokens': 0, 'cache_write_tokens': 0})

    def test_anthropic_cache_counts_sit_beside_the_input_count(self):
        self.assertEqual(normalize_tokens({
            'input_tokens': 12, 'output_tokens': 50,
            'cache_read_input_tokens': 90000, 'cache_creation_input_tokens': 2048,
        }), {'input_tokens': 12, 'output_tokens': 50,
             'cache_read_tokens': 90000, 'cache_write_tokens': 2048})

    def test_openai_and_gemini_cached_counts_are_split_out_of_the_prompt(self):
        for payload in (
            {'prompt_tokens': 1000, 'completion_tokens': 5, 'prompt_tokens_details': {'cached_tokens': 800}},
            {'input_tokens': 1000, 'output_tokens': 5, 'input_tokens_details': {'cached_tokens': 800}},
            {'promptTokenCount': 1000, 'candidatesTokenCount': 5, 'cachedContentTokenCount': 800},
        ):
            with self.subTest(payload=payload):
                self.assertEqual(normalize_tokens(payload), {
                    'input_tokens': 200, 'output_tokens': 5,
                    'cache_read_tokens': 800, 'cache_write_tokens': 0})

    def test_bad_counts_are_refused_not_coerced(self):
        for value in (-1, 1.5, True, '100', float('nan'), 10 ** 12):
            with self.subTest(value=value), self.assertRaises(InvalidUsage):
                normalize_tokens({'input_tokens': value})


class UsageEventDrainTest(TwoTenantMixin, TestCase):
    def _event(self, event_type, payload, endpoint=None):
        endpoint = endpoint or self.endpoint_a
        return Event.objects.create(
            tenant_id=endpoint.tenant_id, endpoint=endpoint, event_type=event_type,
            event_category=Event.Category.TELEMETRY, payload=dict(payload),
            occurred_at=timezone.now(), status=Event.Status.PENDING)

    def _drain(self, *events):
        process_event_batch([str(event.id) for event in events], 'telemetry')

    def test_every_producers_usage_event_is_metered(self):
        self.assertEqual(USAGE_EVENT_TYPES, {'llm:usage', 'model_usage', 'model_request', 'ai_request'})
        for event_type, payload in (GATEWAY, SDK_TRACK_USAGE, SDK_MODEL_REQUEST, AI_REQUEST):
            with self.subTest(event_type=event_type):
                UsageMetric.objects.all().delete()
                event = self._event(event_type, payload)

                self._drain(event)

                event.refresh_from_db()
                self.assertEqual(event.status, Event.Status.PROCESSED, event.error_message)
                self.assertEqual(metrics(TENANT_A), {
                    M.AI_INPUT_TOKENS: 1000, M.AI_OUTPUT_TOKENS: 200,
                    M.AI_TOTAL_TOKENS: 1200, M.AI_REQUESTS: 1})

    def test_the_standalone_drain_never_imports_stripe(self):
        real_import = builtins.__import__

        def no_stripe(name, *args, **kwargs):
            if name == 'stripe' or name.startswith('stripe.'):
                raise ModuleNotFoundError("No module named 'stripe'")
            return real_import(name, *args, **kwargs)

        events = [self._event(*AI_REQUEST), self._event('spawn', {'duration_hours': 2}),
                  self._event('stop', {'duration_hours': 2})]
        with patch.dict(sys.modules, {'stripe': None}), patch('builtins.__import__', no_stripe):
            self._drain(*events)

        for event in events:
            event.refresh_from_db()
            self.assertEqual(event.status, Event.Status.PROCESSED, event.error_message)
            # The per-event Stripe path is gone; the aggregate path bills.
            self.assertEqual(event.lago_event_id, '')
        self.assertEqual(metrics(TENANT_A)[M.AI_REQUESTS], 1)

    def test_a_recording_failure_fails_the_event_instead_of_being_swallowed(self):
        event = self._event(*AI_REQUEST)
        with patch.object(UsageTrackingService, 'record_usage', side_effect=RuntimeError('db down')):
            with self.assertRaises(RuntimeError):
                self._drain(event)

        event.refresh_from_db()
        self.assertEqual(event.status, Event.Status.FAILED)
        self.assertEqual(event.retry_count, 1)

    def test_a_retried_event_is_metered_once(self):
        event = self._event(*GATEWAY)
        self._drain(event)
        Event.objects.filter(id=event.id).update(status=Event.Status.PENDING)

        self._drain(event)

        self.assertEqual(metrics(TENANT_A)[M.AI_INPUT_TOKENS], 1000)
        self.assertEqual(UsageMetric.objects.filter(tenant_id=TENANT_A).count(), 4)

    def test_one_request_id_reported_twice_is_metered_once(self):
        first, second = self._event(*GATEWAY), self._event(*GATEWAY)

        self._drain(first, second)

        self.assertEqual(UsageMetric.objects.filter(tenant_id=TENANT_A, metric_type=M.AI_REQUESTS).count(), 1)

    def test_a_low_report_first_cannot_erase_the_real_usage(self):
        # The gateway's X-Request-ID reaches the agent with the first streamed
        # byte, and its usage is reported only after the stream ends. The agent
        # can report the same request_id first, with its own key; the meter
        # must still end at the real count.
        zero = {**GATEWAY[1], 'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
        self._drain(self._event('llm:usage', zero))
        self._drain(self._event(*GATEWAY))
        self._drain(self._event(*GATEWAY))

        self.assertEqual(self._sums(TENANT_A), {
            M.AI_INPUT_TOKENS: 1000, M.AI_OUTPUT_TOKENS: 200,
            M.AI_TOTAL_TOKENS: 1200, M.AI_REQUESTS: 1})

    def _sums(self, tenant_id):
        from django.db.models import Sum
        return {row['metric_type']: row['total'] for row in UsageMetric.objects.filter(
            tenant_id=tenant_id).values('metric_type').annotate(total=Sum('value'))}

    def test_events_without_a_request_id_are_separate_calls(self):
        self._drain(self._event(*SDK_TRACK_USAGE), self._event(*SDK_TRACK_USAGE))

        self.assertEqual(metrics(TENANT_A)[M.AI_REQUESTS], 1)
        self.assertEqual(UsageMetric.objects.filter(tenant_id=TENANT_A, metric_type=M.AI_REQUESTS).count(), 2)

    def test_the_same_request_id_in_another_tenant_is_its_own_call(self):
        self._drain(self._event(*GATEWAY), self._event(*GATEWAY, endpoint=self.endpoint_b))

        self.assertEqual(UsageMetric.objects.filter(metric_type=M.AI_REQUESTS).count(), 2)
        self.assertEqual(metrics(self.endpoint_b.tenant_id)[M.AI_INPUT_TOKENS], 1000)

    def test_negative_usage_goes_straight_to_the_dlq_and_meters_nothing(self):
        event = self._event('llm:usage', {**GATEWAY[1], 'prompt_tokens': -5000})

        self._drain(event)

        event.refresh_from_db()
        self.assertEqual(event.status, Event.Status.FAILED)
        self.assertEqual(event.retry_count, 5)
        self.assertIn('dlq', event.payload)
        self.assertFalse(UsageMetric.objects.exists())

    def test_cache_tokens_are_written_and_exported(self):
        from zentinelle.services import billing_export
        self._drain(self._event('llm:usage', {
            'provider': 'anthropic', 'model': 'claude-sonnet-4', 'request_id': 'gw-cache',
            'input_tokens': 12, 'output_tokens': 50,
            'cache_read_input_tokens': 90000, 'cache_creation_input_tokens': 2048}))

        self.assertEqual(metrics(TENANT_A), {
            M.AI_INPUT_TOKENS: 12, M.AI_OUTPUT_TOKENS: 50, M.AI_TOTAL_TOKENS: 62,
            M.AI_CACHE_READ_TOKENS: 90000, M.AI_CACHE_WRITE_TOKENS: 2048, M.AI_REQUESTS: 1})
        [row], _ = billing_export.collect_pending()
        self.assertEqual((row['input_tokens'], row['cache_read_tokens'], row['cache_write_tokens']),
                         (12, 90000, 2048))

    def test_usage_gives_the_calls_interaction_row_its_tokens_and_cost(self):
        row = InteractionLog.objects.create(
            tenant_id=TENANT_A, endpoint=self.endpoint_a, request_id='gw-1', user_identifier='',
            interaction_type='chat', occurred_at=timezone.now())
        other = InteractionLog.objects.create(
            tenant_id=self.endpoint_b.tenant_id, endpoint=self.endpoint_b, request_id='gw-1',
            user_identifier='', interaction_type='chat', occurred_at=timezone.now())

        self._drain(self._event(*GATEWAY))

        row.refresh_from_db()
        other.refresh_from_db()
        cost = sum(UsageTrackingService.calculate_cost('gpt-4o', 1000, 200))
        self.assertEqual((row.input_token_count, row.output_token_count, row.total_tokens), (1000, 200, 1200))
        self.assertEqual(row.estimated_cost_usd, cost.quantize(Decimal('0.000001')))
        self.assertIsNone(other.total_tokens)


class StrandedEventTest(TestCase):
    def _stranded(self, retry_count=0):
        event = Event.objects.create(event_type='heartbeat', event_category=Event.Category.TELEMETRY,
                                     status=Event.Status.PROCESSING, occurred_at=timezone.now(),
                                     retry_count=retry_count)
        Event.objects.filter(id=event.id).update(received_at=timezone.now() - timedelta(hours=1))
        return event

    @patch('zentinelle.tasks.scheduled.start_task')
    def test_an_event_stranded_in_processing_is_retried(self, start):
        from zentinelle.tasks.scheduled import retry_failed_events
        event = self._stranded()

        self.assertEqual(retry_failed_events(), {'retried': 1})

        event.refresh_from_db()
        self.assertEqual((event.status, event.retry_count), (Event.Status.PENDING, 1))
        self.assertEqual(start.call_args.args[1], [str(event.id)])

    @patch('zentinelle.tasks.scheduled.start_task')
    def test_an_event_stranded_out_of_retries_is_dead_lettered(self, start):
        from zentinelle.tasks.scheduled import retry_failed_events
        event = self._stranded(retry_count=4)

        self.assertEqual(retry_failed_events(), {'retried': 0})

        event.refresh_from_db()
        self.assertEqual((event.status, event.retry_count), (Event.Status.FAILED, 5))
        self.assertIn('dlq', event.payload)
        start.assert_not_called()

    @patch('zentinelle.tasks.scheduled.start_task')
    def test_a_recent_processing_event_is_left_alone(self, start):
        from zentinelle.tasks.scheduled import retry_failed_events
        event = Event.objects.create(event_type='heartbeat', event_category=Event.Category.TELEMETRY,
                                     status=Event.Status.PROCESSING, occurred_at=timezone.now())

        retry_failed_events()

        event.refresh_from_db()
        self.assertEqual(event.status, Event.Status.PROCESSING)


class InteractionEndpointTest(TwoTenantMixin, TestCase):
    url = reverse('zentinelle:interaction')

    def _post(self, body, client=None):
        return (client or self.client_a).post(self.url, body, format='json')

    def test_the_sdk_log_interaction_payload_is_stored(self):
        # Exactly what the Python, TypeScript and Go SDKs send.
        response = self._post({
            'agent_id': self.endpoint_a.agent_id, 'prompt': 'hello', 'response': 'world',
            'model': 'gpt-4o', 'provider': 'openai', 'input_tokens': 1000, 'output_tokens': 500,
            'cost_usd': 0.0075, 'metadata': {'user_id': 'alice', 'session_id': 's-1'}})

        self.assertEqual(response.status_code, 201, response.content)
        row = InteractionLog.objects.get(id=response.json()['interaction_id'])
        self.assertEqual((row.ai_model, row.ai_provider, row.input_token_count, row.output_token_count,
                          row.total_tokens, row.user_identifier, row.session_id),
                         ('gpt-4o', 'openai', 1000, 500, 1500, 'alice', 's-1'))

    def test_a_negative_cost_cannot_erase_spend(self):
        from zentinelle.services.budgets import historical_spend
        policy = Policy.objects.create(tenant_id=TENANT_A, name='b', policy_type=Policy.PolicyType.BUDGET_LIMIT,
                                       config={'monthly_budget_usd': 10, 'hard_limit': False})
        self._post({'ai_model': 'unpriced-model', 'estimated_cost_usd': 9.5})
        before = historical_spend(policy)

        for body in ({'ai_model': 'unpriced-model', 'estimated_cost_usd': -9.5},
                     {'ai_model': 'unpriced-model', 'cost_usd': '-9.5'},
                     {'ai_model': 'unpriced-model', 'estimated_cost_usd': 1e12},
                     {'ai_model': 'gpt-4o', 'input_token_count': -1000000}):
            with self.subTest(body=body):
                self.assertEqual(self._post(body).status_code, 400)

        self.assertEqual(before, Decimal('9.5'))
        self.assertEqual(historical_spend(policy), before)

    def test_cost_is_computed_server_side_for_a_priced_model(self):
        response = self._post({'request_id': 'r-1', 'ai_provider': 'openai', 'ai_model': 'gpt-4o',
                               'input_token_count': 1000, 'output_token_count': 200, 'estimated_cost_usd': 0})

        row = InteractionLog.objects.get(id=response.json()['interaction_id'])
        cost = sum(UsageTrackingService.calculate_cost('gpt-4o', 1000, 200))
        self.assertGreater(cost, 0)
        self.assertEqual(row.estimated_cost_usd, cost.quantize(Decimal('0.000001')))

    @override_settings(CONTENT_CAPTURE_MODE='full')
    def test_one_gateway_call_is_one_interaction_row(self):
        # The gateway's sequence for one proxied call (gateway/policy.go,
        # usage.go, interaction.go), plus its usage event through the drain.
        body = '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'
        evaluate = reverse('zentinelle:evaluate')
        self.client_a.post(evaluate, {'action': 'llm:invoke', 'context': {
            'provider': 'openai', 'model': 'gpt-4o', 'input_text': body, 'request_body': body,
            'request_id': 'gw-1'}}, format='json')
        self.client_a.post(evaluate, {'action': 'llm:response', 'context': {
            'provider': 'openai', 'model': 'gpt-4o', 'output_text': 'hello'}}, format='json')
        event = Event.objects.create(tenant_id=TENANT_A, endpoint=self.endpoint_a, event_type=GATEWAY[0],
                                     payload=dict(GATEWAY[1]), occurred_at=timezone.now())
        process_event_batch([str(event.id)], 'telemetry')
        self._post({'request_id': 'gw-1', 'ai_provider': 'openai', 'ai_model': 'gpt-4o',
                    'input_content': body, 'output_content': 'hello',
                    'input_token_count': 1000, 'output_token_count': 200, 'interaction_type': 'chat'})

        [row] = InteractionLog.objects.filter(tenant_id=TENANT_A)
        cost = sum(UsageTrackingService.calculate_cost('gpt-4o', 1000, 200))
        self.assertEqual((row.request_id, row.total_tokens), ('gw-1', 1200))
        self.assertEqual((row.input_content, row.output_content), (body, 'hello'))
        self.assertEqual(row.estimated_cost_usd, cost.quantize(Decimal('0.000001')))

    def test_a_repeat_post_cannot_lower_what_was_recorded(self):
        first = self._post({'request_id': 'r-1', 'ai_model': 'gpt-4o', 'input_token_count': 1000,
                            'output_token_count': 200})
        again = self._post({'request_id': 'r-1', 'ai_model': 'gpt-4o', 'input_token_count': 1,
                            'output_token_count': 1, 'estimated_cost_usd': 0})

        self.assertEqual(first.json()['interaction_id'], again.json()['interaction_id'])
        row = InteractionLog.objects.get(id=first.json()['interaction_id'])
        self.assertEqual(row.total_tokens, 1200)

    def test_a_zero_interaction_first_cannot_hide_the_gateways_cost(self):
        from zentinelle.services.budgets import historical_spend
        policy = Policy.objects.create(tenant_id=TENANT_A, name='b', policy_type=Policy.PolicyType.BUDGET_LIMIT,
                                       config={'monthly_budget_usd': 10, 'hard_limit': False})
        self.client_a.post(reverse('zentinelle:evaluate'), {'action': 'llm:invoke', 'context': {
            'provider': 'openai', 'model': 'gpt-4o', 'input_text': 'hi', 'request_id': 'gw-1'}}, format='json')
        # The agent reads X-Request-ID off the stream and logs the call as free.
        self._post({'request_id': 'gw-1', 'ai_model': 'gpt-4o', 'input_token_count': 0,
                    'output_token_count': 0})
        event = Event.objects.create(tenant_id=TENANT_A, endpoint=self.endpoint_a, event_type=GATEWAY[0],
                                     payload=dict(GATEWAY[1]), occurred_at=timezone.now())
        process_event_batch([str(event.id)], 'telemetry')

        [row] = InteractionLog.objects.filter(tenant_id=TENANT_A)
        cost = sum(UsageTrackingService.calculate_cost('gpt-4o', 1000, 200)).quantize(Decimal('0.000001'))
        self.assertEqual((row.total_tokens, row.estimated_cost_usd), (1200, cost))
        self.assertEqual(historical_spend(policy), cost)

    def test_another_tenants_request_id_is_never_merged(self):
        mine = self._post({'request_id': 'r-1', 'ai_model': 'gpt-4o', 'input_token_count': 10})
        theirs = self._post({'request_id': 'r-1', 'ai_model': 'gpt-4o', 'output_token_count': 99,
                             'output_content': 'planted'}, client=self.client_b)

        self.assertNotEqual(mine.json()['interaction_id'], theirs.json()['interaction_id'])
        row = InteractionLog.objects.get(id=mine.json()['interaction_id'])
        self.assertEqual((row.output_token_count, row.output_content), (None, ''))


class ScanCostTest(TwoTenantMixin, TestCase):
    def test_scans_refuse_negative_counts_and_costs(self):
        for name in ('scan', 'scan-async'):
            for body in ({'estimated_cost': -1}, {'token_count': -1}):
                with self.subTest(name=name, body=body):
                    response = self.client_a.post(reverse(f'zentinelle:{name}'),
                                                  {'content': 'hello', **body}, format='json')
                    self.assertEqual(response.status_code, 400)
