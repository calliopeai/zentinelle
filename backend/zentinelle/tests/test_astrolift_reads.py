"""What an Astrolift install reads back about its own agents (#390).

Astrolift shows an organization its agents' usage, policies and audit
records (calliopeai/astrolift-app#1888), asking as the install with the
credential it connected with. Every read is two-tenant: the install's agents
in its tenant, beside another install's agents and a portal-registered agent
in the same tenant, and the same agent names in another tenant. None of
theirs may ever be in the answer.
"""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from zentinelle.models import AgentEndpoint, AuditLog, Policy, UsageMetric
from zentinelle.tests.test_astrolift_agent_keys import mint
from zentinelle.tests.test_astrolift_clusters import (TENANT_A, TENANT_B,
                                                      as_install,
                                                      connect_install,
                                                      make_agent)

ROUTES = {'usage': 'zentinelle:astrolift-usage', 'policies': 'zentinelle:astrolift-policies',
          'audit': 'zentinelle:astrolift-audit-read'}


def read(credential, what, **params):
    return as_install(credential).get(reverse(ROUTES[what]), params)


def spend(agent, model, input_tokens, output_tokens, cost, when=None, deployment=None):
    UsageMetric.record_ai_usage(
        organization=agent.tenant_id, user_identifier='', provider='openai', model=model,
        input_tokens=input_tokens, output_tokens=output_tokens, endpoint=agent,
        deployment=agent.deployment_id_ext if deployment is None else deployment,
        occurred_at=when, metadata={'total_estimated_cost': cost})


class _TwoTenants(TestCase):
    def setUp(self):
        self.credential, self.install = connect_install([TENANT_A])
        self.other_credential, _ = connect_install([TENANT_A], name='astro-other')
        self.b_credential, _ = connect_install([TENANT_B], name='astro-b')
        for agent_id, deployment in (('task-1', 'reviewer'), ('task-2', 'reviewer'), ('task-3', 'writer')):
            self.assertEqual(mint(self.credential, agent_id, deployment_id=deployment).status_code, 201)
        self.assertEqual(mint(self.other_credential, 'other-1', deployment_id='reviewer').status_code, 201)
        self.assertEqual(mint(self.b_credential, 'task-1', deployment_id='reviewer').status_code, 201)
        make_agent(TENANT_A, 'portal-agent')
        AgentEndpoint.objects.filter(agent_id='portal-agent').update(deployment_id_ext='reviewer')

    def agent(self, agent_id, tenant=TENANT_A):
        return AgentEndpoint.objects.get(tenant_id=tenant, agent_id=agent_id)


class AuthenticationAndTenantTests(_TwoTenants):
    def test_each_read_takes_the_install_credential_only(self):
        agent_key = make_agent(TENANT_A, 'keyed')
        for what in ('usage', 'policies', 'audit'):
            with self.subTest(what=what):
                anonymous = self.client.get(reverse(ROUTES[what]), {'since': '2026-01-01T00:00:00Z'})
                self.assertEqual(anonymous.status_code, 401)
                self.assertEqual(read('sk_astroinst_forged', what, since='2026-01-01T00:00:00Z').status_code, 401)
                self.assertEqual(read(agent_key, what, since='2026-01-01T00:00:00Z').status_code, 401)

    def test_a_tenant_the_install_was_not_connected_for_is_refused(self):
        for what in ('usage', 'policies', 'audit'):
            with self.subTest(what=what):
                response = read(self.credential, what, tenant_id=TENANT_B, since='2026-01-01T00:00:00Z')
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()['error'], 'tenant_not_in_install_scope')

    def test_an_install_of_several_tenants_must_name_one(self):
        credential, _ = connect_install([TENANT_A, TENANT_B], name='astro-both')
        response = read(credential, 'policies')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'tenant_required')
        self.assertEqual(read(credential, 'policies', tenant_id=TENANT_B).status_code, 200)

    def test_an_empty_deployment_id_is_refused_rather_than_read_as_everything(self):
        response = read(self.credential, 'policies', deployment_id='')
        self.assertEqual(response.status_code, 400)


