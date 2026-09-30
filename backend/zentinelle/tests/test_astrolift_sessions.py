"""The signed bridge preserves scope and issues only durable policy actions."""
import hashlib
import hmac
import json
import time
import uuid

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from zentinelle.models import (AgentEndpoint, AstroliftEnforcement,
                               AstroliftIntegration, AuditLog, Event, Policy)
from zentinelle.services.astrolift_sessions import canonical_body, sign_action
from zentinelle.tests.test_astrolift_agent_keys import AGENT, mint
from zentinelle.tests.test_astrolift_clusters import (TENANT_A, TENANT_B,
                                                      as_install,
                                                      connect_install,
                                                      register)


class AstroliftSessionTests(TestCase):
    databases = {'default', 'zentinelle', 'analytics'}

    def setUp(self):
        self.credential, self.install = connect_install([TENANT_A])
        mint(self.credential)
        self.endpoint = AgentEndpoint.objects.get(tenant_id=TENANT_A, agent_id=AGENT)
        self.cluster = str(uuid.uuid4())
        response = register(self.credential, self.cluster)
        self.assertIn(response.status_code, (200, 201), response.json())
        self.secret = 'session-bridge-secret'
        AstroliftIntegration.objects.create(tenant_id=TENANT_A, astrolift_org_id=42,
                                            astrolift_url=self.install.base_url, signing_secret=self.secret)
        self.payload = {'task_id': str(uuid.uuid4()), 'install_id': str(self.install.pk),
                        'agent_id': AGENT, 'cluster_id': self.cluster, 'team_id': str(uuid.uuid4()),
                        'project_id': str(uuid.uuid4()), 'harness': 'claude', 'sequence': 3,
                        'turn_id': 'turn-1', 'message_id': 'tool-1', 'kind': 'tool_call_input',
                        'tool_name': 'Bash', 'data': {'input': {'command': 'secret command'}, 'truncated': False},
                        'declared_intent': {'agent_slug': 'review', 'spec_id': str(uuid.uuid4()), 'tool_preset': 'dev'}}

    def deliver(self, payload=None, event_id='session-1'):
        envelope = {'payload_version': 1, 'event_type': 'AUDIT.agent.session.event', 'event_id': event_id,
                    'org_id': 42, 'occurred_at_unix': int(time.time()), 'actor_user_id': None,
                    'idempotency_key': f'zentinelle-42-{event_id}', 'payload': payload or self.payload}
        body, timestamp = json.dumps(envelope).encode(), str(int(time.time()))
        key = hashlib.sha256(self.secret.encode()).hexdigest().encode()
        signature = 'sha256=' + hmac.new(key, timestamp.encode()+b'.'+body, hashlib.sha256).hexdigest()
        return APIClient().post('/integrations/astrolift/v1/audit', body, content_type='application/json',
                                HTTP_X_ASTROLIFT_SIGNATURE=signature, HTTP_X_ASTROLIFT_TIMESTAMP=timestamp)

    def test_evidence_and_intent_are_scoped_and_deduplicated_without_tool_content(self):
        response = self.deliver()
        self.assertEqual(response.status_code, 202, response.json())
        event = Event.objects.get(tenant_id=TENANT_A, endpoint=self.endpoint)
        self.assertEqual(event.payload['project_id'], self.payload['project_id'])
        self.assertEqual(event.payload['declared_intent'], self.payload['declared_intent'])
        self.assertNotIn('input', event.payload['data'])
        self.assertNotIn('secret command', json.dumps(event.payload))
        self.assertEqual(self.deliver().status_code, 200)
        self.assertEqual(Event.objects.filter(tenant_id=TENANT_A).count(), 1)
        evidence = AuditLog.objects.filter(tenant_id=TENANT_A, metadata__astrolift_event_type='AUDIT.agent.session.event')
        self.assertEqual(evidence.count(), 1)
        self.assertNotIn('secret command', json.dumps(evidence.first().changes))

    def test_other_tenant_install_cluster_or_malformed_identity_is_refused(self):
        _, other = connect_install([TENANT_B])
        for field, value in [('install_id', str(other.pk)), ('cluster_id', str(uuid.uuid4())),
                             ('agent_id', 'another-agent'), ('sequence', True), ('project_id', 'invalid')]:
            with self.subTest(field=field):
                self.assertEqual(self.deliver({**self.payload, field: value}, event_id=field).status_code, 400)
        self.assertFalse(Event.objects.filter(tenant_id=TENANT_A).exists())

    def test_policy_issues_signed_install_bound_actions_and_idempotent_outcome(self):
        policy = Policy.objects.create(tenant_id=TENANT_A, name='No shell', policy_type=Policy.PolicyType.TOOL_PERMISSION,
                                       config={'denied_tools': ['Bash']}, action='block', block_level='revoke_key')
        self.assertEqual(self.deliver().status_code, 202)
        action = AstroliftEnforcement.objects.get(tenant_id=TENANT_A)
        self.assertEqual(action.payload['action'], 'block')
        self.assertEqual(action.payload['block_level'], 'revoke_key')
        self.assertEqual(action.payload['policy_id'], str(policy.pk))
        url = reverse('zentinelle:astrolift-enforcements', kwargs={'agent_id': AGENT})
        response = as_install(self.credential).get(url, {'tenant_id': TENANT_A})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        signed = response.json()['actions'][0]
        self.assertEqual(signed['signature'], sign_action(signed['body'], self.credential))
        self.assertNotIn(self.credential, json.dumps(signed))
        self.assertEqual(signed['body']['install_id'], str(self.install.pk))
        self.assertGreater(signed['body']['expires_at'], time.time())
        second = as_install(self.credential).get(url, {'tenant_id': TENANT_A}).json()['actions'][0]
        self.assertNotEqual(second['body']['nonce'], signed['body']['nonce'])
        other, _ = connect_install([TENANT_A])
        self.assertEqual(as_install(other).get(url, {'tenant_id': TENANT_A}).status_code, 404)
        receipt = reverse('zentinelle:astrolift-enforcement-outcome', kwargs={'agent_id': AGENT, 'action_id': action.pk})
        body = {'tenant_id': TENANT_A, 'outcome': {'status': 'applied', 'applied_action': 'revoke_key'}}
        self.assertEqual(as_install(self.credential).post(receipt, body, format='json').status_code, 200)
        self.assertEqual(as_install(self.credential).post(receipt, body, format='json').status_code, 200)
        self.assertEqual(as_install(self.credential).get(url, {'tenant_id': TENANT_A}).json()['actions'], [])
        body['outcome']['applied_action'] = 'stop_task'
        self.assertEqual(as_install(self.credential).post(receipt, body, format='json').status_code, 409)

    def test_audit_mode_caps_a_stop_to_recording(self):
        Policy.objects.create(tenant_id=TENANT_A, name='Observe shell', policy_type=Policy.PolicyType.TOOL_PERMISSION,
                              config={'denied_tools': ['Bash']}, action='block', block_level='stop', enforcement='audit')
        self.assertEqual(self.deliver().status_code, 202)
        action = AstroliftEnforcement.objects.get(tenant_id=TENANT_A)
        self.assertEqual(action.payload['action'], 'log')
        self.assertEqual(action.payload['mode'], 'audit')
        self.assertEqual(AstroliftEnforcement.objects.filter(tenant_id=TENANT_A).count(), 1)

    def test_canonical_signature_changes_with_body_or_credential(self):
        body = {'nonce': 'one', 'action': 'block'}
        self.assertNotEqual(sign_action(body, self.credential), sign_action({**body, 'action': 'warn'}, self.credential))
        self.assertNotEqual(sign_action(body, self.credential), sign_action(body, 'other'))
        self.assertEqual(canonical_body(body), b'{"action":"block","nonce":"one"}')
