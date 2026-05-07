"""
Tests for zentinelle.services.webhook_dispatcher.

Exercises HMAC signature computation, webhook payload construction,
Slack formatting, and severity-based filtering. External HTTP calls
are mocked (httpx.post).
"""
import hashlib
import hmac
import json
import unittest
from unittest.mock import patch, MagicMock

from zentinelle.services.webhook_dispatcher import (
    _deliver_webhook,
    _deliver_slack,
    dispatch_webhook,
    WEBHOOK_SECRET_HEADER,
)


def _make_config(channel, config_dict, trigger_severities=None, enabled=True):
    """Build a mock NotificationConfig with the given attributes."""
    cfg = MagicMock()
    cfg.channel = channel
    cfg.config = config_dict
    cfg.trigger_severities = trigger_severities or []
    cfg.enabled = enabled
    cfg.tenant_id = 'tenant-001'
    return cfg


class TestDeliverWebhookPayload(unittest.TestCase):
    """_deliver_webhook should send the correct JSON payload."""

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_sends_correct_fields(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        config = _make_config('webhook', {'url': 'https://hooks.example.com/zentinelle'})

        _deliver_webhook(config, 'policy_violation', 'high', {'reason': 'blocked model'})

        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        body = json.loads(kwargs['content'])

        self.assertEqual(body['event_type'], 'policy_violation')
        self.assertEqual(body['severity'], 'high')
        self.assertEqual(body['tenant_id'], 'tenant-001')
        self.assertIn('timestamp', body)
        self.assertEqual(body['data']['reason'], 'blocked model')

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_no_url_skips_delivery(self, mock_post):
        config = _make_config('webhook', {'url': ''})
        _deliver_webhook(config, 'incident_created', 'critical', {})
        mock_post.assert_not_called()


class TestHMACSignature(unittest.TestCase):
    """_deliver_webhook should compute HMAC-SHA256 when a secret is set."""

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_signature_present_and_correct(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        secret = 'my-webhook-secret'
        config = _make_config('webhook', {
            'url': 'https://hooks.example.com/zentinelle',
            'secret': secret,
        })

        _deliver_webhook(config, 'policy_violation', 'critical', {'key': 'value'})

        _, kwargs = mock_post.call_args
        body_bytes = kwargs['content'].encode()
        headers = kwargs['headers']

        # Verify the signature header exists
        self.assertIn(WEBHOOK_SECRET_HEADER, headers)
        sig_header = headers[WEBHOOK_SECRET_HEADER]
        self.assertTrue(sig_header.startswith('sha256='))

        # Recompute and verify
        expected_sig = hmac.new(
            secret.encode(),
            body_bytes,
            hashlib.sha256,
        ).hexdigest()
        self.assertEqual(sig_header, f'sha256={expected_sig}')

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_no_secret_no_signature(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        config = _make_config('webhook', {
            'url': 'https://hooks.example.com/zentinelle',
        })

        _deliver_webhook(config, 'policy_violation', 'low', {})

        _, kwargs = mock_post.call_args
        headers = kwargs['headers']
        self.assertNotIn(WEBHOOK_SECRET_HEADER, headers)


class TestDeliverSlack(unittest.TestCase):
    """_deliver_slack should format Slack-compatible attachment payloads."""

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_slack_format(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        config = _make_config('slack', {
            'webhook_url': 'https://hooks.slack.com/services/XXXXX',
        })

        _deliver_slack(config, 'incident_created', 'critical', {
            'title': 'Agent Down',
            'description': 'Agent x42 is not responding.',
        })

        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        payload = kwargs['json']

        self.assertIn('attachments', payload)
        attachment = payload['attachments'][0]
        self.assertIn('[CRITICAL]', attachment['title'])
        self.assertIn('Agent Down', attachment['title'])
        self.assertEqual(attachment['text'], 'Agent x42 is not responding.')
        self.assertEqual(attachment['color'], '#dc2626')  # critical = red
        self.assertEqual(attachment['footer'], 'Zentinelle GRC')

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_slack_severity_colors(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        expected_colors = {
            'critical': '#dc2626',
            'high': '#ea580c',
            'medium': '#ca8a04',
            'low': '#2563eb',
        }
        config = _make_config('slack', {
            'webhook_url': 'https://hooks.slack.com/services/X',
        })

        for severity, expected_color in expected_colors.items():
            mock_post.reset_mock()
            _deliver_slack(config, 'test_event', severity, {'title': 'Test'})
            _, kwargs = mock_post.call_args
            color = kwargs['json']['attachments'][0]['color']
            self.assertEqual(color, expected_color,
                             f"Severity '{severity}' should map to {expected_color}")

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_slack_no_url_skips(self, mock_post):
        config = _make_config('slack', {'webhook_url': ''})
        _deliver_slack(config, 'test_event', 'low', {})
        mock_post.assert_not_called()

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_slack_falls_back_to_event_type_title(self, mock_post):
        """When no 'title' in payload, event_type is used as title."""
        mock_post.return_value = MagicMock(status_code=200)
        config = _make_config('slack', {
            'webhook_url': 'https://hooks.slack.com/services/X',
        })
        _deliver_slack(config, 'compliance_alert', 'medium', {})

        _, kwargs = mock_post.call_args
        title = kwargs['json']['attachments'][0]['title']
        self.assertIn('Compliance Alert', title)

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_slack_description_truncated(self, mock_post):
        """Long descriptions should be truncated to 2000 chars."""
        mock_post.return_value = MagicMock(status_code=200)
        config = _make_config('slack', {
            'webhook_url': 'https://hooks.slack.com/services/X',
        })
        long_desc = 'A' * 5000
        _deliver_slack(config, 'test', 'low', {'description': long_desc})

        _, kwargs = mock_post.call_args
        text = kwargs['json']['attachments'][0]['text']
        self.assertEqual(len(text), 2000)


class TestDispatchWebhookFiltering(unittest.TestCase):
    """dispatch_webhook should filter by severity based on trigger_severities."""

    @patch('zentinelle.services.webhook_dispatcher._deliver_slack')
    @patch('zentinelle.services.webhook_dispatcher._deliver_webhook')
    @patch('zentinelle.services.webhook_dispatcher.NotificationConfig')
    def test_severity_filter_skips_non_matching(self, MockModel, mock_webhook, mock_slack):
        # Config only triggers on 'critical'
        cfg = _make_config('webhook', {'url': 'https://example.com/hook'}, ['critical'])
        cfg.channel = 'webhook'
        MockModel.Channel.WEBHOOK = 'webhook'
        MockModel.Channel.SLACK = 'slack'
        MockModel.objects.filter.return_value = [cfg]

        dispatch_webhook('tenant-001', 'policy_violation', 'low', {'detail': 'minor'})

        # Should NOT call _deliver_webhook because severity 'low' doesn't match
        mock_webhook.assert_not_called()

    @patch('zentinelle.services.webhook_dispatcher._deliver_slack')
    @patch('zentinelle.services.webhook_dispatcher._deliver_webhook')
    @patch('zentinelle.services.webhook_dispatcher.NotificationConfig')
    def test_severity_filter_delivers_matching(self, MockModel, mock_webhook, mock_slack):
        cfg = _make_config('webhook', {'url': 'https://example.com/hook'}, ['critical', 'high'])
        cfg.channel = 'webhook'
        MockModel.Channel.WEBHOOK = 'webhook'
        MockModel.Channel.SLACK = 'slack'
        MockModel.objects.filter.return_value = [cfg]

        dispatch_webhook('tenant-001', 'incident_created', 'critical', {'detail': 'major'})

        mock_webhook.assert_called_once()

    @patch('zentinelle.services.webhook_dispatcher._deliver_slack')
    @patch('zentinelle.services.webhook_dispatcher._deliver_webhook')
    @patch('zentinelle.services.webhook_dispatcher.NotificationConfig')
    def test_empty_trigger_severities_delivers_all(self, MockModel, mock_webhook, mock_slack):
        """When trigger_severities is empty, all severities should be delivered."""
        cfg = _make_config('webhook', {'url': 'https://example.com/hook'}, [])
        cfg.channel = 'webhook'
        MockModel.Channel.WEBHOOK = 'webhook'
        MockModel.Channel.SLACK = 'slack'
        MockModel.objects.filter.return_value = [cfg]

        dispatch_webhook('tenant-001', 'test_event', 'low', {'detail': 'test'})

        mock_webhook.assert_called_once()

    @patch('zentinelle.services.webhook_dispatcher._deliver_slack')
    @patch('zentinelle.services.webhook_dispatcher._deliver_webhook')
    @patch('zentinelle.services.webhook_dispatcher.NotificationConfig')
    def test_slack_channel_dispatched(self, MockModel, mock_webhook, mock_slack):
        cfg = _make_config('slack', {'webhook_url': 'https://hooks.slack.com/X'}, [])
        cfg.channel = 'slack'
        MockModel.Channel.WEBHOOK = 'webhook'
        MockModel.Channel.SLACK = 'slack'
        MockModel.objects.filter.return_value = [cfg]

        dispatch_webhook('tenant-001', 'compliance_alert', 'medium', {'detail': 'test'})

        mock_slack.assert_called_once()
        mock_webhook.assert_not_called()


class TestWebhookHTTPError(unittest.TestCase):
    """HTTP errors should be caught and logged, not raised."""

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_http_error_handled_gracefully(self, mock_post):
        mock_post.side_effect = Exception('Connection refused')
        config = _make_config('webhook', {
            'url': 'https://hooks.example.com/zentinelle',
        })

        # Should not raise
        _deliver_webhook(config, 'test', 'high', {})

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_slack_error_handled_gracefully(self, mock_post):
        mock_post.side_effect = Exception('Timeout')
        config = _make_config('slack', {
            'webhook_url': 'https://hooks.slack.com/X',
        })

        # Should not raise
        _deliver_slack(config, 'test', 'high', {})
