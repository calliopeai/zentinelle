"""Agent host identity and the tool_call evaluate contract, with holds (#377).

One agent_host key serves every session an Agent Host Protocol host runs. Each
tool call names its harness, session and tool. A call blocked only for want of
a human approval is held (`ask`): the host polls the approval request until an
operator decides it or it expires, then retries with the approval token.
"""
import hashlib
import hmac
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from zentinelle.auth.roles import ROLE_OPERATOR, ROLE_VIEWER, assign_role
from zentinelle.models import AgentEndpoint, ApprovalRequest, Event, Policy
from zentinelle.models.compliance import InteractionLog

# Portal sessions resolve to the standalone tenant.
TENANT = '00000000-0000-0000-0000-000000000001'
BOOTSTRAP_SECRET = 'agent-host-test-bootstrap-secret'


def host_tool_call(session_id='session-1', harness='claude', tool_name='Bash', **context):
    return {
        'action': 'tool_call',
        'user_id': 'user-1',
        'context': {
            'harness': harness, 'session_id': session_id, 'chat_id': f'{session_id}-chat',
            'tool_call_id': f'{session_id}-call', 'tool_name': tool_name,
            'tool_input': {'command': 'ls -la'}, **context,
        },
    }


@override_settings(AUTH_MODE='local')
class AgentHostTestCase(TestCase):
    def setUp(self):
        self.host, self.key = self.make_endpoint('agenthost-dev', AgentEndpoint.AgentType.AGENT_HOST)

    @staticmethod
    def make_endpoint(agent_id, agent_type, tenant_id=TENANT):
        key, key_hash, prefix = AgentEndpoint.generate_api_key()
        endpoint = AgentEndpoint.objects.create(
            tenant_id=tenant_id, agent_id=agent_id, name=agent_id, agent_type=agent_type,
            api_key_hash=key_hash, api_key_prefix=prefix,
        )
        return endpoint, key

    @staticmethod
    def as_agent(key):
        client = APIClient()
        client.credentials(HTTP_X_ZENTINELLE_KEY=key)
        return client

    @staticmethod
    def as_portal(username, role):
        user = get_user_model().objects.create_user(username=username, password='test-only-pass')
        assign_role(user, role)
        client = APIClient()
        client.force_login(user)
        return client

    @staticmethod
    def require_approval_for(tool_name, tenant_id=TENANT):
        return Policy.objects.create(
            tenant_id=tenant_id, name=f'{tool_name} needs a human',
            policy_type=Policy.PolicyType.TOOL_PERMISSION, config={'requires_approval': [tool_name]},
        )

    def evaluate(self, body, key=None):
        return self.as_agent(key or self.key).post(reverse('zentinelle:evaluate'), body, format='json')

    def poll(self, request_id, key=None):
        return self.as_agent(key or self.key).get(
            reverse('zentinelle:approval-request', kwargs={'request_id': request_id}))

    @staticmethod
    def decide(client, request_id, decision, reason=''):
        return client.post(
            reverse('zentinelle:approval-request-decision', kwargs={'request_id': request_id}),
            {'decision': decision, 'reason': reason}, format='json',
        )


