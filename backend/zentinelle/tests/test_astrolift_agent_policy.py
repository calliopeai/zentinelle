"""An install can pre-approve only its own agent and exact held tool call."""
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from zentinelle.models import AgentEndpoint, ApprovalRequest, AuditLog, Policy
from zentinelle.tests.test_astrolift_agent_keys import AGENT, mint
from zentinelle.tests.test_astrolift_clusters import (TENANT_A, TENANT_B,
                                                      as_install,
                                                      connect_install)


class AstroliftAgentPolicyTests(TestCase):
    def setUp(self):
        self.credential, self.install = connect_install([TENANT_A])
        self.key = mint(self.credential).json()['api_key']
        self.agent = AgentEndpoint.objects.get(tenant_id=TENANT_A, agent_id=AGENT)
        self.body = {'tenant_id': TENANT_A, 'agent_id': AGENT, 'action': 'tool_call', 'user_id': 'astrolift-user-1',
                     'context': {'harness': 'claude', 'session_id': 'ahp-session:/task-1', 'chat_id': 'ahp-session:/task-1/chat',
                                 'tool_call_id': 'request-1', 'tool_name': 'Bash', 'tool_input': {'command': 'pwd'}}}

    def evaluate(self, credential=None, body=None):
        url = reverse('zentinelle:astrolift-agent-evaluate', kwargs={'agent_id': AGENT})
        return as_install(credential or self.credential).post(url, body or self.body, format='json')

    def test_evaluation_uses_the_minted_endpoint_and_its_policy(self):
        self.assertEqual(self.evaluate().json()['decision'], 'allow')
        Policy.objects.create(tenant_id=TENANT_A, name='No shell', policy_type=Policy.PolicyType.TOOL_PERMISSION,
                              config={'denied_tools': ['Bash']})
        response = self.evaluate()
        self.assertEqual(response.status_code, 200, response.json())
        self.assertEqual(response.json()['decision'], 'deny')
        self.assertEqual(response.json()['subject']['agent_id'], AGENT)

    def test_other_install_tenant_and_agent_key_cannot_use_the_channel(self):
        other_credential, _ = connect_install([TENANT_A])
        self.assertEqual(self.evaluate(other_credential).status_code, 404)
        self.assertEqual(self.evaluate(body={**self.body, 'tenant_id': TENANT_B}).status_code, 404)
        agent = APIClient()
        agent.credentials(HTTP_X_ZENTINELLE_KEY=self.key)
        response = agent.post(reverse('zentinelle:astrolift-agent-evaluate', kwargs={'agent_id': AGENT}), self.body, format='json')
        self.assertIn(response.status_code, (401, 403))

    def test_expired_or_stopped_agents_cannot_be_approved(self):
        AgentEndpoint.objects.filter(tenant_id=TENANT_A, pk=self.agent.pk).update(api_key_expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.evaluate().status_code, 403)
        self.assertEqual(self.evaluate().json()['decision'], 'deny')

    def test_human_approval_is_bound_to_the_tool_and_rechecked_against_policy(self):
        policy = Policy.objects.create(tenant_id=TENANT_A, name='Shell needs approval', policy_type=Policy.PolicyType.TOOL_PERMISSION,
                                       config={'requires_approval': ['Bash']})
        response = self.evaluate()
        self.assertEqual(response.json()['decision'], 'ask', response.json())
        held = response.json()['approval']['request_id']
        url = reverse('zentinelle:astrolift-agent-approval', kwargs={'agent_id': AGENT, 'request_id': held})
        approval = as_install(self.credential).post(
            url, {'tenant_id': TENANT_A, 'decision': 'approve', 'actor_id': 'controller-1', 'reason': 'Reviewed'}, format='json')
        self.assertEqual(approval.status_code, 200, approval.json())
        self.assertEqual(approval['Cache-Control'], 'no-store')
        token = approval.json()['approval_token']
        approved = self.evaluate(body={**self.body, 'context': {**self.body['context'], 'approval_token': token}})
        self.assertEqual(approved.json()['decision'], 'allow', approved.json())
        self.assertEqual(ApprovalRequest.objects.get(tenant_id=TENANT_A, pk=held).decided_by, f'astrolift:{self.install.pk}:controller-1')
        self.assertTrue(AuditLog.objects.filter(tenant_id=TENANT_A, resource_id=held).exists())
        policy.config = {'denied_tools': ['Bash']}
        policy.version += 1
        policy.save()
        denied = self.evaluate(body={**self.body, 'context': {**self.body['context'], 'approval_token': token}})
        self.assertEqual(denied.json()['decision'], 'deny')

    def test_context_and_action_are_required(self):
        self.assertEqual(self.evaluate(body={**self.body, 'context': {}}).status_code, 400)
        self.assertEqual(self.evaluate(body={**self.body, 'action': 'llm:invoke'}).status_code, 400)

    def test_approval_retry_returns_the_same_token_without_a_second_audit(self):
        Policy.objects.create(tenant_id=TENANT_A, name='Shell needs approval', policy_type=Policy.PolicyType.TOOL_PERMISSION,
                              config={'requires_approval': ['Bash']})
        held = self.evaluate().json()['approval']['request_id']
        url = reverse('zentinelle:astrolift-agent-approval', kwargs={'agent_id': AGENT, 'request_id': held})
        body = {'tenant_id': TENANT_A, 'decision': 'approve', 'actor_id': 'controller-1', 'reason': 'Reviewed'}
        client = as_install(self.credential)
        first = client.post(url, body, format='json')
        audits = AuditLog.objects.filter(tenant_id=TENANT_A, resource_id=held).count()
        self.assertEqual(first.status_code, 200)
        retry = client.post(url, body, format='json')
        self.assertEqual(retry.status_code, 200)
        from django.core import signing

        from zentinelle.services.approvals import SALT
        self.assertEqual(signing.loads(retry.json()['approval_token'], salt=SALT), signing.loads(first.json()['approval_token'], salt=SALT))
        self.assertEqual(AuditLog.objects.filter(tenant_id=TENANT_A, resource_id=held).count(), audits)
        self.assertEqual(client.post(url, {**body, 'actor_id': 'another-controller'}, format='json').status_code, 409)
        AgentEndpoint.objects.filter(tenant_id=TENANT_A, pk=self.agent.pk).update(api_key_expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(client.post(url, body, format='json').status_code, 403)
