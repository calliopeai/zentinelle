"""Tenant isolation fixes from the October 2026 audit (C1, C2, C4, C5, L2, T1 to T5, T12).

Each case is a way one tenant reached another's data or credentials, and each
failed before its fix. They share the two-tenant fixture in `_two_tenants_portal`:
the same agent name in both tenants, so anything keyed by name alone collides.
"""
import hashlib
import hmac
import importlib
import io
import json
import logging
import sys
import uuid
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.test import Client, override_settings
from django.urls import reverse
from django.utils import timezone

from zentinelle.models import (AgentEndpoint, AstroliftInstall, EnrollmentCode,
                               Event, Incident, LLMProviderKey, Policy, Risk)
from zentinelle.schema import schema
from zentinelle.schema.global_id import to_global_id
from zentinelle.services.behavioral_baseline import set_baseline
from zentinelle.services.event_store import EventStore
from zentinelle.services.policy_simulator import simulate_policy
from zentinelle.tests._graphql_helpers import admin_context
from zentinelle.tests._two_tenants_portal import (SHARED_AGENT_ID, TENANT_A,
                                                  TENANT_B, TwoTenantTestCase,
                                                  make_agent)

BOOTSTRAP_SECRET = 'audit-bootstrap-secret'


def _real_session_state():
    """The real session_state module.

    test_session_quota replaces it in sys.modules with an in-memory stub
    whose counters never persist, which would make every quota pass here.
    """
    name = 'zentinelle.services.session_state'
    module = sys.modules.get(name)
    if getattr(module, '__file__', None):
        return module
    stub = sys.modules.pop(name, None)
    try:
        return importlib.import_module(name)
    finally:
        if stub is not None:
            sys.modules[name] = stub


def _policy(tenant_id, policy_type, config, **fields):
    return Policy.objects.create(
        tenant_id=tenant_id, name=f'{policy_type} for {tenant_id[-2:]}', policy_type=policy_type,
        scope_type=Policy.ScopeType.ORGANIZATION, enforcement=Policy.Enforcement.ENFORCE,
        enabled=True, config=config, **fields)


# ---------------------------------------------------------------------------
# C1: config cache keyed by agent name alone
# ---------------------------------------------------------------------------

class ConfigCacheTests(TwoTenantTestCase):
    def config(self, key):
        return Client().get(reverse('zentinelle:config', kwargs={'agent_id': SHARED_AGENT_ID}),
                            HTTP_X_ZENTINELLE_KEY=key)

    def test_same_agent_name_in_another_tenant_never_reads_the_cached_config(self):
        _policy(TENANT_A, Policy.PolicyType.RATE_LIMIT, {'requests_per_minute': 1},
                description='TENANT-A-CONFIDENTIAL')
        first = self.config(self.key_a)
        self.assertEqual(first.status_code, 200)
        self.assertEqual([p['name'] for p in first.json()['policies']], ['rate_limit for 01'])

        theirs = self.config(self.key_b)

        self.assertEqual(theirs.status_code, 200)
        self.assertEqual(theirs.json()['policies'], [],
                         "tenant B's agent was served tenant A's cached policies")

    def test_deregister_and_invalidate_only_touch_their_own_tenant(self):
        from zentinelle.api.views.config import (config_cache_key,
                                                 invalidate_config_cache)
        self.config(self.key_a)
        self.assertIsNotNone(cache.get(config_cache_key(TENANT_A, SHARED_AGENT_ID)))

        deregistered = Client().post(reverse('zentinelle:deregister'), HTTP_X_ZENTINELLE_KEY=self.key_b)
        self.assertEqual(deregistered.status_code, 204)
        invalidate_config_cache(TENANT_B, SHARED_AGENT_ID)

        self.assertIsNotNone(cache.get(config_cache_key(TENANT_A, SHARED_AGENT_ID)),
                             "tenant B's deregister deleted tenant A's cached config")


# ---------------------------------------------------------------------------
# C1 (event store keys) and C5 (event stream reads)
# ---------------------------------------------------------------------------

