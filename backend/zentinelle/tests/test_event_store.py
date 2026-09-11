from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from zentinelle.services.event_store import DeadLetterQueue


class DeadLetterQueueTests(SimpleTestCase):
    @patch('zentinelle.models.Event')
    def test_dlq_preserves_original_status(self, event_model):
        event_model.Status.FAILED = 'failed'
        event = MagicMock(status='processing', payload={}, id='event-1')

        DeadLetterQueue().move_to_dlq(event, 'projection unavailable')

        self.assertEqual(event.status, 'failed')
        self.assertEqual(event.payload['dlq']['original_status'], 'processing')
        self.assertEqual(event.payload['dlq']['reason'], 'projection unavailable')
        event.save.assert_called_once_with()


class EventSequenceTests(SimpleTestCase):
    @patch('zentinelle.services.event_store.cache')
    def test_sequence_uses_atomic_increment_after_initialization(self, cache):
        cache.incr.return_value = 7
        from zentinelle.services.event_store import EventStore

        sequence = EventStore()._next_sequence('policy', 'policy-1')

        cache.add.assert_called_once_with(
            'eventstore:seq:policy:policy-1', 0, timeout=86400 * 30,
        )
        cache.incr.assert_called_once_with('eventstore:seq:policy:policy-1')
        self.assertEqual(sequence, 7)
