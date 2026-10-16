"""Event pipeline on a real database: ingest, alerting, heartbeats, the DLQ.

Audit H12 (bulk ingest skipped the ClickHouse stream and the policy-violation
webhook), H13 (alert events notified nobody), M8 (event store and DLQ crashed
on removed fields), M9 (a delayed heartbeat marked a dead agent healthy), L4
(managed-only imports on standalone paths) and L5 (the health check always
counted 0). Only the network edges are patched: Temporal starts, the
ClickHouse insert and the webhook POST.
"""
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from zentinelle.models import (AgentEndpoint, AuditLog, Event,
                               NotificationConfig)
from zentinelle.services.event_store import (audit_projection,
                                             dead_letter_queue, event_store)
from zentinelle.tasks.clickhouse_sync import (stream_audit_log_to_clickhouse,
                                              stream_batch_to_clickhouse)
from zentinelle.tasks.events import (process_dead_letter_queue,
                                     process_event_batch)
from zentinelle.tasks.scheduled import (check_endpoint_health,
                                        sync_deployment_health)
from zentinelle.tests._two_tenants import TENANT_A, TENANT_B, TwoTenantMixin

URL = '/api/zentinelle/v1/events'


def _event(endpoint, event_type, category=Event.Category.ALERT, **fields):
    fields.setdefault('occurred_at', timezone.now())
    return Event.objects.create(
        tenant_id=endpoint.tenant_id, endpoint=endpoint, event_type=event_type,
        event_category=category, status=Event.Status.PENDING, **fields)


def _ingest(client, events):
    now = timezone.now().isoformat()
    return client.post(URL, {'events': [
        {'timestamp': now, 'payload': {}, **e} for e in events]}, format='json')


@patch('zentinelle.api.views.events.start_task')
@patch('zentinelle.signals.start_task')
@patch('zentinelle.services.clickhouse_service.is_configured', return_value=True)
class IngestStreamTest(TwoTenantMixin, TestCase):
    """H12: every stored event reaches the ClickHouse stream once."""

    def test_bulk_ingested_events_are_streamed(self, _configured, signal_start, view_start):
        response = _ingest(self.client_a, [{'type': 'llm:usage'}, {'type': 'policy_violation'}])

        self.assertEqual(response.status_code, 202)
        stored = {str(i) for i in Event.objects.filter(tenant_id=TENANT_A).values_list('id', flat=True)}
        streams = [c for c in view_start.call_args_list if c.args[0] is stream_batch_to_clickhouse]
        self.assertEqual(len(streams), 1)
        self.assertEqual(set(streams[0].kwargs['event_ids']), stored)
        self.assertFalse(streams[0].kwargs['wait'])
        signal_start.assert_not_called()

    def test_idempotent_events_are_streamed_by_the_signal_only(self, _configured, signal_start, view_start):
        _ingest(self.client_a, [{'type': 'policy_violation', 'event_id': 'pv-1'}])

        self.assertEqual(signal_start.call_count, 1)
        self.assertFalse([c for c in view_start.call_args_list if c.args[0] is stream_batch_to_clickhouse])


@patch('zentinelle.services.clickhouse_service.insert_audit_events', return_value=1)
@patch('zentinelle.services.clickhouse_service.is_enabled', return_value=True)
class ClickHouseRowTest(TwoTenantMixin, TestCase):
    """The stream's rows are built from fields that still exist."""

    def test_event_rows_carry_their_tenant(self, _enabled, insert):
        a = _event(self.endpoint_a, 'heartbeat', Event.Category.TELEMETRY)
        b = _event(self.endpoint_b, 'heartbeat', Event.Category.TELEMETRY)

        stream_batch_to_clickhouse(event_ids=[str(a.id), str(b.id)])

        rows = {r['event_id']: r for r in insert.call_args.args[0]}
        self.assertEqual(rows[str(a.id)]['organization_id'], TENANT_A)
        self.assertEqual(rows[str(b.id)]['organization_id'], TENANT_B)
        self.assertEqual(rows[str(a.id)]['tenant_id'], TENANT_A)
        self.assertEqual(rows[str(a.id)]['agent_id'], self.agent_id)

    def test_audit_log_rows_carry_their_tenant(self, _enabled, insert):
        log = AuditLog.log(tenant_id=TENANT_A, action=AuditLog.Action.UPDATE,
                           resource_type='policy', resource_id='p1', ext_user_id='u-1')

        stream_audit_log_to_clickhouse(str(log.id))

        row = insert.call_args.args[0][0]
        self.assertEqual((row['organization_id'], row['tenant_id'], row['user_id']),
                         (TENANT_A, TENANT_A, 'u-1'))