def _envelope_event(tenant_id, endpoint, correlation_id, marker):
    event_id = str(uuid.uuid4())
    return Event.objects.create(
        tenant_id=tenant_id, endpoint=endpoint, event_type=Event.EventType.CONFIG_CHANGE,
        event_category=Event.Category.AUDIT, occurred_at=timezone.now(), correlation_id=correlation_id,
        payload={'envelope': {
            'event_id': event_id, 'event_type': 'config_change', 'category': 'audit', 'version': 2,
            'aggregate_id': 'policy-1', 'aggregate_type': 'policy', 'sequence_number': 1,
            'correlation_id': correlation_id, 'causation_id': None,
            'timestamp': timezone.now().isoformat(), 'payload': {'marker': marker}, 'metadata': {},
        }})


@override_settings(CONTENT_CAPTURE_MODE='full')
class EventStoreTenancyTests(TwoTenantTestCase):
    STREAM = '''query { eventStream(aggregateType: "policy", aggregateId: "policy-1") {
        eventCount events { payload } } }'''
    CORRELATION = '''query { eventsByCorrelation(correlationId: "corr-shared") { payload } }'''

    def test_event_stream_shows_only_the_callers_tenant(self):
        _envelope_event(TENANT_A, self.agent_a, 'corr-a', 'mine')
        _envelope_event(TENANT_B, self.agent_b, 'corr-b', 'PLANTED-BY-TENANT-B')

        result = schema.execute_sync(self.STREAM, context_value=admin_context(TENANT_A))

        self.assertIsNone(result.errors)
        self.assertEqual([e['payload'] for e in result.data['eventStream']['events']], [{'marker': 'mine'}])

    def test_events_by_correlation_shows_only_the_callers_tenant(self):
        _envelope_event(TENANT_A, self.agent_a, 'corr-shared', 'mine')
        _envelope_event(TENANT_B, self.agent_b, 'corr-shared', 'THEIRS')

        result = schema.execute_sync(self.CORRELATION, context_value=admin_context(TENANT_A))

        self.assertIsNone(result.errors)
        self.assertEqual([e['payload'] for e in result.data['eventsByCorrelation']], [{'marker': 'mine'}])

    def test_sequence_and_snapshot_keys_are_per_tenant(self):
        store = EventStore()
        self.assertEqual(store._next_sequence(TENANT_A, 'policy', 'policy-1'), 1)
        self.assertEqual(store._next_sequence(TENANT_B, 'policy', 'policy-1'), 1)

        store.save_snapshot(TENANT_A, 'policy', 'policy-1', {'secret': 'a'}, 1)
        self.assertIsNone(store.get_snapshot(TENANT_B, 'policy', 'policy-1'))
        self.assertEqual(store.get_snapshot(TENANT_A, 'policy', 'policy-1')['state'], {'secret': 'a'})


# ---------------------------------------------------------------------------
# C2: bootstrap re-register takeover
# ---------------------------------------------------------------------------

