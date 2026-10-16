"""The event pipeline under the real three-schema database router.

`conftest.py` turns the router off for the suite, which is how an atomic block
on the wrong alias went unseen (tenancy re-audit T6). Here it is on: Event
lives on `zentinelle`, AuditLog on `analytics`. All aliases mirror one test
database, so this is a TransactionTestCase: each alias is its own connection
and only committed rows are visible across them.
"""
from datetime import timedelta
from unittest.mock import patch

from django.db import connections, router
from django.db.models.signals import post_save
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from zentinelle.models import (AgentEndpoint, AuditLog, Event,
                               NotificationConfig)
from zentinelle.services.event_store import (audit_projection,
                                             dead_letter_queue, event_store)
from zentinelle.tasks.events import process_event_batch
from zentinelle.tests._two_tenants import TENANT_A, TENANT_B, TwoTenantMixin


class RoutedEventPipelineTest(TwoTenantMixin, TransactionTestCase):
    databases = '__all__'

    def setUp(self):
        # Enabled here rather than as a class decorator so it is off again by
        # the time the test case flushes: with the router on, a flush of
        # `default` skips every zentinelle table.
        routed = override_settings(DATABASE_ROUTERS=['zentinelle.db_router.ZentinelleRouter'])
        routed.enable()
        self.addCleanup(routed.disable)
        super().setUp()

    def test_the_router_is_on(self):
        self.assertEqual(router.db_for_write(Event), 'zentinelle')
        self.assertEqual(router.db_for_write(AuditLog), 'analytics')

    @patch('zentinelle.services.event_store.start_task')
    def test_append_writes_inside_a_transaction_on_events_database(self, _start):
        seen = []

        def record(sender, instance, created, **kwargs):
            seen.append(connections[router.db_for_write(Event)].in_atomic_block)

        post_save.connect(record, sender=Event)
        self.addCleanup(post_save.disconnect, record, sender=Event)

        envelope = event_store.append('config_change', 'audit', 'p1', 'policy', {},
                                      organization=TENANT_A, endpoint=self.endpoint_a)

        self.assertEqual(seen, [True])
        audit_projection.handle_event(envelope)
        self.assertEqual(AuditLog.objects.get(resource_id='p1').tenant_id, TENANT_A)

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    @patch('zentinelle.api.views.events.start_task')
    def test_rest_ingest_to_alert(self, _start, post):
        NotificationConfig.objects.create(
            tenant_id=TENANT_A, channel=NotificationConfig.Channel.WEBHOOK,
            config={'url': 'https://hooks.example/a'}, trigger_severities=['high'])

        response = self.client_a.post('/api/zentinelle/v1/events', {'events': [
            {'type': 'policy_violation', 'category': 'alert', 'payload': {},
             'timestamp': timezone.now().isoformat()}]}, format='json')
        self.assertEqual(response.status_code, 202)

        event = Event.objects.get(tenant_id=TENANT_A)
        process_event_batch([str(event.id)], 'alert')

        event.refresh_from_db()
        self.assertEqual(event.status, Event.Status.PROCESSED)
        self.assertEqual([c.args[0] for c in post.call_args_list], ['https://hooks.example/a'])

    def test_dlq_and_heartbeats(self):
        dead = Event.objects.create(tenant_id=TENANT_B, endpoint=self.endpoint_b, event_type='spawn',
                                    occurred_at=timezone.now(), retry_count=dead_letter_queue.MAX_RETRIES)
        dead_letter_queue.move_to_dlq(dead, 'boom')
        self.assertEqual(list(dead_letter_queue.get_dlq_events(TENANT_A)), [])
        self.assertEqual([e.id for e in dead_letter_queue.get_dlq_events(TENANT_B)], [dead.id])

        recorded = timezone.now() - timedelta(minutes=1)
        AgentEndpoint.objects.filter(pk=self.endpoint_a.pk).update(last_heartbeat=recorded)
        self.endpoint_a.update_heartbeat(health='healthy', at=recorded - timedelta(minutes=1))
        self.endpoint_a.refresh_from_db()
        self.assertEqual(self.endpoint_a.last_heartbeat, recorded)
