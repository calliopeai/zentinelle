from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from zentinelle.models import EventDeliveryOutbox
from zentinelle.tasks.events import (apply_event_projections,
                                     dispatch_event_outbox)


class EventOutboxDispatchTests(TestCase):
    @patch('zentinelle.tasks.events.apply_event_projections.apply_async')
    def test_dispatch_claims_due_rows_and_backs_off(self, apply_async):
        row = EventDeliveryOutbox.objects.create(
            tenant_id='tenant-a', event_id='00000000-0000-0000-0000-000000000001',
            envelope={'event_id': 'x'}, next_attempt_at=timezone.now() - timedelta(minutes=1),
        )
        result = dispatch_event_outbox()
        row.refresh_from_db()
        self.assertEqual(result['dispatched'], 1)
        self.assertEqual(row.status, EventDeliveryOutbox.Status.QUEUED)
        self.assertEqual(row.attempts, 1)
        apply_async.assert_called_once()

    @patch('zentinelle.tasks.events.EventEnvelope.from_dict', side_effect=RuntimeError('backend unavailable'))
    def test_projection_failure_keeps_row_pending_until_retry_limit(self, _decode):
        row = EventDeliveryOutbox.objects.create(
            tenant_id='tenant-a', event_id='00000000-0000-0000-0000-000000000002', envelope={}
        )
        with self.assertRaises(RuntimeError):
            apply_event_projections.run(str(row.event_id), row.envelope, str(row.id))
        row.refresh_from_db()
        self.assertEqual(row.status, EventDeliveryOutbox.Status.PENDING)
        self.assertEqual(row.attempts, 1)

    @patch('zentinelle.tasks.events.EventEnvelope.from_dict', side_effect=RuntimeError('permanent failure'))
    def test_projection_failure_dead_letters_after_five_attempts(self, _decode):
        row = EventDeliveryOutbox.objects.create(
            tenant_id='tenant-a', event_id='00000000-0000-0000-0000-000000000003', envelope={}, attempts=4
        )
        with self.assertRaises(RuntimeError):
            apply_event_projections.run(str(row.event_id), row.envelope, str(row.id))
        row.refresh_from_db()
        self.assertEqual(row.status, EventDeliveryOutbox.Status.DEAD_LETTER)
        self.assertEqual(row.attempts, 5)
