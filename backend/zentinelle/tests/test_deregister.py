"""
Tests for the agent deregistration endpoint.

Uses unittest.TestCase + Django's RequestFactory.
No real database or Redis — all external calls are mocked.
"""
import json
import uuid
import unittest
from unittest.mock import MagicMock, patch, call

from django.test import RequestFactory

from zentinelle.api.views.deregister import DeregisterView


def _make_auth(valid=True, tenant_id='test-tenant', endpoint_id=None, error=None):
    """Build a mock AuthContext."""
    auth = MagicMock()
    auth.valid = valid
    auth.tenant_id = tenant_id
    auth.user_id = f"agent:{endpoint_id}" if endpoint_id else None
    auth.error = error
    return auth


def _make_endpoint(agent_id='test-agent-001', tenant_id='test-tenant',
                   status='active', endpoint_id=None):
    """Build a mock AgentEndpoint."""
    ep = MagicMock()
    ep.pk = endpoint_id or str(uuid.uuid4())
    ep.id = ep.pk
    ep.agent_id = agent_id
    ep.tenant_id = tenant_id
    ep.status = status
    ep.health = 'healthy'
    # Expose the Status / Health enums as class-level attributes on the mock
    ep.Status = MagicMock()
    ep.Status.TERMINATED = 'terminated'
    ep.Status.ACTIVE = 'active'
    ep.Health = MagicMock()
    ep.Health.UNKNOWN = 'unknown'
    return ep