class AgentHostIdentityTests(AgentHostTestCase):

    @patch.dict('os.environ', {'ZENTINELLE_BOOTSTRAP_SECRET': BOOTSTRAP_SECRET}, clear=False)
    def test_a_host_registers_once_as_agent_host(self):
        signature = hmac.new(BOOTSTRAP_SECRET.encode(), TENANT.encode(), hashlib.sha256).hexdigest()
        registered = APIClient().post(
            reverse('zentinelle:register'),
            {'agent_id': 'agenthost-leo', 'agent_type': 'agent_host', 'name': 'Agent host'},
            format='json', HTTP_X_ZENTINELLE_BOOTSTRAP=f'bt_{TENANT}_{signature}',
        )
        self.assertEqual(registered.status_code, 201, registered.json())
        endpoint = AgentEndpoint.objects.get(tenant_id=TENANT, agent_id='agenthost-leo')
        self.assertEqual(endpoint.agent_type, AgentEndpoint.AgentType.AGENT_HOST)

        evaluated = self.evaluate(host_tool_call(), key=registered.json()['api_key'])
        self.assertEqual(evaluated.status_code, 200, evaluated.json())
        self.assertEqual(evaluated.json()['decision'], 'allow')
        self.assertEqual(evaluated.json()['subject']['agent_id'], 'agenthost-leo')
        self.assertEqual(evaluated.json()['resource'], {'type': 'tool', 'id': 'Bash'})

    def test_one_host_key_serves_many_sessions(self):
        first = self.evaluate(host_tool_call('session-1', 'claude', 'Bash'))
        second = self.evaluate(host_tool_call('session-2', 'codex', 'Read'))
        self.assertEqual([first.status_code, second.status_code], [200, 200])
        self.assertEqual(AgentEndpoint.objects.filter(tenant_id=TENANT).count(), 1)

        contexts = {event.payload['context']['session_id']: event.payload['context']
                    for event in Event.objects.filter(endpoint=self.host)}
        self.assertEqual(set(contexts), {'session-1', 'session-2'})
        self.assertEqual(contexts['session-1']['harness'], 'claude')
        self.assertEqual(contexts['session-2']['harness'], 'codex')
        self.assertEqual(contexts['session-2']['chat_id'], 'session-2-chat')
        self.assertEqual(contexts['session-2']['tool_name'], 'Read')
        # Metadata capture is the default: tool arguments are evaluated, not kept.
        self.assertNotIn('tool_input', contexts['session-1'])

        interactions = {log.session_id: log for log in InteractionLog.objects.filter(endpoint=self.host)}
        self.assertEqual(set(interactions), {'session-1', 'session-2'})
        self.assertIn('Read', interactions['session-2'].topics)

    def test_a_host_tool_call_must_name_its_harness_session_and_tool(self):
        for field in ('harness', 'session_id', 'tool_name'):
            body = host_tool_call()
            del body['context'][field]
            response = self.evaluate(body)
            self.assertEqual(response.status_code, 400, field)
            self.assertIn(field, response.json()['context'])
        response = self.evaluate(host_tool_call(harness='Claude Code'))
        self.assertEqual(response.status_code, 400)
        self.assertIn('harness', response.json()['context'])
        self.assertFalse(Event.objects.filter(endpoint=self.host).exists())

    def test_other_agent_types_keep_their_tool_call_contract(self):
        _, key = self.make_endpoint('claude-hook', AgentEndpoint.AgentType.CLAUDE_CODE)
        response = self.evaluate({'action': 'tool_call', 'context': {'tool': 'Bash'}}, key=key)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['decision'], 'allow')