class UsageTests(_TwoTenants):
    def setUp(self):
        super().setUp()
        spend(self.agent('task-1'), 'gpt-4o', 100, 10, 0.25)
        spend(self.agent('task-1'), 'gpt-4o', 200, 20, 0.5)
        spend(self.agent('task-2'), 'gpt-4o', 50, 5, 0.125)
        spend(self.agent('task-3'), 'gpt-4o-mini', 7, 3, 0.01)
        spend(self.agent('other-1'), 'gpt-4o', 9000, 900, 90.0)
        spend(self.agent('portal-agent'), 'gpt-4o', 8000, 800, 80.0)
        spend(self.agent('task-1', TENANT_B), 'gpt-4o', 7000, 700, 70.0)
        spend(self.agent('task-1'), 'gpt-4o', 1, 1, 1.0, when=timezone.now() - timedelta(days=40))

    def since(self, days=30):
        return (timezone.now() - timedelta(days=days)).isoformat()

    def test_usage_sums_only_this_installs_agents_per_deployment_provider_and_model(self):
        response = read(self.credential, 'usage', tenant_id=TENANT_A, since=self.since())

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), {'usage': [
            {'deployment_id': 'reviewer', 'provider': 'openai', 'model': 'gpt-4o', 'requests': 3,
             'input_tokens': 350, 'output_tokens': 35, 'cost_usd': 0.875},
            {'deployment_id': 'writer', 'provider': 'openai', 'model': 'gpt-4o-mini', 'requests': 1,
             'input_tokens': 7, 'output_tokens': 3, 'cost_usd': 0.01},
        ]})

    def test_deployment_id_narrows_and_since_bounds_the_window(self):
        rows = read(self.credential, 'usage', since=self.since(), deployment_id='writer').json()['usage']
        self.assertEqual([(r['deployment_id'], r['requests']) for r in rows], [('writer', 1)])

        rows = read(self.credential, 'usage', since=self.since(60), deployment_id='reviewer').json()['usage']
        self.assertEqual(rows[0]['requests'], 4)
        self.assertEqual(rows[0]['cost_usd'], 1.875)

    def test_a_call_keeps_the_deployment_it_was_made_under(self):
        AgentEndpoint.objects.filter(pk=self.agent('task-3').pk).update(deployment_id_ext='renamed')
        spend(self.agent('task-3'), 'gpt-4o-mini', 1, 1, 0.0, deployment='')

        rows = read(self.credential, 'usage', since=self.since()).json()['usage']

        self.assertEqual([(r['deployment_id'], r['requests']) for r in rows],
                         [('renamed', 1), ('reviewer', 3), ('writer', 1)])

    def test_a_cost_that_is_not_a_number_counts_as_none(self):
        UsageMetric.objects.filter(endpoint=self.agent('task-3')).update(metadata={'total_estimated_cost': 'n/a'})
        rows = read(self.credential, 'usage', since=self.since(), deployment_id='writer').json()['usage']
        self.assertEqual(rows[0]['cost_usd'], 0.0)
        self.assertEqual(rows[0]['requests'], 1)

    def test_since_is_required_and_must_be_a_time(self):
        self.assertEqual(read(self.credential, 'usage').status_code, 400)
        self.assertEqual(read(self.credential, 'usage', since='last week').status_code, 400)


class PolicyTests(_TwoTenants):
    def policy(self, name, tenant=TENANT_A, **fields):
        return Policy.objects.create(tenant_id=tenant, name=name, policy_type='rate_limit',
                                     config={'requests_per_minute': 5}, **fields)

    def names(self, **params):
        response = read(self.credential, 'policies', **params)
        self.assertEqual(response.status_code, 200, response.content)
        return [p['name'] for p in response.json()['policies']]

    def test_the_tenants_policies_and_those_scoped_to_this_installs_agents(self):
        self.policy('org', priority=5, description='everyone')
        self.policy('reviewer deployment', scope_type='deployment', scope_deployment_id_ext='reviewer')
        self.policy('task-3 only', scope_type='endpoint', scope_endpoint=self.agent('task-3'))
        self.policy('other install agent', scope_type='endpoint', scope_endpoint=self.agent('other-1'))
        self.policy('portal agent', scope_type='endpoint', scope_endpoint=self.agent('portal-agent'))
        self.policy('unknown deployment', scope_type='deployment', scope_deployment_id_ext='payroll')
        self.policy('off', enabled=False)
        self.policy('disabled mode', enforcement='disabled')
        self.policy('tenant b', tenant=TENANT_B)

        self.assertEqual(self.names(), ['org', 'reviewer deployment', 'task-3 only'])
        org = read(self.credential, 'policies').json()['policies'][0]
        self.assertEqual(org, {'id': str(Policy.objects.get(name='org').id), 'name': 'org',
                               'policy_type': 'rate_limit', 'enforcement': 'enforce',
                               'scope_type': 'organization', 'priority': 5, 'description': 'everyone'})
        self.assertEqual(self.names(deployment_id='writer'), ['org', 'task-3 only'])
        self.assertEqual(self.names(deployment_id='payroll'), ['org'])