class TestDeregisterView(unittest.TestCase):

    def setUp(self):
        self.factory = RequestFactory()
        self.view = DeregisterView.as_view()
        self.endpoint_id = str(uuid.uuid4())

    def _post(self, key=None):
        """Helper — craft a POST request to /deregister."""
        request = self.factory.post(
            '/api/zentinelle/v1/deregister',
            data=b'',
            content_type='application/json',
        )
        if key is not None:
            request.META['HTTP_X_ZENTINELLE_KEY'] = key
        return request

    # ------------------------------------------------------------------
    # Auth failure cases
    # ------------------------------------------------------------------

    def test_missing_key_returns_401(self):
        """No X-Zentinelle-Key header → 401."""
        request = self._post()
        response = self.view(request)
        self.assertEqual(response.status_code, 401)
        data = json.loads(response.content)
        self.assertEqual(data['error'], 'missing_key')

    @patch('zentinelle.api.views.deregister.StandaloneTenantResolver')
    def test_invalid_key_returns_401(self, mock_resolver_cls):
        """Invalid key → 401."""
        mock_resolver = MagicMock()
        mock_resolver._validate_agent_key.return_value = _make_auth(
            valid=False, error='invalid_agent_key'
        )
        mock_resolver_cls.return_value = mock_resolver

        request = self._post(key='sk_agent_badkey')
        response = self.view(request)

        self.assertEqual(response.status_code, 401)
        data = json.loads(response.content)
        self.assertEqual(data['error'], 'invalid_key')
        mock_resolver._validate_agent_key.assert_called_once_with('sk_agent_badkey')

    # ------------------------------------------------------------------
    # Success case
    # ------------------------------------------------------------------

    @patch('zentinelle.api.views.deregister.Event')
    @patch('zentinelle.api.views.deregister.AgentEndpoint')
    @patch('zentinelle.api.views.deregister.cache')
    @patch('zentinelle.api.views.deregister.StandaloneTenantResolver')
    def test_valid_key_returns_204_and_updates_endpoint(
        self, mock_resolver_cls, mock_cache, mock_endpoint_cls, mock_event_cls
    ):
        """Valid key → 204, endpoint marked terminated, cache cleared, event written."""
        endpoint = _make_endpoint(
            agent_id='my-agent', tenant_id='acme', endpoint_id=self.endpoint_id
        )
        # Simulate status not yet terminated so the main path runs
        endpoint.status = 'active'

        mock_resolver = MagicMock()
        mock_resolver._validate_agent_key.return_value = _make_auth(
            valid=True, tenant_id='acme', endpoint_id=self.endpoint_id
        )
        mock_resolver_cls.return_value = mock_resolver

        mock_endpoint_cls.objects.get.return_value = endpoint
        mock_endpoint_cls.Status.TERMINATED = 'terminated'
        mock_endpoint_cls.Health.UNKNOWN = 'unknown'

        mock_event = MagicMock()
        mock_event.id = str(uuid.uuid4())
        mock_event_cls.objects.create.return_value = mock_event
        mock_event_cls.EventType.STOP = 'stop'
        mock_event_cls.Category.AUDIT = 'audit'
        mock_event_cls.Status.PENDING = 'pending'

        with patch('zentinelle.tasks.events.process_event_batch') as mock_task:
            request = self._post(key='sk_agent_validkey')
            response = self.view(request)

        self.assertEqual(response.status_code, 204)

        # Endpoint should be saved with TERMINATED status
        self.assertEqual(endpoint.status, 'terminated')
        self.assertEqual(endpoint.health, 'unknown')
        endpoint.save.assert_called_once_with(
            update_fields=['status', 'health', 'updated_at']
        )

        # Cache keys for this agent should be deleted
        expected_config_key = 'zentinelle:config:my-agent'
        expected_baseline_key = 'baseline:acme:my-agent'
        mock_cache.delete.assert_any_call(expected_config_key)
        mock_cache.delete.assert_any_call(expected_baseline_key)

        # Audit event should be created
        mock_event_cls.objects.create.assert_called_once()
        create_kwargs = mock_event_cls.objects.create.call_args[1]
        self.assertEqual(create_kwargs['event_type'], 'stop')
        self.assertEqual(create_kwargs['event_category'], 'audit')
        self.assertEqual(create_kwargs['tenant_id'], 'acme')

    # ------------------------------------------------------------------
    # Idempotency
    # ------------------------------------------------------------------

    @patch('zentinelle.api.views.deregister.Event')
    @patch('zentinelle.api.views.deregister.AgentEndpoint')
    @patch('zentinelle.api.views.deregister.cache')
    @patch('zentinelle.api.views.deregister.StandaloneTenantResolver')
    def test_idempotent_already_terminated_returns_204(
        self, mock_resolver_cls, mock_cache, mock_endpoint_cls, mock_event_cls
    ):
        """Calling deregister on an already-terminated endpoint returns 204 without error."""
        endpoint = _make_endpoint(
            agent_id='my-agent', tenant_id='acme', endpoint_id=self.endpoint_id
        )
        endpoint.status = 'terminated'  # already terminated

        mock_resolver = MagicMock()
        mock_resolver._validate_agent_key.return_value = _make_auth(
            valid=True, tenant_id='acme', endpoint_id=self.endpoint_id
        )
        mock_resolver_cls.return_value = mock_resolver

        mock_endpoint_cls.objects.get.return_value = endpoint
        mock_endpoint_cls.Status.TERMINATED = 'terminated'

        request = self._post(key='sk_agent_validkey')
        response = self.view(request)

        self.assertEqual(response.status_code, 204)

        # No save or event creation should occur for an idempotent call
        endpoint.save.assert_not_called()
        mock_event_cls.objects.create.assert_not_called()

    @patch('zentinelle.api.views.deregister.Event')
    @patch('zentinelle.api.views.deregister.AgentEndpoint')
    @patch('zentinelle.api.views.deregister.cache')
    @patch('zentinelle.api.views.deregister.StandaloneTenantResolver')
    def test_deregister_twice_both_return_204(
        self, mock_resolver_cls, mock_cache, mock_endpoint_cls, mock_event_cls
    ):
        """Calling deregister a second time (simulating already-terminated) returns 204."""
        endpoint = _make_endpoint(
            agent_id='my-agent', tenant_id='acme', endpoint_id=self.endpoint_id
        )

        mock_resolver = MagicMock()
        mock_resolver._validate_agent_key.return_value = _make_auth(
            valid=True, tenant_id='acme', endpoint_id=self.endpoint_id
        )
        mock_resolver_cls.return_value = mock_resolver

        mock_endpoint_cls.objects.get.return_value = endpoint
        mock_endpoint_cls.Status.TERMINATED = 'terminated'

        mock_event = MagicMock()
        mock_event.id = str(uuid.uuid4())
        mock_event_cls.objects.create.return_value = mock_event
        mock_event_cls.EventType.STOP = 'stop'
        mock_event_cls.Category.AUDIT = 'audit'
        mock_event_cls.Status.PENDING = 'pending'

        # First call — endpoint starts as 'active'
        endpoint.status = 'active'
        with patch('zentinelle.tasks.events.process_event_batch'):
            request1 = self._post(key='sk_agent_validkey')
            response1 = self.view(request1)
        self.assertEqual(response1.status_code, 204)

        # After first call the status is updated to terminated
        self.assertEqual(endpoint.status, 'terminated')

        # Second call — endpoint is now 'terminated'
        # Reset mock tracking for the second call
        endpoint.save.reset_mock()
        mock_event_cls.objects.create.reset_mock()

        request2 = self._post(key='sk_agent_validkey')
        response2 = self.view(request2)
        self.assertEqual(response2.status_code, 204)

        # No additional save or event creation on the second call
        endpoint.save.assert_not_called()
        mock_event_cls.objects.create.assert_not_called()


if __name__ == '__main__':
    unittest.main()
