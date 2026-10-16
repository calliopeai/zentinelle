"""An operator cannot point the backend at an internal URL through config.hub_identity (T13)."""
import socket
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from graphql_relay import to_global_id
from rest_framework.test import APIClient

from zentinelle.api.auth import ZentinelleServiceUser
from zentinelle.models import AgentEndpoint
from zentinelle.schema import schema
from zentinelle.services.hub_identity import hub_identity_error
from zentinelle.tests._graphql_helpers import admin_context
from zentinelle.tests._two_tenants_portal import TENANT_A, make_agent

METADATA = 'http://169.254.169.254/latest/meta-data/iam'


def _binding(api_url):
    return {'hub_identity': {'hub_id': 'hub-one', 'api_url': api_url}}


def _resolves_to(address):
    answer = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, 443))]
    return patch.object(socket, 'getaddrinfo', return_value=answer)


class HubIdentityUrlTests(TestCase):
    def operator(self):
        client = APIClient()
        client.force_authenticate(user=ZentinelleServiceUser(
            SimpleNamespace(tenant_id=TENANT_A, scopes=['read', 'write'], is_active=True, pk=1, id=1)))
        return client

    def test_internal_addresses_are_refused(self):
        for url in (METADATA, 'http://127.0.0.1:8081/hub/api', 'http://10.0.0.5/hub/api',
                    'http://[::1]/hub/api', 'http://localhost/hub/api'):
            with self.subTest(url=url):
                self.assertIsNotNone(hub_identity_error(_binding(url)['hub_identity']))

    def test_a_public_hub_is_accepted(self):
        with _resolves_to('8.8.8.8'):
            self.assertIsNone(hub_identity_error(_binding('https://hub.example.com/hub/api')['hub_identity']))

    def test_a_name_resolving_to_a_private_address_is_refused(self):
        with _resolves_to('10.1.2.3'):
            self.assertIsNotNone(hub_identity_error(_binding('https://hub.example.com/hub/api')['hub_identity']))

    @override_settings(HUB_IDENTITY_ALLOWED_HOSTS=frozenset({'hub.internal'}))
    def test_an_allowlisted_internal_hub_is_accepted(self):
        self.assertIsNone(hub_identity_error(_binding('http://hub.internal:8081/hub/api')['hub_identity']))

    def test_the_operator_api_refuses_it_on_write(self):
        response = self.operator().post(reverse('zentinelle:operator-agents'),
                                        {'agent_id': 'hub-host', 'name': 'hub', 'config': _binding(METADATA)},
                                        format='json')

        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(AgentEndpoint.objects.filter(agent_id='hub-host').exists())

    def test_the_portal_refuses_it_on_create_and_update(self):
        create = schema.execute_sync(
            '''mutation($input: CreateAgentEndpointInput!) { createAgentEndpoint(input: $input) { success error } }''',
            variable_values={'input': {'name': 'h', 'agentId': 'hub-host', 'agentType': 'agent_host',
                                       'config': _binding(METADATA)}},
            context_value=admin_context(TENANT_A))
        self.assertFalse(create.data['createAgentEndpoint']['success'])
        self.assertFalse(AgentEndpoint.objects.filter(agent_id='hub-host').exists())

        agent, _ = make_agent(TENANT_A, agent_id='existing-host')
        update = schema.execute_sync(
            '''mutation($input: UpdateAgentEndpointInput!) { updateAgentEndpoint(input: $input) { success error } }''',
            variable_values={'input': {'id': to_global_id('AgentEndpoint', str(agent.pk)),
                                       'config': _binding(METADATA)}},
            context_value=admin_context(TENANT_A))
        self.assertIsNone(update.errors)
        self.assertFalse(update.data['updateAgentEndpoint']['success'])
        agent.refresh_from_db()
        self.assertNotIn('hub_identity', agent.config)
