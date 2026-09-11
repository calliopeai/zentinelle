import json
from types import SimpleNamespace
from unittest.mock import patch

from django.test import RequestFactory, TestCase

from zentinelle.models import AgentEndpoint, Policy
from zentinelle.proxy.views import ProxyView


class ProxyNetworkPolicyTests(TestCase):
    def test_provider_domain_allowlist_blocks_before_http_client(self):
        key, key_hash, prefix = AgentEndpoint.generate_api_key()
        endpoint = AgentEndpoint.objects.create(
            tenant_id='tenant-network', agent_id='network-agent', name='Network agent',
            api_key_hash=key_hash, api_key_prefix=prefix,
        )
        Policy.objects.create(
            tenant_id='tenant-network', name='Anthropic only',
            policy_type=Policy.PolicyType.NETWORK_POLICY,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={'allowed_domains': ['api.anthropic.com'], 'allow_outbound': True},
        )
        request = RequestFactory().post(
            '/proxy/openai/v1/chat/completions', data=json.dumps({'model': 'gpt-4o'}),
            content_type='application/json', HTTP_X_ZENTINELLE_KEY=key,
        )
        auth = SimpleNamespace(valid=True, tenant_id='tenant-network', user_id=f'agent:{endpoint.id}')
        with patch('zentinelle.proxy.views.StandaloneTenantResolver._validate_agent_key', return_value=auth), \
             patch('httpx.Client') as client:
            response = ProxyView.as_view()(request, provider='openai', path='v1/chat/completions')
        self.assertEqual(response.status_code, 403)
        client.assert_not_called()