class AgentHostHoldTests(AgentHostTestCase):

    def test_a_call_that_only_needs_approval_is_held(self):
        self.require_approval_for('Bash')
        response = self.evaluate(host_tool_call())
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['decision'], 'ask')
        self.assertFalse(body['allowed'])
        self.assertIn('requires approval', body['reason'])
        self.assertEqual(body['approval']['status'], 'pending')
        self.assertEqual(body['approval']['timeout_seconds'], 300)

        held = ApprovalRequest.objects.get(pk=body['approval']['request_id'])
        self.assertEqual((held.tenant_id, held.endpoint_id_ext, held.subject, held.action),
                         (TENANT, str(self.host.pk), 'user-1', 'tool_call'))
        self.assertEqual(held.trace_id, body['trace_id'])
        self.assertAlmostEqual((held.expires_at - held.created_at).total_seconds(), 300, delta=5)
        self.assertEqual((held.context['session_id'], held.context['tool_name']), ('session-1', 'Bash'))
        self.assertNotIn('tool_input', held.context)
        event = Event.objects.get(endpoint=self.host)
        self.assertEqual(event.payload['result']['decision'], 'ask')
        self.assertEqual(event.payload['approval_request_id'], str(held.pk))

        other_tool = self.evaluate(host_tool_call(tool_name='Read')).json()
        self.assertEqual(other_tool['decision'], 'allow')
        self.assertNotIn('approval', other_tool)

    def test_an_operator_approval_releases_the_held_call_once(self):
        self.require_approval_for('Bash')
        request_id = self.evaluate(host_tool_call()).json()['approval']['request_id']

        pending = self.poll(request_id)
        self.assertEqual(pending.status_code, 200)
        self.assertEqual(pending.json()['status'], 'pending')
        self.assertNotIn('approval_token', pending.json())

        operator = self.as_portal('approver', ROLE_OPERATOR)
        decided = self.decide(operator, request_id, 'approve', 'expected build step')
        self.assertEqual(decided.status_code, 200, decided.json())
        self.assertEqual(decided.json()['status'], 'approved')
        approved = self.poll(request_id).json()
        self.assertEqual(approved['status'], 'approved')

        retry = self.evaluate(host_tool_call(approval_token=approved['approval_token'])).json()
        self.assertEqual(retry['decision'], 'allow', retry)
        self.assertTrue(retry['allowed'])
        replay = self.evaluate(host_tool_call(approval_token=approved['approval_token'])).json()
        self.assertEqual(replay['decision'], 'deny')
        self.assertEqual(ApprovalRequest.objects.count(), 1)
        self.assertEqual(self.decide(operator, request_id, 'deny').status_code, 409)

    def test_an_approval_cannot_release_a_different_call(self):
        self.require_approval_for('Bash')
        request_id = self.evaluate(host_tool_call('session-1')).json()['approval']['request_id']
        self.decide(self.as_portal('approver', ROLE_OPERATOR), request_id, 'approve')
        token = self.poll(request_id).json()['approval_token']

        other_session = self.evaluate(host_tool_call('session-2', approval_token=token)).json()
        self.assertEqual(other_session['decision'], 'deny')
        other_input = self.evaluate(host_tool_call(approval_token=token, tool_input={'command': 'rm -rf /'})).json()
        self.assertEqual(other_input['decision'], 'deny')
        # Failed checks consume nothing, so the approved call itself still runs.
        self.assertEqual(self.evaluate(host_tool_call(approval_token=token)).json()['decision'], 'allow')

    def test_an_operator_denial_reaches_the_host(self):
        self.require_approval_for('Bash')
        request_id = self.evaluate(host_tool_call()).json()['approval']['request_id']
        denied = self.decide(self.as_portal('approver', ROLE_OPERATOR), request_id, 'deny', 'not on this repo')
        self.assertEqual(denied.status_code, 200)
        polled = self.poll(request_id).json()
        self.assertEqual((polled['status'], polled['reason']), ('denied', 'not on this repo'))
        self.assertNotIn('approval_token', polled)

    def test_an_unanswered_request_expires(self):
        self.require_approval_for('Bash')
        request_id = self.evaluate(host_tool_call()).json()['approval']['request_id']
        ApprovalRequest.objects.filter(pk=request_id).update(expires_at=timezone.now() - timedelta(seconds=1))

        polled = self.poll(request_id).json()
        self.assertEqual(polled['status'], 'expired')
        self.assertIn('expired', polled['reason'])
        operator = self.as_portal('approver', ROLE_OPERATOR)
        self.assertEqual(self.decide(operator, request_id, 'approve').status_code, 409)
        self.assertEqual(operator.get(reverse('zentinelle:approval-request-list')).json()['requests'], [])

    def test_the_hold_window_follows_the_policy_timeout(self):
        Policy.objects.create(
            tenant_id=TENANT, name='External calls need a human',
            policy_type=Policy.PolicyType.HUMAN_OVERSIGHT,
            config={'require_approval_for': ['external_calls'], 'approval_timeout_seconds': 60},
        )
        body = self.evaluate(host_tool_call(tool_name='WebFetch', is_external_call=True)).json()
        self.assertEqual(body['decision'], 'ask')
        self.assertEqual(body['approval']['timeout_seconds'], 60)

    def test_a_hard_deny_is_never_turned_into_ask(self):
        self.require_approval_for('Bash')
        Policy.objects.create(
            tenant_id=TENANT, name='No shell', policy_type=Policy.PolicyType.TOOL_PERMISSION,
            config={'denied_tools': ['Bash']},
        )
        body = self.evaluate(host_tool_call()).json()
        self.assertEqual(body['decision'], 'deny')
        self.assertNotIn('approval', body)
        self.assertFalse(ApprovalRequest.objects.exists())

    def test_a_corrupt_policy_is_never_turned_into_ask(self):
        # bulk_create skips Policy.save validation, as a corrupt row would.
        Policy.objects.bulk_create([Policy(
            tenant_id=TENANT, name='Corrupt selector', policy_type=Policy.PolicyType.TOOL_PERMISSION,
            config={'taxonomy_selectors': ['function:coding', 42]},
        )])
        body = self.evaluate(host_tool_call()).json()
        self.assertEqual(body['decision'], 'deny')
        self.assertIn('malformed taxonomy', body['reason'])
        self.assertFalse(ApprovalRequest.objects.exists())

    @patch('zentinelle.services.budgets.admit', return_value='Approval has already been used or expired')
    def test_an_admission_refusal_is_never_turned_into_ask(self, _admit):
        body = self.evaluate(host_tool_call()).json()
        self.assertEqual(body['decision'], 'deny')
        self.assertEqual(body['reason'], 'Approval has already been used or expired')
        self.assertFalse(ApprovalRequest.objects.exists())

    def test_only_agent_hosts_are_held(self):
        self.require_approval_for('Bash')
        _, key = self.make_endpoint('claude-hook', AgentEndpoint.AgentType.CLAUDE_CODE)
        body = self.evaluate({'action': 'tool_call', 'context': {'tool': 'Bash'}}, key=key).json()
        self.assertEqual(body['decision'], 'deny')
        self.assertNotIn('approval', body)
        self.assertFalse(ApprovalRequest.objects.exists())

    @patch('zentinelle.services.policy_engine.PolicyEngine.evaluate', side_effect=RuntimeError('evaluator down'))
    def test_a_policy_outage_still_fails_closed(self, _evaluate):
        response = self.evaluate(host_tool_call())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['decision'], 'deny')
        self.assertFalse(response.json()['allowed'])


