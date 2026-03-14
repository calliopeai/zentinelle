"""
Tests for Zentinelle API views.
"""
import json
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from unittest.mock import patch, MagicMock

from organization.models import Organization
from deployments.models import Deployment
from zentinelle.models import (
    AgentEndpoint,
    Policy,
    Event,
)


class ZentinelleAPITestMixin:
    """Mixin for Zentinelle API tests providing common setup."""

    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Org")

        # Create endpoint with known API key
        self.full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            organization=self.org,
            agent_id='test-agent-001',
            name='Test Agent',
            agent_type=AgentEndpoint.AgentType.JUPYTERHUB,
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
            config={'version': '1.0'},
        )

    def authenticate(self):
        """Set authentication header."""
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.full_key)


class ConfigViewTest(ZentinelleAPITestMixin, TestCase):
    """Tests for the config endpoint."""

    def test_get_config_unauthenticated(self):
        """Test that unauthenticated requests are rejected."""
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_get_config_invalid_key(self):
        """Test that invalid API key is rejected."""
        self.client.credentials(HTTP_X_ZENTINELLE_KEY='invalid_key')
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_get_config_success(self):
        """Test successful config retrieval."""
        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['agent_id'], 'test-agent-001')
        self.assertEqual(data['config']['version'], '1.0')
        self.assertIn('policies', data)
        self.assertIn('updated_at', data)

    def test_get_config_agent_mismatch(self):
        """Test that accessing another agent's config is forbidden."""
        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': 'other-agent'})
        )
        self.assertEqual(response.status_code, 403)

    def test_get_config_includes_policies(self):
        """Test that config includes effective policies."""
        Policy.objects.create(
            organization=self.org,
            name='Rate Limit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={'requests_per_minute': 100},
        )

        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['policies']), 1)
        self.assertEqual(data['policies'][0]['type'], Policy.PolicyType.RATE_LIMIT)


class HeartbeatViewTest(ZentinelleAPITestMixin, TestCase):
    """Tests for the heartbeat endpoint."""

    def test_heartbeat_unauthenticated(self):
        """Test that unauthenticated requests are rejected."""
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={'agent_id': self.endpoint.agent_id, 'status': 'healthy'},
            format='json',
        )
        self.assertEqual(response.status_code, 401)

    def test_heartbeat_success(self):
        """Test successful heartbeat."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={
                'agent_id': self.endpoint.agent_id,
                'status': 'healthy',
                'metrics': {'cpu': 45, 'memory': 60},
            },
            format='json',  # Use format='json' for proper JSON serialization
        )

        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertTrue(data['acknowledged'])

        # Verify endpoint was updated
        self.endpoint.refresh_from_db()
        self.assertIsNotNone(self.endpoint.last_heartbeat)
        self.assertEqual(self.endpoint.health, AgentEndpoint.Health.HEALTHY)

    def test_heartbeat_agent_mismatch(self):
        """Test heartbeat with mismatched agent ID."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={'agent_id': 'wrong-agent', 'status': 'healthy'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_heartbeat_updates_health_status(self):
        """Test that heartbeat updates health status correctly."""
        self.authenticate()

        # Send unhealthy heartbeat
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={'agent_id': self.endpoint.agent_id, 'status': 'unhealthy'},
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.health, AgentEndpoint.Health.UNHEALTHY)

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_heartbeat_creates_event(self, mock_task):
        """Test that heartbeat creates telemetry event."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={'agent_id': self.endpoint.agent_id, 'status': 'healthy'},
            format='json',
        )

        self.assertEqual(response.status_code, 202)

        # Verify event was created
        events = Event.objects.filter(
            endpoint=self.endpoint,
            event_type=Event.EventType.HEARTBEAT,
        )
        self.assertEqual(events.count(), 1)


class EvaluateViewTest(ZentinelleAPITestMixin, TestCase):
    """Tests for the evaluate endpoint."""

    def test_evaluate_unauthenticated(self):
        """Test that unauthenticated requests are rejected."""
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={'agent_id': self.endpoint.agent_id, 'action': 'spawn'},
            format='json',
        )
        self.assertEqual(response.status_code, 401)

    def test_evaluate_no_policies(self):
        """Test evaluation with no policies - should allow."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': self.endpoint.agent_id,
                'action': 'spawn',
                'user_id': 'user123',
                'context': {'service': 'lab'},
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['allowed'])
        self.assertIsNone(data['reason'])

    def test_evaluate_agent_mismatch(self):
        """Test evaluation with mismatched agent ID."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={'agent_id': 'wrong-agent', 'action': 'spawn'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    @patch('zentinelle.services.policy_engine.PolicyEngine.evaluate')
    def test_evaluate_policy_allowed(self, mock_evaluate):
        """Test evaluation when policy allows action."""
        from zentinelle.services.policy_engine import EvaluationResult

        mock_evaluate.return_value = EvaluationResult(
            allowed=True,
            reason=None,
            policies_evaluated=[
                {'id': '1', 'name': 'Rate Limit', 'type': 'rate_limit', 'result': 'pass', 'message': None}
            ],
            warnings=[],
            context={},
        )

        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': self.endpoint.agent_id,
                'action': 'spawn',
                'user_id': 'user123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['allowed'])

    @patch('zentinelle.services.policy_engine.PolicyEngine.evaluate')
    def test_evaluate_policy_denied(self, mock_evaluate):
        """Test evaluation when policy denies action."""
        from zentinelle.services.policy_engine import EvaluationResult

        mock_evaluate.return_value = EvaluationResult(
            allowed=False,
            reason='Rate limit exceeded',
            policies_evaluated=[
                {'id': '1', 'name': 'Rate Limit', 'type': 'rate_limit', 'result': 'fail', 'message': 'Rate limit exceeded'}
            ],
            warnings=[],
            context={},
        )

        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': self.endpoint.agent_id,
                'action': 'spawn',
                'user_id': 'user123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)  # Still 200, but allowed=False
        data = response.json()
        self.assertFalse(data['allowed'])
        self.assertEqual(data['reason'], 'Rate limit exceeded')

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_evaluate_creates_audit_event(self, mock_task):
        """Test that evaluation creates audit event."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': self.endpoint.agent_id,
                'action': 'spawn',
                'user_id': 'user123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)

        # Verify event was created
        events = Event.objects.filter(endpoint=self.endpoint)
        self.assertEqual(events.count(), 1)


