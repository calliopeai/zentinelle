"""A policy's action travels through every path that writes or hands out policies (#409).

Policy as code, the copilot, the assistant's tools, compliance packs and the
policy list agents receive at register and config each read and write
action, block_level, steer_message and escalation, validated by
services.actions.validate_rule_action. Before this they spoke only
`enforcement`, so a policy they created got the default block.
"""
import hashlib
import hmac
import json
import os
import tempfile
from io import StringIO
from unittest.mock import patch

import yaml
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from zentinelle.auth.roles import ROLE_OPERATOR, assign_role
from zentinelle.models import (AgentEndpoint, LLMProviderKey, Policy,
                               PolicyChangeSet, TenantConfig)
from zentinelle.models.actions import ACTION_ORDER, BLOCK_LEVEL_ORDER

TENANT = '00000000-0000-0000-0000-000000000001'
OTHER = 'tenant-fresh'
ESCALATION = {'window_seconds': 600, 'repeat': [{'count': 3, 'action': 'block', 'block_level': 'tool_call'}]}


def warn_then_block(tenant_id=TENANT, name='Shell watch'):
    return Policy.objects.create(
        tenant_id=tenant_id, name=name, policy_type=Policy.PolicyType.TOOL_PERMISSION,
        config={'denied_tools': ['shell']}, action='warn', escalation=ESCALATION,
    )


class PolicyAsCodeActionTests(TestCase):
    def setUp(self):
        self.directory = tempfile.mkdtemp()

    def apply(self, tenant_id, *extra):
        out, err = StringIO(), StringIO()
        call_command('policy_apply', self.directory, '--tenant', tenant_id, *extra, stdout=out, stderr=err)
        return out.getvalue(), err.getvalue()

    def write(self, name, spec_extra):
        doc = {'kind': 'Policy', 'metadata': {'name': name, 'scope': 'organization', 'enforcement': 'enforce'},
               'spec': {'type': 'tool_permission', 'config': {'denied_tools': ['shell']}, **spec_extra}}
        with open(os.path.join(self.directory, f'{name}.yaml'), 'w') as fh:
            yaml.safe_dump(doc, fh)

    def test_export_then_apply_to_a_fresh_tenant_keeps_the_action(self):
        warn_then_block()
        call_command('policy_export', '--tenant', TENANT, '--output', self.directory, stdout=StringIO())
        _out, err = self.apply(OTHER)
        self.assertEqual(err, '')
        copy = Policy.objects.get(tenant_id=OTHER, name='Shell watch')
        self.assertEqual(copy.action, 'warn')
        self.assertEqual(copy.block_level, 'tool_call')
        self.assertEqual(copy.escalation, ESCALATION)

    def test_a_file_without_action_fields_leaves_the_action_alone(self):
        warn_then_block()
        self.write('Shell watch', {})
        self.apply(TENANT)
        policy = Policy.objects.get(tenant_id=TENANT, name='Shell watch')
        self.assertEqual(policy.action, 'warn')
        self.assertEqual(policy.escalation, ESCALATION)

    def test_apply_sets_the_action_the_file_names(self):
        warn_then_block()
        self.write('Shell watch', {'action': 'alert', 'escalation': {}})
        self.apply(TENANT)
        policy = Policy.objects.get(tenant_id=TENANT, name='Shell watch')
        self.assertEqual(policy.action, 'alert')
        self.assertEqual(policy.escalation, {})

    def test_an_invalid_action_is_refused_by_validate_and_apply(self):
        self.write('Steer without message', {'action': 'steer'})
        _out, err = self.apply(TENANT)
        self.assertIn('steer message', err)
        self.assertFalse(Policy.objects.filter(name='Steer without message').exists())
        with self.assertRaises(Exception):
            call_command('policy_validate', self.directory, stdout=StringIO(), stderr=StringIO())

    def test_diff_reports_an_action_change(self):
        warn_then_block()
        self.write('Shell watch', {'action': 'block'})
        Policy.objects.filter(name='Shell watch').update(config={'denied_tools': ['shell'], '_source': 'code'})
        out = StringIO()
        call_command('policy_diff', self.directory, '--tenant', TENANT, stdout=out, stderr=StringIO())
        changed = out.getvalue().split('--- CHANGED')[1].split('--- REMOVED')[0]
        self.assertIn('Shell watch', changed)