@patch.dict('os.environ', {'ZENTINELLE_BOOTSTRAP_SECRET': BOOTSTRAP_SECRET}, clear=False)
class ReregisterTests(TwoTenantTestCase):
    def setUp(self):
        super().setUp()
        # Both fixture agents stand for agents the bootstrap path made; the
        # creation-path tests below make their own.
        AgentEndpoint.objects.filter(agent_id=SHARED_AGENT_ID).update(bootstrap_registered=True)
        self.agent_a.refresh_from_db()

    def register(self, tenant_id, agent_type=AgentEndpoint.AgentType.CUSTOM, agent_id=SHARED_AGENT_ID):
        signature = hmac.new(BOOTSTRAP_SECRET.encode(), tenant_id.encode(), hashlib.sha256).hexdigest()
        return Client().post(
            reverse('zentinelle:register'),
            data=json.dumps({'agent_id': agent_id, 'agent_type': agent_type, 'name': 'again'}),
            content_type='application/json', HTTP_X_ZENTINELLE_BOOTSTRAP=f'bt_{tenant_id}_{signature}')

    def assert_untouched(self, endpoint, response, error):
        hash_before = endpoint.api_key_hash
        status_before, type_before = endpoint.status, endpoint.agent_type
        self.assertEqual(response.status_code, 409, response.content)
        self.assertEqual(response.json()['error'], error)
        endpoint.refresh_from_db()
        self.assertEqual(endpoint.api_key_hash, hash_before)
        self.assertEqual(endpoint.status, status_before)
        self.assertEqual(endpoint.agent_type, type_before)

    def test_a_running_agent_restarts_with_a_fresh_key(self):
        response = self.register(TENANT_A)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.evaluate(response.json()['api_key']).status_code, 200)
        self.assertEqual(self.evaluate(self.key_b).status_code, 200,
                         "re-registering tenant A's agent touched tenant B's")

    def test_a_suspended_agent_stays_suspended(self):
        AgentEndpoint.objects.filter(pk=self.agent_a.pk).update(status=AgentEndpoint.Status.SUSPENDED)
        self.agent_a.refresh_from_db()

        self.assert_untouched(self.agent_a, self.register(TENANT_A), 'agent_stopped')

    def test_a_suspend_during_the_re_register_stands(self):
        real_generate = AgentEndpoint.generate_api_key

        def suspend_then_generate():
            AgentEndpoint.objects.filter(pk=self.agent_a.pk).update(status=AgentEndpoint.Status.SUSPENDED)
            return real_generate()

        with patch.object(AgentEndpoint, 'generate_api_key', side_effect=suspend_then_generate):
            self.register(TENANT_A)

        self.agent_a.refresh_from_db()
        self.assertEqual(self.agent_a.status, AgentEndpoint.Status.SUSPENDED)

    def test_a_terminated_agent_stays_terminated(self):
        AgentEndpoint.objects.filter(pk=self.agent_a.pk).update(status=AgentEndpoint.Status.TERMINATED)
        self.agent_a.refresh_from_db()

        self.assert_untouched(self.agent_a, self.register(TENANT_A), 'agent_stopped')

    def test_a_re_register_cannot_change_the_agent_type(self):
        self.assert_untouched(
            self.agent_a, self.register(TENANT_A, AgentEndpoint.AgentType.AGENT_HOST), 'agent_type_mismatch')

    def test_an_operator_key_with_a_lifetime_is_not_replaced(self):
        AgentEndpoint.objects.filter(pk=self.agent_a.pk).update(
            api_key_expires_at=timezone.now() + timedelta(hours=1))
        self.agent_a.refresh_from_db()

        self.assert_untouched(self.agent_a, self.register(TENANT_A), 'agent_id_taken')

    def test_an_astrolift_minted_agent_is_not_taken_over(self):
        code = EnrollmentCode.objects.create(code_hash='0' * 64, tenant_ids=[TENANT_A], created_by='test',
                                             expires_at=timezone.now())
        install = AstroliftInstall.objects.create(
            name='astro', base_url='https://astro.example.test', tenant_ids=[TENANT_A],
            enrollment_code=code, key_prefix='x', key_hash='x')
        AgentEndpoint.objects.filter(pk=self.agent_a.pk).update(astrolift_install=install)
        self.agent_a.refresh_from_db()

        self.assert_untouched(self.agent_a, self.register(TENANT_A), 'agent_id_taken')

    def test_an_agent_the_register_path_made_restarts(self):
        first = self.register(TENANT_A, agent_id='sdk-bot')
        self.assertEqual(first.status_code, 201, first.content)

        again = self.register(TENANT_A, agent_id='sdk-bot')

        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual(self.evaluate(again.json()['api_key']).status_code, 200)

    def test_a_portal_agent_is_not_taken_over(self):
        result = schema.execute_sync(
            '''mutation($input: CreateAgentEndpointInput!) {
                createAgentEndpoint(input: $input) { success error apiKey } }''',
            variable_values={'input': {'name': 'Portal bot', 'agentId': 'portal-bot', 'agentType': 'custom'}},
            context_value=admin_context(TENANT_A))
        self.assertIsNone(result.errors)
        self.assertTrue(result.data['createAgentEndpoint']['success'], result.data)
        agent = AgentEndpoint.objects.get(tenant_id=TENANT_A, agent_id='portal-bot')
        AgentEndpoint.objects.filter(pk=agent.pk).update(status=AgentEndpoint.Status.ACTIVE)
        agent.refresh_from_db()

        self.assert_untouched(agent, self.register(TENANT_A, agent_id='portal-bot'), 'agent_id_taken')

    def test_an_operator_agent_without_a_lifetime_is_not_taken_over(self):
        from rest_framework.test import APIClient

        from zentinelle.api.auth import ZentinelleServiceUser
        operator = APIClient()
        operator.force_authenticate(user=ZentinelleServiceUser(
            SimpleNamespace(tenant_id=TENANT_A, scopes=['read', 'write'], is_active=True, pk=1, id=1)))
        minted = operator.post(reverse('zentinelle:operator-agents'),
                               {'agent_id': 'operator-bot', 'name': 'operator bot'}, format='json')
        self.assertEqual(minted.status_code, 201, minted.content)
        self.assertIsNone(minted.data['expires_at'])
        agent = AgentEndpoint.objects.get(tenant_id=TENANT_A, agent_id='operator-bot')

        self.assert_untouched(agent, self.register(TENANT_A, agent_id='operator-bot'), 'agent_id_taken')
        self.assertEqual(self.evaluate(minted.data['api_key']).status_code, 200,
                         "the operator's key stopped working")

    def test_an_agent_from_any_other_path_is_not_taken_over(self):
        # The marker defaults off, so an agent made by a management command,
        # a seed or a path added later is refused without knowing about it.
        agent, _ = make_agent(TENANT_A, agent_id='command-bot')

        self.assert_untouched(agent, self.register(TENANT_A, agent_id='command-bot'), 'agent_id_taken')

    def test_an_operator_can_allow_a_known_sdk_agent_to_restart(self):
        agent, _ = make_agent(TENANT_A, agent_id='old-sdk-bot')
        make_agent(TENANT_B, agent_id='old-sdk-bot')

        call_command('allow_bootstrap_reregister', '--tenant', TENANT_A, 'old-sdk-bot', stdout=io.StringIO())

        self.assertEqual(self.register(TENANT_A, agent_id='old-sdk-bot').status_code, 200)
        self.assertFalse(AgentEndpoint.objects.get(tenant_id=TENANT_B, agent_id='old-sdk-bot').bootstrap_registered,
                         "allowing tenant A's agent allowed tenant B's")
        with self.assertRaises(CommandError):
            call_command('allow_bootstrap_reregister', '--tenant', TENANT_A, 'nobody', stdout=io.StringIO())