class AuditTests(_TwoTenants):
    def records(self, credential=None, **params):
        response = read(credential or self.credential, 'audit', **params)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_only_records_about_this_installs_agents(self):
        task_1 = self.agent('task-1')
        AuditLog.log(tenant_id=TENANT_A, action='update', resource_type='approval_request', resource_id='r1',
                     ext_user_id='alice@example.test', metadata={'endpoint_id': str(task_1.pk)})
        AuditLog.log(tenant_id=TENANT_A, action='access', resource_type='llm_provider_key', resource_id='openai',
                     metadata={'agent_id': 'task-3'})
        AuditLog.log(tenant_id=TENANT_A, action='access', resource_type='llm_provider_key', resource_id='openai',
                     metadata={'agent_id': 'other-1'})
        AuditLog.log(tenant_id=TENANT_A, action='update', resource_type='policy', resource_id='p1')
        AuditLog.log(tenant_id=TENANT_B, action='update', resource_type='approval_request', resource_id='r2',
                     metadata={'agent_id': 'task-1'})

        events = self.records(limit=500)['events']

        agents = {e['agent_id'] for e in events}
        self.assertEqual(agents, {'task-1', 'task-2', 'task-3'})
        approval = next(e for e in events if e['resource_type'] == 'approval_request')
        self.assertEqual((approval['agent_id'], approval['deployment_id'], approval['ext_user_id']),
                         ('task-1', 'reviewer', 'alice@example.test'))
        released = next(e for e in events if e['resource_type'] == 'llm_provider_key')
        self.assertEqual((released['agent_id'], released['deployment_id']), ('task-3', 'writer'))
        self.assertEqual(len([e for e in events if e['resource_type'] == 'llm_provider_key']), 1)
        self.assertNotIn('policy', {e['resource_type'] for e in events})
        self.assertEqual({e['agent_id'] for e in self.records(deployment_id='writer')['events']}, {'task-3'})
        self.assertEqual({e['agent_id'] for e in self.records(self.b_credential)['events']}, {'task-1'})

    def test_the_cursor_walks_every_record_once_oldest_first_and_always_advances(self):
        task_1 = self.agent('task-1')
        tie = timezone.now() + timedelta(seconds=5)
        for n in range(7):
            entry = AuditLog.log(tenant_id=TENANT_A, action='update', resource_type='agent_endpoint',
                                 resource_id=str(task_1.pk), resource_name=f'tie-{n}')
            AuditLog.objects.filter(pk=entry.pk).update(timestamp=tie)
        expected = list(AuditLog.objects.filter(tenant_id=TENANT_A, resource_id=str(task_1.pk)).order_by(
            'timestamp', 'id').values_list('id', flat=True))

        seen, cursors, cursor = [], [], None
        while True:
            page = self.records(limit=3, deployment_id='reviewer', **({'cursor': cursor} if cursor else {}))
            seen += [e['id'] for e in page['events'] if e['agent_id'] == 'task-1']
            self.assertLessEqual(len(page['events']), 3)
            if page['next_cursor'] is None:
                break
            self.assertNotIn(page['next_cursor'], cursors)
            self.assertNotEqual(page['next_cursor'], cursor)
            cursors.append(cursor := page['next_cursor'])

        self.assertEqual(seen, [str(pk) for pk in expected])
        timestamps = [e['timestamp'] for e in self.records(limit=500)['events']]
        self.assertEqual(timestamps, sorted(timestamps))

    def test_a_page_that_is_not_full_is_the_last(self):
        # Each minted agent has its creation and its mint on record.
        page = self.records(limit=500)
        self.assertEqual(len(page['events']), 6)
        self.assertIsNone(page['next_cursor'])
        full = self.records(limit=6)
        self.assertIsNotNone(full['next_cursor'])
        self.assertEqual(self.records(limit=6, cursor=full['next_cursor']), {'events': [], 'next_cursor': None})

    def test_since_and_until_bound_the_records(self):
        mid = timezone.now()
        AuditLog.objects.filter(tenant_id=TENANT_A).update(timestamp=mid + timedelta(hours=1))
        AuditLog.objects.filter(tenant_id=TENANT_A, resource_name='task-1').update(timestamp=mid - timedelta(hours=1))
        before = self.records(until=mid.isoformat())['events']
        after = self.records(since=mid.isoformat())['events']
        self.assertEqual({e['agent_id'] for e in before}, {'task-1'})
        self.assertEqual({e['agent_id'] for e in after}, {'task-2', 'task-3'})

    def test_a_cursor_it_did_not_return_is_refused(self):
        # The last: a real time beside an id that is a number, not a string.
        for cursor in ('garbage', 'WzEsMl0', 'bm90IGpzb24', 'WyIyMDI2LTAxLTAxVDAwOjAwOjAwKzAwOjAwIiwgMTIzXQ'):
            with self.subTest(cursor=cursor):
                response = read(self.credential, 'audit', cursor=cursor)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['error'], 'invalid_cursor')

    def test_an_install_with_no_agents_reads_nothing(self):
        credential, _ = connect_install([TENANT_A], name='astro-empty')
        self.assertEqual(self.records(credential), {'events': [], 'next_cursor': None})
        self.assertEqual(read(credential, 'usage', since='2026-01-01T00:00:00Z').json(), {'usage': []})