class ApprovalRequestAccessTests(AgentHostTestCase):

    def setUp(self):
        super().setUp()
        self.require_approval_for('Bash')
        self.request_id = self.evaluate(host_tool_call()).json()['approval']['request_id']

    def test_only_the_requesting_host_can_poll(self):
        _, sibling_key = self.make_endpoint('agenthost-other', AgentEndpoint.AgentType.AGENT_HOST)
        _, foreign_key = self.make_endpoint(
            'agenthost-foreign', AgentEndpoint.AgentType.AGENT_HOST, tenant_id='tenant-b')
        self.assertEqual(self.poll(self.request_id, key=sibling_key).status_code, 404)
        self.assertEqual(self.poll(self.request_id, key=foreign_key).status_code, 404)
        anonymous = APIClient().get(reverse('zentinelle:approval-request', kwargs={'request_id': self.request_id}))
        self.assertEqual(anonymous.status_code, 401)

    def test_workload_keys_and_viewers_cannot_decide(self):
        self.assertEqual(self.decide(self.as_agent(self.key), self.request_id, 'approve').status_code, 401)
        viewer = self.as_portal('viewer', ROLE_VIEWER)
        self.assertEqual(self.decide(viewer, self.request_id, 'approve').status_code, 403)
        self.assertEqual(ApprovalRequest.objects.get(pk=self.request_id).status, ApprovalRequest.Status.PENDING)

    def test_operators_see_and_decide_only_their_tenants_requests(self):
        operator = self.as_portal('approver', ROLE_OPERATOR)
        listed = operator.get(reverse('zentinelle:approval-request-list'))
        self.assertEqual(listed.status_code, 200)
        [item] = listed.json()['requests']
        self.assertEqual((item['request_id'], item['agent_id']), (self.request_id, self.host.agent_id))
        self.assertEqual(item['context']['session_id'], 'session-1')

        _, foreign_key = self.make_endpoint(
            'agenthost-foreign', AgentEndpoint.AgentType.AGENT_HOST, tenant_id='tenant-b')
        self.require_approval_for('Bash', tenant_id='tenant-b')
        foreign_id = self.evaluate(host_tool_call(), key=foreign_key).json()['approval']['request_id']
        self.assertEqual(len(operator.get(reverse('zentinelle:approval-request-list')).json()['requests']), 1)
        self.assertEqual(self.decide(operator, foreign_id, 'approve').status_code, 404)
        self.assertEqual(ApprovalRequest.objects.get(pk=foreign_id).status, ApprovalRequest.Status.PENDING)
