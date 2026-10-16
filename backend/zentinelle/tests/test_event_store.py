from unittest.mock import patch

from django.test import SimpleTestCase


class EventSequenceTests(SimpleTestCase):
    @patch('zentinelle.services.event_store.cache')
    def test_sequence_uses_atomic_increment_after_initialization(self, cache):
        cache.incr.return_value = 7
        from zentinelle.services.event_store import EventStore

        sequence = EventStore()._next_sequence('tenant-a', 'policy', 'policy-1')

        cache.add.assert_called_once_with(
            'eventstore:seq:tenant-a:policy:policy-1', 0, timeout=86400 * 30,
        )
        cache.incr.assert_called_once_with('eventstore:seq:tenant-a:policy:policy-1')
        self.assertEqual(sequence, 7)