@override_settings(AUTH_MODE='local')
class CopilotActionTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user('copilot-actions')
        assign_role(user, ROLE_OPERATOR)
        TenantConfig.objects.create(tenant_id=TENANT, settings={'policy_copilot_enabled': True})
        key = LLMProviderKey(tenant_id=TENANT, provider='openai')
        key.set_key('sk-test-provider-key')
        key.save()
        self.client = APIClient()
        self.client.force_authenticate(user=user)
        self.tenant = patch('zentinelle.api.views.policy_copilot.get_request_tenant_id', return_value=TENANT)
        self.tenant.start()
        self.addCleanup(self.tenant.stop)

    def post(self, view, body):
        return self.client.post(f'/api/zentinelle/v1/policy-copilot/{view}', body, format='json')

    def test_draft_carries_the_action(self):
        response = self.post('draft', {'policy_type': 'tool_permission', 'config': {'denied_tools': ['shell']},
                                       'action': 'warn', 'escalation': ESCALATION})
        self.assertEqual(response.status_code, 200, response.json())
        draft = response.json()['draft']
        self.assertEqual(draft['action'], 'warn')
        self.assertEqual(draft['escalation'], ESCALATION)

    def test_draft_refuses_an_invalid_action(self):
        response = self.post('draft', {'policy_type': 'tool_permission', 'config': {}, 'action': 'shout'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('action', response.json()['fields'])

    def test_diff_shows_an_action_change(self):
        policy = warn_then_block()
        response = self.post('diff', {'policy_id': str(policy.id), 'draft': {
            'policy_type': 'tool_permission', 'config': policy.config, 'action': 'block', 'escalation': {}}})
        self.assertEqual(response.status_code, 200, response.json())
        body = response.json()
        self.assertEqual(body['before']['action'], 'warn')
        self.assertEqual(body['after']['action'], 'block')
        self.assertIn('action', body['changed_fields'])
        self.assertIn('escalation', body['changed_fields'])
        self.assertNotIn('config', body['changed_fields'])

    def test_stage_keeps_the_action_and_promotion_applies_it(self):
        response = self.post('stage', {'draft': {'name': 'Alert on shell', 'policy_type': 'tool_permission',
                                                 'config': {'denied_tools': ['shell']}, 'action': 'alert'}})
        self.assertEqual(response.status_code, 201, response.json())
        change = PolicyChangeSet.objects.get(id=response.json()['change_id'])
        self.assertEqual(change.changes[0]['action'], 'alert')

    def test_stage_refuses_an_invalid_action(self):
        response = self.post('stage', {'draft': {'name': 'x', 'policy_type': 'tool_permission', 'config': {},
                                                 'action': 'block', 'block_level': 'everything'}})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(PolicyChangeSet.objects.exists())


class AssistantToolActionTests(TestCase):
    def run_tool(self, tool, **args):
        from zentinelle.services.llm_tools import execute_tool
        return json.loads(execute_tool(tool, args, TENANT))

    def test_tool_schemas_offer_the_action_set(self):
        from zentinelle.services.llm_tools import (ACTION_PROPERTIES,
                                                   TOOL_SCHEMAS)
        self.assertEqual(ACTION_PROPERTIES['action']['enum'], ACTION_ORDER)
        self.assertEqual(ACTION_PROPERTIES['block_level']['enum'], BLOCK_LEVEL_ORDER)
        for schema in TOOL_SCHEMAS:
            if schema['name'] in ('create_policy', 'update_policy'):
                self.assertTrue(set(ACTION_PROPERTIES) <= set(schema['input_schema']['properties']))

    def test_create_policy_sets_the_action(self):
        result = self.run_tool('create_policy', name='Alert on shell', policy_type='tool_permission',
                               config={'denied_tools': ['shell']}, action='alert')
        self.assertTrue(result.get('success'), result)
        self.assertEqual(Policy.objects.get(id=result['policy_id']).action, 'alert')

    def test_create_policy_refuses_an_invalid_action(self):
        result = self.run_tool('create_policy', name='Steer', policy_type='tool_permission', config={},
                               action='steer')
        self.assertIn('steer message', result['error'])
        self.assertFalse(Policy.objects.filter(name='Steer').exists())

    def test_update_policy_changes_the_action_and_details_show_it(self):
        policy = warn_then_block()
        result = self.run_tool('update_policy', policy_id=str(policy.id), action='steer',
                               steer_message='Use the sandbox for {tool}.')
        self.assertTrue(result.get('success'), result)
        details = self.run_tool('get_policy_details', policy_id=str(policy.id))
        self.assertEqual(details['action'], 'steer')
        self.assertEqual(details['steer_message'], 'Use the sandbox for {tool}.')
        self.assertEqual(details['escalation'], ESCALATION)
        listed = self.run_tool('list_policies')['policies']
        self.assertEqual(listed[0]['action'], 'steer')

    def test_update_policy_validates_against_the_stored_fields(self):
        policy = warn_then_block()
        # The stored escalation repeats to block; a block rule would not
        # escalate, so the update must be checked with the stored ladder.
        result = self.run_tool('update_policy', policy_id=str(policy.id), action='block')
        self.assertIn('stronger', result['error'])
        policy.refresh_from_db()
        self.assertEqual(policy.action, 'warn')


class CompliancePackActionTests(TestCase):
    def test_an_action_override_reaches_every_pack_policy(self):
        from zentinelle.services.compliance_packs import (activate_pack,
                                                          get_pack)
        activate_pack(TENANT, 'soc2', actions={'action': 'alert'})
        actions = set(Policy.objects.filter(tenant_id=TENANT).values_list('action', flat=True))
        self.assertEqual(actions, {'alert'})
        self.assertEqual(Policy.objects.filter(tenant_id=TENANT).count(), len(get_pack('soc2')['policies']))

    def test_reactivation_without_an_override_keeps_the_action(self):
        from zentinelle.services.compliance_packs import activate_pack
        activate_pack(TENANT, 'soc2', actions={'action': 'alert'})
        activate_pack(TENANT, 'soc2')
        self.assertEqual(set(Policy.objects.filter(tenant_id=TENANT).values_list('action', flat=True)), {'alert'})

    def test_an_invalid_override_writes_nothing(self):
        from zentinelle.services.compliance_packs import activate_pack
        with self.assertRaises(ValueError):
            activate_pack(TENANT, 'soc2', actions={'action': 'steer'})
        self.assertFalse(Policy.objects.filter(tenant_id=TENANT).exists())

    def test_the_command_takes_an_action(self):
        call_command('activate_compliance_pack', 'gdpr', '--tenant', TENANT, '--action', 'warn', stdout=StringIO())
        self.assertEqual(set(Policy.objects.filter(tenant_id=TENANT).values_list('action', flat=True)), {'warn'})


@override_settings(AUTH_MODE='local')
class AgentPolicyListActionTests(TestCase):
    SECRET = 'policy-action-paths-bootstrap-secret'

    def setUp(self):
        cache.clear()
        warn_then_block()

    def assert_policy_actions(self, policies):
        self.assertEqual(len(policies), 1)
        self.assertEqual(policies[0]['action'], 'warn')
        self.assertEqual(policies[0]['block_level'], 'tool_call')
        self.assertEqual(policies[0]['steer_message'], '')
        self.assertEqual(policies[0]['escalation'], ESCALATION)

    def test_config_hands_out_the_action(self):
        key, key_hash, prefix = AgentEndpoint.generate_api_key()
        AgentEndpoint.objects.create(tenant_id=TENANT, agent_id='sdk-agent', name='sdk', agent_type='langchain',
                                     api_key_hash=key_hash, api_key_prefix=prefix)
        client = APIClient()
        client.credentials(HTTP_X_ZENTINELLE_KEY=key)
        response = client.get(reverse('zentinelle:config', kwargs={'agent_id': 'sdk-agent'}))
        self.assertEqual(response.status_code, 200, response.json())
        self.assert_policy_actions(response.json()['policies'])

    def test_register_hands_out_the_action(self):
        signature = hmac.new(self.SECRET.encode(), TENANT.encode(), hashlib.sha256).hexdigest()
        with patch.dict('os.environ', {'ZENTINELLE_BOOTSTRAP_SECRET': self.SECRET}, clear=False):
            response = APIClient().post(
                reverse('zentinelle:register'), {'agent_id': 'new-agent', 'agent_type': 'langchain', 'name': 'New'},
                format='json', HTTP_X_ZENTINELLE_BOOTSTRAP=f'bt_{TENANT}_{signature}')
        self.assertEqual(response.status_code, 201, response.json())
        self.assert_policy_actions(response.json()['policies'])