@patch('zentinelle.services.webhook_dispatcher.httpx.post')
class AlertDrainTest(TwoTenantMixin, TestCase):
    """H13: alert events reach the tenant's configured channels, once."""

    def setUp(self):
        super().setUp()
        for tenant in (TENANT_A, TENANT_B):
            NotificationConfig.objects.create(
                tenant_id=tenant, channel=NotificationConfig.Channel.WEBHOOK,
                config={'url': f'https://hooks.example/{tenant}'}, trigger_severities=[])

    def _posts(self, post):
        import json
        return [(c.args[0], json.loads(c.kwargs['content'])) for c in post.call_args_list]

    def test_each_alert_type_is_sent_to_its_tenant_only(self, post):
        for event_type, severity in (('policy_violation', 'high'), ('budget_exceeded', 'high'),
                                     ('endpoint_unhealthy', 'medium')):
            post.reset_mock()
            event = _event(self.endpoint_a, event_type, payload={'reason': 'r'})

            process_event_batch([str(event.id)], 'alert')

            event.refresh_from_db()
            self.assertEqual(event.status, Event.Status.PROCESSED)
            posts = self._posts(post)
            self.assertEqual([url for url, _ in posts], [f'https://hooks.example/{TENANT_A}'], event_type)
            body = posts[0][1]
            self.assertEqual((body['event_type'], body['severity'], body['tenant_id']),
                             (event_type, severity, TENANT_A))
            self.assertEqual(body['data']['event_id'], str(event.id))
            self.assertEqual(body['data']['agent_id'], self.agent_id)

    def test_a_violation_ingested_over_rest_notifies_exactly_once(self, post):
        with patch('zentinelle.api.views.events.start_task'):
            _ingest(self.client_a, [{'type': 'policy_violation', 'category': 'alert'},
                                    {'type': 'policy_violation', 'category': 'alert', 'event_id': 'pv-2'}])
        # Storing an event sends nothing; the drain is the one sender.
        post.assert_not_called()

        ids = [str(i) for i in Event.objects.filter(tenant_id=TENANT_A).values_list('id', flat=True)]
        process_event_batch(ids, 'alert')

        self.assertEqual(post.call_count, 2)

    def test_a_dispatch_failure_fails_the_event_for_retry(self, post):
        event = _event(self.endpoint_a, 'policy_violation')

        with patch('zentinelle.services.webhook_dispatcher.NotificationConfig.objects.filter',
                   side_effect=RuntimeError('db down')):
            with self.assertRaises(RuntimeError):
                process_event_batch([str(event.id)], 'alert')

        event.refresh_from_db()
        self.assertEqual(event.status, Event.Status.FAILED)

    def test_the_health_check_queues_its_alert_and_counts_it(self, post):
        stale = timezone.now() - timedelta(minutes=20)
        AgentEndpoint.objects.filter(pk=self.endpoint_a.pk).update(
            health=AgentEndpoint.Health.HEALTHY, last_heartbeat=stale)

        with patch('zentinelle.tasks.scheduled.start_task') as start:
            result = check_endpoint_health()

        self.assertEqual(result, {'unhealthy_count': 1, 'recovered_count': 0})
        event = Event.objects.get(tenant_id=TENANT_A, event_type='endpoint_unhealthy')
        start.assert_called_once()
        self.assertIs(start.call_args.args[0], process_event_batch)
        self.assertEqual(start.call_args.args[1], [str(event.id)])

        process_event_batch(*start.call_args.args[1:])
        self.assertEqual([url for url, _ in self._posts(post)], [f'https://hooks.example/{TENANT_A}'])


class HealthCheckCountTest(TwoTenantMixin, TestCase):
    """L5: the health check reports what it changed."""

    def test_recovered_endpoints_are_counted(self):
        AgentEndpoint.objects.filter(pk=self.endpoint_a.pk).update(
            health=AgentEndpoint.Health.UNHEALTHY, last_heartbeat=timezone.now())

        with patch('zentinelle.tasks.scheduled.start_task'):
            result = check_endpoint_health()

        self.assertEqual(result, {'unhealthy_count': 0, 'recovered_count': 1})