# ---------------------------------------------------------------------------
# C4, T1, T2: evaluators keyed by caller-supplied identity
# ---------------------------------------------------------------------------

class EvaluatorIdentityTests(TwoTenantTestCase):
    def setUp(self):
        super().setUp()
        name = 'zentinelle.services.session_state'
        if name in sys.modules:
            self.addCleanup(sys.modules.__setitem__, name, sys.modules[name])
        else:
            self.addCleanup(sys.modules.pop, name, None)
        sys.modules[name] = _real_session_state()

    def test_rate_limit_counts_each_tenant_and_agent_separately(self):
        for tenant in (TENANT_A, TENANT_B):
            _policy(tenant, Policy.PolicyType.RATE_LIMIT, {'requests_per_minute': 2})

        for _ in range(2):
            self.assertTrue(self.evaluate(self.key_a).json()['allowed'])

        self.assertTrue(self.evaluate(self.key_b).json()['allowed'],
                        "tenant A's calls used up tenant B's rate limit")

    def test_rate_limit_cannot_be_reset_by_the_caller(self):
        _policy(TENANT_B, Policy.PolicyType.RATE_LIMIT, {'requests_per_minute': 2})
        for _ in range(2):
            self.assertTrue(self.evaluate(self.key_b).json()['allowed'])

        reset = self.evaluate(self.key_b, {'endpoint_id': uuid.uuid4().hex})

        self.assertFalse(reset.json()['allowed'], 'a caller-chosen endpoint_id reset the rate limit')

    def test_rate_limit_cannot_be_reset_with_a_caller_user_id(self):
        _policy(TENANT_B, Policy.PolicyType.RATE_LIMIT, {'requests_per_minute': 2})
        for _ in range(2):
            self.assertTrue(self.evaluate(self.key_b, user_id='alice').json()['allowed'])

        reset = self.evaluate(self.key_b, user_id=uuid.uuid4().hex)

        self.assertFalse(reset.json()['allowed'], 'a caller-chosen user_id reset the rate limit')

    def test_a_verified_user_still_gets_their_own_rate_limit(self):
        from zentinelle.services.policy_engine import PolicyEngine
        _policy(TENANT_B, Policy.PolicyType.RATE_LIMIT, {'requests_per_minute': 2})
        for _ in range(2):
            PolicyEngine().evaluate(self.agent_b, 'tool_call', user_id='hub:h:alice', user_verified=True)

        self.assertFalse(PolicyEngine().evaluate(self.agent_b, 'tool_call', user_id='hub:h:alice',
                                                 user_verified=True).allowed)
        self.assertTrue(PolicyEngine().evaluate(self.agent_b, 'tool_call', user_id='hub:h:bob',
                                                user_verified=True).allowed)

    def test_daily_tokens_cannot_be_wound_back(self):
        # The evaluator directly: /evaluate canonicalises ai_request to
        # llm:invoke, so the daily token check never runs from there.
        from zentinelle.services.evaluators.rate_limit import \
            RateLimitEvaluator
        policy = _policy(TENANT_B, Policy.PolicyType.RATE_LIMIT, {'tokens_per_day': 100})
        identity = {'_tenant_id': TENANT_B, '_endpoint_id': str(self.agent_b.pk)}

        def spend(tokens):
            return RateLimitEvaluator().evaluate(policy, 'ai_request', None, {**identity, 'tokens': tokens}).passed

        self.assertTrue(spend(100))
        spend(-1000)
        self.assertFalse(spend(50), 'a negative token count wound the daily counter back')

    def test_session_quota_cannot_be_wound_back(self):
        _policy(TENANT_B, Policy.PolicyType.SESSION_QUOTA, {'max_tool_calls': 2})
        self.assertTrue(self.evaluate(self.key_b, {'session_id': 's', 'tool_call_count': 2}).json()['allowed'])

        self.evaluate(self.key_b, {'session_id': 's', 'tool_call_count': -100})

        self.assertFalse(self.evaluate(self.key_b, {'session_id': 's', 'tool_call_count': 1}).json()['allowed'],
                         'a negative tool_call_count wound the session counter back')

    def test_session_quota_counters_are_per_tenant(self):
        for tenant in (TENANT_A, TENANT_B):
            _policy(tenant, Policy.PolicyType.SESSION_QUOTA, {'max_tool_calls': 2})
        session = {'session_id': 'shared-session', 'tool_call_count': 1}
        for _ in range(2):
            self.assertTrue(self.evaluate(self.key_a, session).json()['allowed'])

        theirs = self.evaluate(self.key_b, session)

        self.assertTrue(theirs.json()['allowed'], "tenant A's session counters refused tenant B's call")

    def test_session_quota_cannot_be_reset_with_a_caller_tenant(self):
        _policy(TENANT_B, Policy.PolicyType.SESSION_QUOTA, {'max_tool_calls': 2})
        session = {'session_id': 'mine', 'tool_call_count': 1}
        for _ in range(2):
            self.assertTrue(self.evaluate(self.key_b, session).json()['allowed'])

        reset = self.evaluate(self.key_b, {**session, 'tenant_id': 'anything-else'})

        self.assertFalse(reset.json()['allowed'], 'a caller-chosen tenant_id reset the session quota')

    def _baselines(self):
        config = {'action_on_anomaly': 'block', 'min_samples_before_enforce': 50,
                  'token_usage_deviation_threshold': 5.0}
        for tenant in (TENANT_A, TENANT_B):
            _policy(tenant, Policy.PolicyType.BEHAVIORAL_BASELINE, config)
        set_baseline(TENANT_A, SHARED_AGENT_ID, {'sample_count': 100, 'token_usage_p95': 1234})

    def test_behavioral_baseline_never_reads_another_tenants_baseline(self):
        self._baselines()

        theirs = self.evaluate(self.key_b, {'tokens_used': 100000, 'agent_id': SHARED_AGENT_ID,
                                            'tenant_id': TENANT_A})

        self.assertTrue(theirs.json()['allowed'], theirs.json()['reason'])
        self.assertNotIn('1234', json.dumps(theirs.json()))

    def test_behavioral_baseline_applies_to_the_tenants_own_agent(self):
        self._baselines()

        mine = self.evaluate(self.key_a, {'tokens_used': 100000})

        self.assertFalse(mine.json()['allowed'], 'the baseline was never checked for its own agent')

    def test_simulator_counts_the_events_own_tenant_and_agent(self):
        for tenant in (TENANT_A, TENANT_B):
            _policy(tenant, Policy.PolicyType.RATE_LIMIT, {'requests_per_minute': 2})
        Event.objects.create(tenant_id=TENANT_B, endpoint=self.agent_b, event_type=Event.EventType.TOOL_CALL,
                             occurred_at=timezone.now(), payload={'action': 'tool_call', 'context': {}})
        proposal = {'policy_type': 'rate_limit', 'config': {'requests_per_minute': 2}}
        for _ in range(2):
            self.evaluate(self.key_a)

        self.assertEqual(simulate_policy(TENANT_B, proposal)['would_block'], 0,
                         "tenant A's traffic decided tenant B's simulation")

        for _ in range(2):
            self.evaluate(self.key_b)
        self.assertGreater(simulate_policy(TENANT_B, proposal)['would_block'], 0,
                           "the simulation did not count the event's own agent")


