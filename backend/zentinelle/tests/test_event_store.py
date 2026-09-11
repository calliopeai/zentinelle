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