class HeartbeatDrainTest(TwoTenantMixin, TestCase):
    """M9: a heartbeat counts as of when it was sent."""

    def _beat(self, occurred_at, status='healthy'):
        event = _event(self.endpoint_a, 'heartbeat', Event.Category.TELEMETRY,
                       occurred_at=occurred_at, payload={'status': status})
        process_event_batch([str(event.id)], 'telemetry')
        self.endpoint_a.refresh_from_db()

    def _set(self, health, last_heartbeat):
        AgentEndpoint.objects.filter(pk=self.endpoint_a.pk).update(health=health, last_heartbeat=last_heartbeat)

    def test_a_delayed_heartbeat_does_not_revive_a_dead_agent(self):
        now = timezone.now()
        self._set(AgentEndpoint.Health.UNHEALTHY, now - timedelta(minutes=20))

        self._beat(now - timedelta(minutes=10))

        self.assertEqual(self.endpoint_a.health, AgentEndpoint.Health.UNHEALTHY)
        self.assertEqual(self.endpoint_a.last_heartbeat, now - timedelta(minutes=10))

    def test_an_older_heartbeat_than_the_one_on_record_changes_nothing(self):
        now = timezone.now()
        self._set(AgentEndpoint.Health.DEGRADED, now - timedelta(minutes=1))

        self._beat(now - timedelta(minutes=3))

        self.assertEqual(self.endpoint_a.health, AgentEndpoint.Health.DEGRADED)
        self.assertEqual(self.endpoint_a.last_heartbeat, now - timedelta(minutes=1))

    def test_a_future_timestamp_counts_as_its_arrival(self):
        self._set(AgentEndpoint.Health.UNKNOWN, None)

        self._beat(timezone.now() + timedelta(days=1))

        self.assertLessEqual(self.endpoint_a.last_heartbeat, timezone.now())

    def test_a_fresh_heartbeat_sets_health(self):
        self._set(AgentEndpoint.Health.UNHEALTHY, timezone.now() - timedelta(minutes=20))

        self._beat(timezone.now())

        self.assertEqual(self.endpoint_a.health, AgentEndpoint.Health.HEALTHY)


class EventStoreTest(TwoTenantMixin, TestCase):
    """M8: the event store, DLQ and audit projection work on tenant_id."""

    def _dead(self, endpoint):
        event = _event(endpoint, 'spawn', Event.Category.AUDIT)
        event.retry_count = dead_letter_queue.MAX_RETRIES
        dead_letter_queue.move_to_dlq(event, 'boom')
        return event

    def test_dlq_keeps_the_original_status(self):
        event = _event(self.endpoint_a, 'spawn', Event.Category.AUDIT)
        Event.objects.filter(pk=event.pk).update(status=Event.Status.PROCESSING)
        event.refresh_from_db()

        dead_letter_queue.move_to_dlq(event, 'projection unavailable')

        event.refresh_from_db()
        self.assertEqual(event.status, Event.Status.FAILED)
        self.assertEqual(event.payload['dlq']['original_status'], Event.Status.PROCESSING)
        self.assertEqual(event.payload['dlq']['reason'], 'projection unavailable')

    def test_dlq_listing_is_per_tenant(self):
        a, b = self._dead(self.endpoint_a), self._dead(self.endpoint_b)

        self.assertEqual([e.id for e in dead_letter_queue.get_dlq_events(TENANT_A)], [a.id])
        self.assertEqual([e.id for e in dead_letter_queue.get_dlq_events(TENANT_B)], [b.id])

    @patch('zentinelle.services.event_store.start_task')
    def test_dlq_reprocessing_touches_only_its_tenant(self, start):
        a, b = self._dead(self.endpoint_a), self._dead(self.endpoint_b)

        process_dead_letter_queue(TENANT_A)

        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual((a.status, a.retry_count), (Event.Status.PENDING, 0))
        self.assertEqual(b.status, Event.Status.FAILED)
        self.assertEqual(start.call_args.args[1], [str(a.id)])

    @patch('zentinelle.services.event_store.start_task')
    def test_append_replay_and_the_audit_projection(self, _start):
        envelope = event_store.append('config_change', 'audit', 'p1', 'policy',
                                      {'resource_name': 'Policy one'},
                                      organization=TENANT_A, endpoint=self.endpoint_a)
        event_store.append('config_change', 'audit', 'p2', 'policy', {}, organization=TENANT_B)

        stored = Event.objects.get(correlation_id=envelope.correlation_id)
        self.assertEqual(stored.tenant_id, TENANT_A)

        seen = []
        self.assertEqual(event_store.replay(TENANT_A, handler=seen.append), 1)
        self.assertEqual([e.aggregate_id for e in seen], ['p1'])

        audit_projection.handle_event(envelope)
        log = AuditLog.objects.get(resource_id='p1')
        self.assertEqual((log.tenant_id, log.action, log.resource_name),
                         (TENANT_A, AuditLog.Action.UPDATE, 'Policy one'))

    def test_create_from_agent(self):
        event = Event.create_from_agent(TENANT_A, self.endpoint_a, 'spawn', 'audit', {}, timezone.now())

        self.assertEqual(event.tenant_id, TENANT_A)


class StandaloneManagedTaskTest(TestCase):
    """L4: a managed-only task skips cleanly where its modules are absent."""

    def test_deployment_health_sync_skips_in_standalone(self):
        self.assertIsNone(sync_deployment_health())