# ---------------------------------------------------------------------------
# L2: unauthenticated /assistant/providers
# ---------------------------------------------------------------------------

@override_settings(AUTH_MODE='local')
class AssistantProvidersAuthTests(TwoTenantTestCase):
    def test_anonymous_callers_are_refused(self):
        response = Client().get(reverse('zentinelle:assistant-providers'), {'live': 'false'})
        self.assertIn(response.status_code, (401, 403))

    def test_agent_keys_are_refused(self):
        response = Client().get(reverse('zentinelle:assistant-providers'), {'live': 'false'},
                                HTTP_X_ZENTINELLE_KEY=self.key_b)
        self.assertIn(response.status_code, (401, 403))

    def test_a_portal_user_still_reads_it(self):
        from django.contrib.auth.models import User
        client = Client()
        client.force_login(User.objects.create_superuser('portal-admin', 'a@example.test', 'pw'))
        response = client.get(reverse('zentinelle:assistant-providers'), {'live': 'false'})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn('providers', response.json())


# ---------------------------------------------------------------------------
# T12: createIncident links rows from other tenants
# ---------------------------------------------------------------------------

class CreateIncidentTenancyTests(TwoTenantTestCase):
    MUTATION = '''mutation($input: CreateIncidentInput!) {
        createIncident(input: $input) { success errors } }'''

    def create(self, **links):
        return schema.execute_sync(self.MUTATION, variable_values={'input': {
            'title': 'Linked', 'description': 'x', **links}}, context_value=admin_context(TENANT_A))

    def test_another_tenants_agent_cannot_be_linked(self):
        result = self.create(endpointId=to_global_id('AgentEndpoint', str(self.agent_b.pk)))

        self.assertIsNone(result.errors)
        self.assertFalse(result.data['createIncident']['success'])
        self.assertFalse(Incident.objects.filter(endpoint=self.agent_b).exists())

    def test_another_tenants_risk_cannot_be_linked(self):
        theirs = Risk.objects.create(tenant_id=TENANT_B, name='Their risk', description='x')

        result = self.create(relatedRiskId=to_global_id('Risk', str(theirs.pk)))

        self.assertIsNone(result.errors)
        self.assertFalse(result.data['createIncident']['success'])
        self.assertFalse(Incident.objects.filter(related_risk=theirs).exists())

    def test_own_tenants_rows_still_link(self):
        mine = Risk.objects.create(tenant_id=TENANT_A, name='My risk', description='x')

        result = self.create(endpointId=to_global_id('AgentEndpoint', str(self.agent_a.pk)),
                             relatedRiskId=to_global_id('Risk', str(mine.pk)))

        self.assertTrue(result.data['createIncident']['success'], result.data)
        incident = Incident.objects.get(endpoint=self.agent_a)
        self.assertEqual((incident.tenant_id, incident.related_risk_id), (TENANT_A, mine.pk))

    def test_raw_ids_link_like_relay_ids(self):
        # The portal sends raw UUIDs (H14); they decoded to nothing here.
        mine = Risk.objects.create(tenant_id=TENANT_A, name='My risk', description='x')

        result = self.create(endpointId=str(self.agent_a.pk), relatedRiskId=str(mine.pk),
                             deploymentId='dep-ext-1')

        self.assertTrue(result.data['createIncident']['success'], result.data)
        incident = Incident.objects.get(endpoint=self.agent_a)
        self.assertEqual((incident.related_risk_id, incident.deployment_id_ext), (mine.pk, 'dep-ext-1'))

    def test_another_tenants_raw_ids_cannot_be_linked(self):
        theirs = Risk.objects.create(tenant_id=TENANT_B, name='Their risk', description='x')

        for links in ({'endpointId': str(self.agent_b.pk)}, {'relatedRiskId': str(theirs.pk)}):
            with self.subTest(**links):
                result = self.create(**links)
                self.assertIsNone(result.errors)
                self.assertFalse(result.data['createIncident']['success'])
        self.assertFalse(Incident.objects.exists())


