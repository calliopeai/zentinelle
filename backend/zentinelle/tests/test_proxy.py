"""
Tests for the LLM proxy view.
"""
import json
import uuid
from unittest.mock import MagicMock, patch

from django.test import TestCase, RequestFactory

from zentinelle.proxy.views import ProxyView


class TestProxyView(TestCase):
    """Tests for ProxyView."""

    def setUp(self):
        self.factory = RequestFactory()
        self.view = ProxyView.as_view()

    def _make_request(self, provider='openai', path='v1/chat/completions',
                      zentinelle_key=None, body=None, method='POST'):
        body_bytes = json.dumps(body or {}).encode() if body else b''
        request = self.factory.generic(
            method,
            f'/proxy/{provider}/{path}',
            data=body_bytes,
            content_type='application/json',
        )
        if zentinelle_key:
            request.META['HTTP_X_ZENTINELLE_KEY'] = zentinelle_key
        return request

    def test_missing_zentinelle_key_returns_401(self):
        """Request without X-Zentinelle-Key returns 401."""
        request = self._make_request()
        response = self.view(request, provider='openai', path='v1/chat/completions')
        self.assertEqual(response.status_code, 401)
        data = json.loads(response.content)
        self.assertEqual(data['error'], 'missing_key')

    @patch('zentinelle.proxy.views.StandaloneTenantResolver')
    def test_invalid_key_returns_401(self, mock_resolver_cls):
        """Request with invalid key returns 401."""
        mock_auth = MagicMock()
        mock_auth.valid = False
        mock_auth.error = 'invalid_agent_key'
        mock_resolver = MagicMock()
        mock_resolver._validate_agent_key.return_value = mock_auth
        mock_resolver_cls.return_value = mock_resolver

        request = self._make_request(zentinelle_key='sk_agent_invalid')
        response = self.view(request, provider='openai', path='v1/chat/completions')
        self.assertEqual(response.status_code, 401)
        data = json.loads(response.content)
        self.assertEqual(data['error'], 'invalid_key')

    @patch('zentinelle.proxy.views.PolicyEngine')
    @patch('zentinelle.proxy.views.AgentEndpoint')
    @patch('zentinelle.proxy.views.StandaloneTenantResolver')
    def test_policy_denied_returns_403_with_reason(
        self, mock_resolver_cls, mock_endpoint_cls, mock_engine_cls
    ):
        """When policy denies request, 403 is returned with reason."""
        endpoint_id = str(uuid.uuid4())

        mock_auth = MagicMock()
        mock_auth.valid = True
        mock_auth.tenant_id = 'test-tenant'
        mock_auth.user_id = f'agent:{endpoint_id}'
        mock_resolver = MagicMock()
        mock_resolver._validate_agent_key.return_value = mock_auth
        mock_resolver_cls.return_value = mock_resolver

        mock_endpoint = MagicMock()
        mock_endpoint_cls.objects.get.return_value = mock_endpoint
        mock_endpoint_cls.Status.ACTIVE = 'active'

        mock_eval = MagicMock()
        mock_eval.allowed = False
        mock_eval.reason = 'Model not in allowlist'
        mock_engine = MagicMock()
        mock_engine.evaluate.return_value = mock_eval
        mock_engine_cls.return_value = mock_engine

        request = self._make_request(
            zentinelle_key='sk_agent_validkey',
            body={'model': 'gpt-4', 'messages': []},
        )
        response = self.view(request, provider='openai', path='v1/chat/completions')
        self.assertEqual(response.status_code, 403)
        data = json.loads(response.content)
        self.assertEqual(data['error'], 'policy_denied')
        self.assertIn('allowlist', data['detail'])

    @patch('httpx.Client')
    @patch('zentinelle.proxy.views.PolicyEngine')
    @patch('zentinelle.proxy.views.AgentEndpoint')
    @patch('zentinelle.proxy.views.StandaloneTenantResolver')
    def test_valid_request_forwarded_to_provider(
        self, mock_resolver_cls, mock_endpoint_cls, mock_engine_cls, mock_httpx_client_cls
    ):
        """Valid request is forwarded to the upstream provider and response returned."""
        endpoint_id = str(uuid.uuid4())

        mock_auth = MagicMock()
        mock_auth.valid = True
        mock_auth.tenant_id = 'test-tenant'
        mock_auth.user_id = f'agent:{endpoint_id}'
        mock_resolver = MagicMock()
        mock_resolver._validate_agent_key.return_value = mock_auth
        mock_resolver_cls.return_value = mock_resolver

        mock_endpoint = MagicMock()
        mock_endpoint_cls.objects.get.return_value = mock_endpoint
        mock_endpoint_cls.Status.ACTIVE = 'active'

        mock_eval = MagicMock()
        mock_eval.allowed = True
        mock_engine = MagicMock()
        mock_engine.evaluate.return_value = mock_eval
        mock_engine_cls.return_value = mock_engine

        # Mock httpx response
        mock_upstream_response = MagicMock()
        mock_upstream_response.status_code = 200
        mock_upstream_response.content = b'{"choices": []}'
        mock_upstream_response.headers = {'content-type': 'application/json'}

        mock_client_instance = MagicMock()
        mock_client_instance.request.return_value = mock_upstream_response
        mock_client_instance.__enter__ = MagicMock(return_value=mock_client_instance)
        mock_client_instance.__exit__ = MagicMock(return_value=False)
        mock_httpx_client_cls.return_value = mock_client_instance

        # Mock Policy.objects.filter for output filter check (local import inside method)
        with patch('zentinelle.models.Policy') as mock_policy_cls:
            mock_policy_cls.PolicyType.OUTPUT_FILTER = 'output_filter'
            mock_policy_cls.objects.filter.return_value.exists.return_value = False

            request = self._make_request(
                zentinelle_key='sk_agent_validkey',
                body={'model': 'gpt-4', 'messages': [{'role': 'user', 'content': 'Hello'}]},
            )
            response = self.view(request, provider='openai', path='v1/chat/completions')

        self.assertEqual(response.status_code, 200)
        # X-Zentinelle-Key must not have been forwarded
        forwarded_headers = mock_client_instance.request.call_args[1].get('headers', {})
        header_names_lower = {k.lower() for k in forwarded_headers}
        self.assertNotIn('x-zentinelle-key', header_names_lower)

    def test_provider_not_supported_returns_404(self):
        """Unknown provider returns 404."""
        with patch('zentinelle.proxy.views.StandaloneTenantResolver') as mock_resolver_cls:
            mock_auth = MagicMock()
            mock_auth.valid = True
            mock_auth.tenant_id = 'test-tenant'
            mock_auth.user_id = 'agent:some-id'
            mock_resolver = MagicMock()
            mock_resolver._validate_agent_key.return_value = mock_auth
            mock_resolver_cls.return_value = mock_resolver

            request = self._make_request(zentinelle_key='sk_agent_valid')
            response = self.view(request, provider='unknownprovider', path='v1/chat/completions')

        self.assertEqual(response.status_code, 404)
        data = json.loads(response.content)
        self.assertEqual(data['error'], 'unsupported_provider')