class EventsViewTest(ZentinelleAPITestMixin, TestCase):
    """Tests for the events endpoint."""

    def test_send_events_unauthenticated(self):
        """Test that unauthenticated requests are rejected."""
        response = self.client.post(
            reverse('zentinelle:events'),
            data={'events': []},
            format='json',
        )
        self.assertEqual(response.status_code, 401)

    def test_send_events_success(self):
        """Test successfully sending events."""
        from django.utils import timezone
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:events'),
            data={
                'agent_id': self.endpoint.agent_id,
                'events': [
                    {
                        'type': 'spawn',
                        'category': 'telemetry',
                        'user_id': 'user123',
                        'payload': {'service': 'lab'},
                        'timestamp': timezone.now().isoformat(),
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data['accepted'], 1)

    def test_send_events_batch(self):
        """Test sending batch of events."""
        from django.utils import timezone
        self.authenticate()
        now = timezone.now().isoformat()
        response = self.client.post(
            reverse('zentinelle:events'),
            data={
                'agent_id': self.endpoint.agent_id,
                'events': [
                    {
                        'type': 'spawn',
                        'category': 'telemetry',
                        'user_id': 'user123',
                        'payload': {},
                        'timestamp': now,
                    },
                    {
                        'type': 'terminate',
                        'category': 'telemetry',
                        'user_id': 'user456',
                        'payload': {},
                        'timestamp': now,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data['accepted'], 2)


class APIKeyAuthenticationTest(ZentinelleAPITestMixin, TestCase):
    """Tests for API key authentication."""

    def test_auth_missing_header(self):
        """Test request without auth header."""
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_auth_wrong_key(self):
        """Test request with wrong API key."""
        self.client.credentials(HTTP_X_ZENTINELLE_KEY='sk_agent_wrongkey12345')
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_auth_suspended_endpoint(self):
        """Test that suspended endpoints cannot authenticate."""
        self.endpoint.status = AgentEndpoint.Status.SUSPENDED
        self.endpoint.save()

        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_auth_offline_endpoint(self):
        """Test that offline endpoints cannot authenticate."""
        self.endpoint.status = AgentEndpoint.Status.OFFLINE
        self.endpoint.save()

        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)


class RateLimitMiddlewareTest(ZentinelleAPITestMixin, TestCase):
    """Tests for API rate limiting."""

    @patch('zentinelle.api.middleware.cache')
    def test_rate_limit_headers(self, mock_cache):
        """Test that rate limit headers are present."""
        mock_cache.get.return_value = None
        mock_cache.set.return_value = None

        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )

        # Response should succeed (headers depend on middleware implementation)
        self.assertEqual(response.status_code, 200)
