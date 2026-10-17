"""Agents and their usage filterable by Astrolift cluster, and a portal rotate (#389).

An install names the cluster an agent key is for; a gateway's usage report
names its cluster by the credential it carries, never by its payload. The
portal reads both through the caller's tenant only, and an admin can rotate
a cluster's gateway credential next to revoking it.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from zentinelle.auth.gateway_credential import STANDALONE_TENANT_ID
from zentinelle.auth.roles import ROLE_ADMIN, ROLE_OPERATOR, assign_role
from zentinelle.models import (AgentEndpoint, AstroliftCluster, AuditLog,
                               Event, GatewayCredential, InteractionLog)
from zentinelle.tests._graphql_helpers import admin_context
from zentinelle.tests.test_astrolift_agent_keys import mint
from zentinelle.tests.test_astrolift_clusters import (TENANT_A, TENANT_B,
                                                      audit_text,
                                                      connect_install,
                                                      register)

STANDALONE = STANDALONE_TENANT_ID


def usage_report(agent_key, gateway_credential=None, event_type='llm:usage', request_id='req-1'):
    headers = {'HTTP_X_ZENTINELLE_GATEWAY_CREDENTIAL': gateway_credential} if gateway_credential else {}
    return APIClient().post(reverse('zentinelle:events'), {'agent_id': '', 'events': [{
        'type': event_type, 'timestamp': timezone.now().isoformat(), 'category': 'telemetry',
        'payload': {'provider': 'anthropic', 'model': 'claude-sonnet-4-6', 'total_tokens': 15,
                    'request_id': request_id, 'cluster_id': 'forged'},
    }]}, format='json', HTTP_X_ZENTINELLE_KEY=agent_key, **headers)


class AgentKeysNameTheirClusterTests(TestCase):
    def setUp(self):
        self.credential, self.install = connect_install([TENANT_A, TENANT_B])
        register(self.credential, 'c1')
        register(self.credential, 'c-b', tenant_ids=[TENANT_B])
        self.cluster = AstroliftCluster.objects.get(external_id='c1')

    def agent(self):
        return AgentEndpoint.objects.get(agent_id='task-1')

    def test_a_key_minted_for_a_cluster_is_its_agent(self):
        response = mint(self.credential, 'task-1', tenant_id=TENANT_A, cluster_id='c1')

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['agent']['cluster_id'], 'c1')
        self.assertEqual(self.agent().astrolift_cluster, self.cluster)
        self.assertEqual(AuditLog.objects.get(action='astrolift.agent_key.minted').metadata['cluster_id'], 'c1')

    def test_minting_again_takes_the_cluster_the_new_mint_names(self):
        mint(self.credential, 'task-1', tenant_id=TENANT_A, cluster_id='c1')
        self.assertEqual(mint(self.credential, 'task-1', tenant_id=TENANT_A).status_code, 200)
        self.assertIsNone(self.agent().astrolift_cluster)

    def test_a_cluster_that_is_not_the_installs_or_not_live_is_refused(self):
        other_credential, _ = connect_install([TENANT_A], name='other')
        register(other_credential, 'theirs')
        AstroliftCluster.objects.filter(external_id='c-b').update(revoked_at=timezone.now())
        for cluster_id in ('theirs', 'c-b', 'missing'):
            with self.subTest(cluster_id=cluster_id):
                response = mint(self.credential, 'task-1', tenant_id=TENANT_B, cluster_id=cluster_id)
                self.assertEqual((response.status_code, response.json()['error']), (404, 'cluster_not_found'))
        self.assertFalse(AgentEndpoint.objects.filter(agent_id='task-1').exists())

    def test_a_cluster_whose_gateway_does_not_serve_the_agents_tenant_is_refused(self):
        response = mint(self.credential, 'task-1', tenant_id=TENANT_A, cluster_id='c-b')

        self.assertEqual((response.status_code, response.json()['error']), (403, 'tenant_not_in_cluster_scope'))
        self.assertFalse(AgentEndpoint.objects.filter(agent_id='task-1').exists())


class UsageEventsNameTheGatewaysClusterTests(TestCase):
    def setUp(self):
        credential, _ = connect_install([TENANT_A])
        self.gateway = register(credential, 'c1').json()['gateway']['credential']
        self.cluster = AstroliftCluster.objects.get(external_id='c1')
        self.key = mint(credential, 'task-1', cluster_id='c1').json()['api_key']

    def test_a_usage_report_with_the_gateways_credential_carries_its_cluster(self):
        self.assertEqual(usage_report(self.key, self.gateway).status_code, 202)
        self.assertEqual(Event.objects.get().astrolift_cluster, self.cluster)

    def test_without_the_credential_or_for_other_events_no_cluster_is_set(self):
        usage_report(self.key)
        usage_report(self.key, self.gateway, event_type='spawn', request_id='req-2')
        self.assertEqual(list(Event.objects.values_list('astrolift_cluster', flat=True)), [None, None])

    def test_an_operator_registered_gateway_has_no_cluster(self):
        from zentinelle.models import GatewayRegistration
        registration = GatewayRegistration.objects.create(name='by-hand', cluster_id='c1', tenant_ids=[TENANT_A])
        plaintext, _ = GatewayCredential.mint(registration)
        usage_report(self.key, plaintext)
        event = Event.objects.get()
        self.assertEqual((event.payload['source'], event.astrolift_cluster), ('gateway', None))


class GraphQLFilterTests(TestCase):
    QUERY = '''query($cluster: UUID) {
        endpoints(astroliftClusterId: $cluster) { agentId }
        events(astroliftClusterId: $cluster) { eventType }
        usageMetrics(astroliftClusterId: $cluster) { summary { totalApiCalls activeAgents } }
    }'''

    def setUp(self):
        credential, _ = connect_install([STANDALONE, TENANT_B])
        gateways = {cluster: register(credential, cluster).json()['gateway']['credential']
                    for cluster in ('c1', 'c2')}
        for agent_id, tenant, cluster in (('a1', STANDALONE, 'c1'), ('a2', STANDALONE, 'c2'),
                                          ('b1', TENANT_B, 'c1')):
            key = mint(credential, agent_id, tenant_id=tenant, cluster_id=cluster).json()['api_key']
            usage_report(key, gateways[cluster], request_id=agent_id)
            agent = AgentEndpoint.objects.get(agent_id=agent_id)
            InteractionLog.objects.create(tenant_id=tenant, endpoint=agent, request_id=agent_id,
                                          occurred_at=timezone.now(), total_tokens=10)
        self.c1 = AstroliftCluster.objects.get(external_id='c1')

    def query(self, cluster=None):
        from zentinelle.schema import schema
        result = schema.execute_sync(self.QUERY, variable_values={'cluster': str(cluster) if cluster else None},
                                     context_value=admin_context(STANDALONE))
        self.assertIsNone(result.errors, result.errors)
        return result.data

    def test_each_query_filters_to_the_cluster_within_the_callers_tenant(self):
        data = self.query(self.c1.id)

        self.assertEqual([e['agentId'] for e in data['endpoints']], ['a1'])
        self.assertEqual([e['eventType'] for e in data['events']], ['llm:usage'])
        self.assertEqual(data['usageMetrics']['summary'], {'totalApiCalls': 1, 'activeAgents': 1})

    def test_without_the_filter_every_agent_of_the_tenant_is_read(self):
        data = self.query()

        self.assertEqual(sorted(e['agentId'] for e in data['endpoints']), ['a1', 'a2'])
        self.assertEqual(len(data['events']), 2)
        self.assertEqual(data['usageMetrics']['summary'], {'totalApiCalls': 2, 'activeAgents': 2})


@override_settings(AUTH_MODE='local')
class PortalRotateTests(TestCase):
    @staticmethod
    def as_portal(username, role):
        user = get_user_model().objects.create_user(username=username, password='test-only-pass')
        assign_role(user, role)
        client = APIClient()
        client.force_login(user)
        return client, user

    def setUp(self):
        self.admin, self.admin_user = self.as_portal('admin', ROLE_ADMIN)
        self.credential, self.install = connect_install([STANDALONE])
        self.old = register(self.credential, 'c1').json()['gateway']['credential']
        self.cluster = AstroliftCluster.objects.get(external_id='c1')

    def rotate(self, client=None, cluster=None, **body):
        return (client or self.admin).post(reverse('zentinelle:astrolift-cluster-rotate-admin',
                                                   kwargs={'cluster_id': (cluster or self.cluster).id}),
                                           body, format='json')

    def test_an_admin_rotates_and_the_old_credential_overlaps(self):
        response = self.rotate(overlap_seconds=120)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response['Cache-Control'], 'no-store')
        new = response.json()['gateway']['credential']
        self.assertTrue(new.startswith('sk_gateway_'))
        self.assertIsNotNone(GatewayCredential.authenticate(new))
        old = GatewayCredential.authenticate(self.old)
        self.assertIsNotNone(old)
        self.assertAlmostEqual((old.expires_at - timezone.now()).total_seconds(), 120, delta=30)
        entry = AuditLog.objects.get(action='astrolift.cluster.rotated')
        self.assertEqual((entry.tenant_id, entry.ext_user_id, entry.metadata['via'], entry.metadata['overlap_seconds']),
                         (STANDALONE, str(self.admin_user.pk), 'portal', 120))
        self.assertNotIn(new, audit_text())

    def test_an_overlap_of_zero_cuts_the_old_credential_off(self):
        self.assertEqual(self.rotate(overlap_seconds=0).status_code, 200)
        self.assertIsNone(GatewayCredential.authenticate(self.old))

    def test_the_overlap_is_bounded(self):
        self.assertEqual(self.rotate(overlap_seconds=86401).status_code, 400)
        self.assertEqual(self.rotate(overlap_seconds=-1).status_code, 400)
        self.assertFalse(AuditLog.objects.filter(action='astrolift.cluster.rotated').exists())

    def test_only_admins_rotate_and_only_their_tenants_live_clusters(self):
        operator, _ = self.as_portal('operator', ROLE_OPERATOR)
        other_credential, _ = connect_install([TENANT_B], name='other')
        register(other_credential, 'theirs')
        theirs = AstroliftCluster.objects.get(external_id='theirs')

        self.assertIn(self.rotate(operator).status_code, (401, 403))
        self.assertIn(self.rotate(APIClient()).status_code, (401, 403))
        self.assertEqual(self.rotate(cluster=theirs).status_code, 404)
        self.admin.delete(reverse('zentinelle:astrolift-cluster-admin', kwargs={'cluster_id': self.cluster.id}))
        self.assertEqual(self.rotate().status_code, 404)
        self.assertFalse(AuditLog.objects.filter(action='astrolift.cluster.rotated').exists())
