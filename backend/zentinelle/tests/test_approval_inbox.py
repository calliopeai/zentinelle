"""The portal approvals inbox reads and decides only its own tenant's held actions (#382).

Both tenants run an agent host named `shared-bot` and hold the same Bash call,
so the two requests share an agent name and an action digest. A lookup keyed
by either alone would cross tenants; only the tenant and the request id tell
them apart.
"""
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from zentinelle.auth.roles import ROLE_OPERATOR, ROLE_VIEWER, assign_role
from zentinelle.models import (AgentEndpoint, ApprovalRequest, AuditLog,
                               ExecutionApproval, Policy)
from zentinelle.tests._two_tenants_portal import (SHARED_AGENT_ID, TENANT_A,
                                                  TENANT_B, TwoTenantTestCase)

HELD_CALL = {'harness': 'claude', 'session_id': 'session-1', 'chat_id': 'chat-1',
             'tool_call_id': 'call-1', 'tool_name': 'Bash', 'tool_input': {'command': 'ls'}}


def portal(username, role, **options):
    user = get_user_model().objects.create_user(username=username, password='test-only-pass')
    assign_role(user, role)
    client = APIClient(**options)
    client.force_login(user)
    return client, user


@override_settings(AUTH_MODE='local')
class ApprovalInboxTenancyTests(TwoTenantTestCase):

    def setUp(self):
        super().setUp()
        AgentEndpoint.objects.filter(pk__in=[self.agent_a.pk, self.agent_b.pk]).update(
            agent_type=AgentEndpoint.AgentType.AGENT_HOST)
        for tenant_id in (TENANT_A, TENANT_B):
            Policy.objects.create(tenant_id=tenant_id, name='Bash needs a human',
                                  policy_type=Policy.PolicyType.TOOL_PERMISSION,
                                  config={'requires_approval': ['Bash']})
        self.held_a = self.hold(self.key_a)
        self.held_b = self.hold(self.key_b)
        self.operator, self.operator_user = portal('approver', ROLE_OPERATOR)

    def hold(self, key, **context):
        body = self.evaluate(key, context={**HELD_CALL, **context}, user_id='user-1').json()
        self.assertEqual(body['decision'], 'ask', body)
        return body['approval']['request_id']

    def call(self, key, **context):
        return self.evaluate(key, context={**HELD_CALL, **context}, user_id='user-1').json()

    def decide(self, client, request_id, decision='approve', reason='', **headers):
        return client.post(reverse('zentinelle:approval-request-decision', kwargs={'request_id': request_id}),
                           {'decision': decision, 'reason': reason}, format='json', **headers)

    def test_the_inbox_lists_only_the_callers_tenant(self):
        viewer, _ = portal('reader', ROLE_VIEWER)
        for client in (self.operator, viewer):
            listed = client.get(reverse('zentinelle:approval-request-list'))
            self.assertEqual(listed.status_code, 200, listed.content)
            [item] = listed.json()['requests']
            self.assertEqual((item['request_id'], item['agent_id']), (self.held_a, SHARED_AGENT_ID))

    def test_another_tenants_request_cannot_be_decided(self):
        for decision in ('approve', 'deny'):
            self.assertEqual(self.decide(self.operator, self.held_b, decision).status_code, 404)

        self.assertEqual(ApprovalRequest.objects.get(pk=self.held_b).status, ApprovalRequest.Status.PENDING)
        self.assertFalse(ExecutionApproval.objects.filter(tenant_id=TENANT_B).exists())
        self.assertFalse(AuditLog.objects.filter(resource_id=self.held_b).exists())

    def test_a_decision_is_audited_in_the_callers_tenant(self):
        decided = self.decide(self.operator, self.held_a, 'deny', 'not on this repo')
        self.assertEqual(decided.status_code, 200, decided.content)

        [entry] = AuditLog.objects.filter(resource_type='approval_request', resource_id__in=[self.held_a, self.held_b])
        self.assertEqual((entry.tenant_id, entry.resource_id, entry.ext_user_id),
                         (TENANT_A, self.held_a, str(self.operator_user.pk)))
        self.assertEqual((entry.metadata['decision'], entry.metadata['reason'], entry.metadata['endpoint_id']),
                         ('deny', 'not on this repo', str(self.agent_a.pk)))
        self.assertEqual(ApprovalRequest.objects.get(pk=self.held_b).status, ApprovalRequest.Status.PENDING)

    def test_an_approval_releases_only_its_own_tenants_call(self):
        self.assertEqual(self.decide(self.operator, self.held_a).status_code, 200)
        polled = APIClient()
        polled.credentials(HTTP_X_ZENTINELLE_KEY=self.key_a)
        token = polled.get(reverse('zentinelle:approval-request', kwargs={'request_id': self.held_a})).json()[
            'approval_token']

        foreign = self.call(self.key_b, approval_token=token)
        self.assertFalse(foreign['allowed'], foreign)
        self.assertEqual(ApprovalRequest.objects.get(pk=self.held_b).status, ApprovalRequest.Status.PENDING)
        own = self.call(self.key_a, approval_token=token)
        self.assertEqual(own['decision'], 'allow', own)

    def test_a_session_decision_needs_the_csrf_token(self):
        guarded, _ = portal('guarded-approver', ROLE_OPERATOR, enforce_csrf_checks=True)
        self.assertEqual(self.decide(guarded, self.held_a).status_code, 403)
        self.assertEqual(ApprovalRequest.objects.get(pk=self.held_a).status, ApprovalRequest.Status.PENDING)

        token = guarded.get(reverse('zentinelle:auth-csrf')).json()['csrf_token']
        decided = self.decide(guarded, self.held_a, HTTP_X_CSRFTOKEN=token)
        self.assertEqual(decided.status_code, 200, decided.content)
        self.assertEqual(decided.json()['status'], 'approved')