# ---------------------------------------------------------------------------
# T3, T4, T5: the Django proxy
# ---------------------------------------------------------------------------

_RealClient = httpx.Client
ENV_KEYS = {
    'OPENAI_API_KEY': 'sk-INSTALL-WIDE-OPENAI-KEY',
    'ANTHROPIC_API_KEY': 'sk-ant-INSTALL-WIDE-ANTHROPIC-KEY',
    'GOOGLE_API_KEY': 'AIza-INSTALL-WIDE-GOOGLE-KEY',
}


@patch.dict('os.environ', ENV_KEYS, clear=False)
class ProxyTenancyTests(TwoTenantTestCase):
    def setUp(self):
        super().setUp()
        self.sent = []

        def handler(request):
            self.sent.append(request)
            return httpx.Response(200, json={'ok': True})

        class Recording(_RealClient):
            def __init__(self, *args, **kwargs):
                kwargs['transport'] = httpx.MockTransport(handler)
                super().__init__(*args, **kwargs)

        patcher = patch('httpx.Client', Recording)
        patcher.start()
        self.addCleanup(patcher.stop)

    def proxy(self, key, provider, path, method='post', **headers):
        return Client().generic(
            method.upper(), f'/proxy/{provider}/{path}', json.dumps({'model': 'm'}),
            content_type='application/json', HTTP_X_ZENTINELLE_KEY=key, **headers)

    # T3 ------------------------------------------------------------------
    def test_vertex_region_cannot_choose_the_upstream_host(self):
        response = self.proxy(self.key_b, 'vertex', 'publishers/google/models/gemini:generateContent',
                              HTTP_X_VERTEX_REGION='attacker.example/collect?x=', HTTP_X_VERTEX_PROJECT='my-project')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.sent, [])

    def test_vertex_project_must_be_a_project_id(self):
        response = self.proxy(self.key_b, 'vertex', 'publishers/google/models/gemini:generateContent',
                              HTTP_X_VERTEX_REGION='us-central1', HTTP_X_VERTEX_PROJECT='x/../../evil')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.sent, [])

    def test_vertex_network_policy_sees_the_real_upstream(self):
        _policy(TENANT_B, Policy.PolicyType.NETWORK_POLICY,
                {'allowed_domains': ['aiplatform.googleapis.com'], 'allow_outbound': True})

        response = self.proxy(self.key_b, 'vertex', 'publishers/google/models/gemini:generateContent',
                              HTTP_X_VERTEX_REGION='us-central1', HTTP_X_VERTEX_PROJECT='my-project')

        self.assertEqual(response.status_code, 403, 'the policy was shown a host the request does not go to')
        self.assertEqual(self.sent, [])

    # T4 ------------------------------------------------------------------
    def test_a_tenant_without_a_stored_key_never_gets_the_install_key(self):
        response = self.proxy(self.key_b, 'openai', 'chat/completions', HTTP_AUTHORIZATION='Bearer sk-tenant-b-own')

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.sent[-1].headers['authorization'], 'Bearer sk-tenant-b-own')

    def test_each_tenant_runs_on_its_own_stored_key(self):
        record = LLMProviderKey(tenant_id=TENANT_A, provider='anthropic')
        record.set_key('sk-ant-TENANT-A-OWN')
        record.save()

        self.proxy(self.key_a, 'anthropic', 'v1/messages')
        self.proxy(self.key_b, 'anthropic', 'v1/messages')

        self.assertEqual(self.sent[0].headers['x-api-key'], 'sk-ant-TENANT-A-OWN')
        self.assertNotIn('x-api-key', self.sent[1].headers)

    def test_an_unreadable_stored_key_does_not_fall_back(self):
        LLMProviderKey.objects.create(tenant_id=TENANT_B, provider='openai', encrypted_key=b'not-fernet')

        with override_settings(ALLOW_ENV_PROVIDER_KEYS=True):
            response = self.proxy(self.key_b, 'openai', 'chat/completions')

        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.sent, [])

    def test_the_injected_key_replaces_the_clients_whatever_its_case(self):
        for provider, path, header in (('anthropic', 'v1/messages', 'x-api-key'),
                                       ('google', 'v1beta/models/gemini:generateContent', 'x-goog-api-key')):
            record = LLMProviderKey(tenant_id=TENANT_A, provider=provider)
            record.set_key(f'{provider}-TENANT-A-STORED')
            record.save()
            with self.subTest(provider=provider):
                self.proxy(self.key_a, provider, path, **{f"HTTP_{header.upper().replace('-', '_')}": 'CLIENT-OWN'})

                self.assertEqual(self.sent[-1].headers.get_list(header), [f'{provider}-TENANT-A-STORED'])

    @override_settings(ALLOW_ENV_PROVIDER_KEYS=True)
    def test_vertex_never_gets_the_gemini_env_key(self):
        self.proxy(self.key_b, 'vertex', 'publishers/google/models/gemini:generateContent',
                   HTTP_X_VERTEX_REGION='us-central1', HTTP_X_VERTEX_PROJECT='my-project',
                   HTTP_AUTHORIZATION='Bearer ya29.caller-oauth')

        self.assertEqual(self.sent[-1].headers['authorization'], 'Bearer ya29.caller-oauth')

    @override_settings(ALLOW_ENV_PROVIDER_KEYS=True)
    def test_env_keys_serve_only_a_declared_single_tenant_install(self):
        self.proxy(self.key_b, 'openai', 'chat/completions')

        self.assertEqual(self.sent[-1].headers['authorization'], 'Bearer sk-INSTALL-WIDE-OPENAI-KEY')

    def test_only_inference_paths_are_forwarded(self):
        for method, provider, path in (('get', 'openai', 'files'), ('post', 'openai', 'files'),
                                       ('delete', 'openai', 'files/file-1'), ('get', 'anthropic', 'v1/models'),
                                       ('post', 'openai', 'fine_tuning/jobs'),
                                       ('post', 'google', 'v1beta/files')):
            with self.subTest(method=method, path=path):
                response = self.proxy(self.key_b, provider, path, method=method)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()['error'], 'path_not_allowed')
        self.assertEqual(self.sent, [])

    def test_inference_paths_are_forwarded(self):
        for provider, path, extra in (
                ('openai', 'chat/completions', {}), ('openai', 'responses', {}),
                ('anthropic', 'v1/messages', {}),
                ('google', 'v1beta/models/gemini-2.5-pro:generateContent', {}),
                ('google', 'v1beta/models/text-embedding-004:batchEmbedContents', {}),
                ('vertex', 'publishers/google/models/gemini-2.5-pro:streamGenerateContent',
                 {'HTTP_X_VERTEX_REGION': 'us-central1', 'HTTP_X_VERTEX_PROJECT': 'my-project'})):
            with self.subTest(provider=provider, path=path):
                self.assertEqual(self.proxy(self.key_b, provider, path, **extra).status_code, 200)
        self.assertEqual(self.sent[-1].url.host, 'us-central1-aiplatform.googleapis.com')

    # T5 ------------------------------------------------------------------
    @override_settings(ALLOW_ENV_PROVIDER_KEYS=True)
    def test_provider_keys_never_reach_the_log(self):
        with self.assertLogs('zentinelle.proxy.views', level=logging.INFO) as logs:
            self.proxy(self.key_a, 'anthropic', 'v1/messages', HTTP_X_API_KEY='sk-ant-CLIENT-SUPPLIED')
            self.proxy(self.key_a, 'openai', 'chat/completions', HTTP_AUTHORIZATION='Bearer sk-CLIENT-SUPPLIED')
            self.proxy(self.key_a, 'google', 'v1beta/models/gemini:generateContent?key=AIza-IN-QUERY')

        output = '\n'.join(logs.output)
        self.assertIn('x-api-key', output)
        for secret in ('INSTALL-WIDE', 'CLIENT-SUPPLIED', 'AIza-IN-QUERY', 'sk-ant', 'sk-'):
            self.assertNotIn(secret, output)
