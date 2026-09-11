"""Regression checks for the September BROCS review's enforcement boundaries."""
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from zentinelle.auth.oidc import OIDCCallbackView
from zentinelle.auth.roles import (ROLE_ADMIN, ROLE_VIEWER, assign_role,
                                   can_admin)
from zentinelle.models import AgentEndpoint, Policy, TenantConfig
from zentinelle.services.approvals import issue_approval
from zentinelle.services.evaluation_context import normalize_context
from zentinelle.services.policy_engine import PolicyEngine

TENANT = '00000000-0000-0000-0000-000000000001'
API = '/api/zentinelle/v1/'


@override_settings(AUTH_MODE='local')
class DependableControlsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.key, key_hash, prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=TENANT, agent_id='review-workload', name='Review',
            api_key_hash=key_hash, api_key_prefix=prefix,
        )
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='review-viewer', password='test-only-pass')

    def policy(self, **kwargs):
        return Policy.objects.create(tenant_id=TENANT, name='Review rule',
                                     policy_type='agent_capability', **kwargs)

    def test_gateway_can_derive_identity_from_key_but_cannot_impersonate(self):
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.key)
        with patch('zentinelle.api.views.evaluate.EvaluateView._log_evaluation'), patch('zentinelle.api.views.evaluate.EvaluateView._log_interaction'):
            response = self.client.post(API + 'evaluate', {'action': 'llm:invoke', 'context': {'input_text': 'hello'}}, format='json')
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()['allowed'])
            contract = response.json()
            self.assertEqual(contract['contract_version'], '1')
            self.assertEqual(contract['action'], 'llm:invoke')
            self.assertEqual(contract['subject']['agent_id'], self.endpoint.agent_id)
            self.assertEqual(contract['resource'], {'type': 'model', 'id': ''})
            self.assertEqual(contract['coverage']['status'], 'unknown')
            response = self.client.post(API + 'evaluate', {'agent_id': 'someone-else', 'action': 'llm:invoke'}, format='json')
            self.assertEqual(response.status_code, 403)

    @patch('zentinelle.api.views.evaluate.EvaluateView._log_evaluation')
    @patch('zentinelle.api.views.evaluate.EvaluateView._log_interaction')
    @patch('zentinelle.services.policy_engine.PolicyEngine.evaluate')
    def test_alias_actions_are_canonicalized_before_policy_evaluation(self, evaluate, _log_interaction, _log_evaluation):
        from zentinelle.services.policy_engine import EvaluationResult
        evaluate.return_value = EvaluationResult(allowed=True)
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.key)
        response = self.client.post(API + 'evaluate', {'action': 'tool.invoke', 'context': {'tool': 'search'}}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['action'], 'tool_call')
        self.assertEqual(evaluate.call_args.kwargs['action'], 'tool_call')
        self.assertEqual(evaluate.call_args.kwargs['context']['trace_id'], response.json()['trace_id'])

    @patch('zentinelle.models.AuditLog.log')
    def test_allowed_model_route_writes_metadata_only_evidence(self, audit):
        from zentinelle.services.llm_provider import _check_model_route
        _check_model_route('gpt-4o', 'openai', TENANT)
        audit.assert_called_once()
        kwargs = audit.call_args.kwargs
        self.assertEqual(kwargs['action'], 'model_route.allowed')
        self.assertEqual(kwargs['resource_id'], 'openai/gpt-4o')
        self.assertNotIn('api_key', kwargs['metadata'])
    def test_viewer_and_agent_cannot_change_provider_keys_or_incidents(self):
        for agent in (False, True):
            self.client.logout()
            if agent:
                self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.key)
            else:
                self.client.force_login(self.user)
            for path, payload in [('settings/llm-providers', {'provider': 'openai', 'apiKey': 'test-only'}),
                                  ('incidents/', {'title': 'Unauthorized'})]:
                response = self.client.post(API + path, payload, format='json')
                self.assertIn(response.status_code, (401, 403))

    def test_session_mutations_require_csrf_and_valid_token_works(self):
        assign_role(self.user, ROLE_ADMIN)
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.user)
        payload = {'provider': 'ollama', 'enabledForAssistant': True}
        self.assertEqual(client.patch(API + 'settings/llm-providers', payload, format='json').status_code, 403)
        token = client.get(API + 'auth/csrf').json()['csrf_token']
        self.assertEqual(client.patch(API + 'settings/llm-providers', payload, format='json', HTTP_X_CSRFTOKEN=token).status_code, 200)

    def test_agent_containment_requires_exact_human_approval_when_enabled(self):
        assign_role(self.user, ROLE_ADMIN)
        TenantConfig.objects.create(tenant_id=TENANT, settings={'control_approval_required': True})
        self.client.force_login(self.user)
        url = API + f'agents/{self.endpoint.agent_id}/control'
        action_context = {'agent_id': self.endpoint.agent_id, 'action': 'contain_tools', 'denied_tools': ['shell']}
        denied = self.client.post(url, {'action': 'contain_tools', 'denied_tools': ['shell']}, format='json')
        self.assertEqual(denied.status_code, 403)
        token = issue_approval(tenant_id=TENANT, kind='assistant', subject=str(self.user.pk),
                               action='agent_control:contain_tools', context=action_context,
                               granted_by=self.user.pk)
        approved = self.client.post(url, {'action': 'contain_tools', 'denied_tools': ['shell'], 'approval_token': token}, format='json')
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(approved.json()['metadata']['containment']['denied_tools'], ['shell'])
        replay = self.client.post(url, {'action': 'contain_tools', 'denied_tools': ['shell'], 'approval_token': token}, format='json')
        self.assertEqual(replay.status_code, 403)

    def test_agent_control_detail_exposes_containment_and_decision_traces(self):
        from zentinelle.models import AuditLog
        assign_role(self.user, ROLE_ADMIN)
        self.endpoint.metadata = {'taxonomy': {'supported': ['authority:read_only']},
                                  'containment': {'denied_tools': ['shell']},
                                  'identities': ['svc:coder'], 'model_routes': ['openai/gpt-4o'],
                                  'data_access': ['repo:read'], 'budget': {'monthly_usd': 25}}
        self.endpoint.save(update_fields=['metadata', 'updated_at'])
        AuditLog.objects.create(tenant_id=TENANT, resource_id=str(self.endpoint.id), action='llm.invoke',
                                metadata={'trace_id': 'trace-control'})
        self.client.force_login(self.user)
        response = self.client.get(API + f'agents/{self.endpoint.agent_id}/control')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['agent']['containment']['denied_tools'], ['shell'])
        self.assertEqual(response.json()['agent']['model_routes'], ['openai/gpt-4o'])
        self.assertEqual(response.json()['agent']['budget']['monthly_usd'], 25)
        self.assertEqual(response.json()['decision_traces'][0]['trace_id'], 'trace-control')

    def test_evaluation_contract_uses_canonical_boundary_resource_types(self):
        from zentinelle.api.views.evaluate import EvaluateView
        self.assertEqual(EvaluateView._resource_type_for_action('mcp.tool_call'), 'tool')
        self.assertEqual(EvaluateView._resource_type_for_action('rag.retrieve'), 'retrieval')
        self.assertEqual(EvaluateView._resource_type_for_action('workflow.transition'), 'workflow')
        self.assertEqual(EvaluateView._resource_type_for_action('network.egress'), 'egress')

    def test_login_requires_csrf_and_is_throttled(self):
        client = APIClient(enforce_csrf_checks=True)
        credentials = {'username': self.user.username, 'password': 'wrong'}
        self.assertEqual(client.post(API + 'auth/login', credentials, format='json').status_code, 403)
        token = client.get(API + 'auth/csrf').json()['csrf_token']
        for _ in range(20):
            response = client.post(API + 'auth/login', credentials, format='json', HTTP_X_CSRFTOKEN=token)
            self.assertEqual(response.status_code, 401)
        self.assertEqual(client.post(API + 'auth/login', credentials, format='json', HTTP_X_CSRFTOKEN=token).status_code, 429)

    def test_oidc_subject_does_not_link_by_email_and_demotion_revokes_admin(self):
        config = {'tenant_claim': 'org_id', 'role_claim': 'role'}
        claims = {'iss': 'https://issuer.example', 'sub': 'subject-1', 'email': self.user.username, 'role': 'admin'}
        oidc_user = OIDCCallbackView()._provision_user(claims, config)
        self.assertNotEqual(oidc_user.pk, self.user.pk)
        self.assertTrue(can_admin(oidc_user))
        claims.pop('role')
        oidc_user = OIDCCallbackView()._provision_user(claims, config)
        self.assertFalse(can_admin(oidc_user))
        self.assertTrue(oidc_user.groups.filter(name=ROLE_VIEWER).exists())
        for unknown_role in (None, ['admin'], {'role': 'admin'}, 'unrecognized'):
            claims['role'] = 'admin'
            OIDCCallbackView()._provision_user(claims, config)
            claims['role'] = unknown_role
            self.assertFalse(can_admin(OIDCCallbackView()._provision_user(claims, config)))
        claims['iss'] = 'https://other-issuer.example'
        self.assertNotEqual(OIDCCallbackView()._provision_user(claims, config).pk, oidc_user.pk)

    def test_approval_is_exact_and_single_use(self):
        policy = self.policy(config={'require_approval': ['tool:send']})
        context = {'tool_args': {'recipient': 'intended@example.test'}}
        token = issue_approval(tenant_id=TENANT, kind='policy', subject='requester',
                               action='tool:send', context=normalize_context(context),
                               endpoint_id=self.endpoint.pk, policies=[policy], granted_by='approver')
        engine = PolicyEngine()
        changed = {**context, 'tool_args': {'recipient': 'different@example.test'}, 'approval_token': token}
        self.assertFalse(engine.evaluate(self.endpoint, 'tool:send', 'requester', changed).allowed)
        approved = {**context, 'approval_token': token}
        self.assertFalse(engine.evaluate(self.endpoint, 'tool:send', None, approved).allowed)
        self.assertTrue(engine.evaluate(self.endpoint, 'tool:send', 'requester', approved).allowed)
        self.assertFalse(engine.evaluate(self.endpoint, 'tool:send', 'requester', approved).allowed)

    def test_independent_constraints_compose_and_specific_override_wins(self):
        broad = self.policy(config={'denied_actions': ['tool:delete']}, priority=100)
        self.policy(config={}, scope_type='endpoint', scope_endpoint=self.endpoint)
        self.assertFalse(PolicyEngine().evaluate(self.endpoint, 'tool:delete').allowed)
        broad.override_group = 'actions'
        broad.save()
        narrow = self.policy(config={}, scope_type='endpoint', scope_endpoint=self.endpoint, override_group='actions', priority=-10)
        policies = PolicyEngine().get_effective_policies(self.endpoint, use_cache=False)
        self.assertIn(narrow, policies)
        self.assertNotIn(broad, policies)
        broad.non_overridable = True
        broad.save()
        self.assertIn(broad, PolicyEngine().get_effective_policies(self.endpoint, use_cache=False))

    def test_team_policy_is_resolved_from_workload(self):
        self.endpoint.sub_organization_id_ext = 'team-a'
        self.endpoint.save()
        self.policy(config={'denied_actions': ['tool:delete']}, scope_type='sub_organization', scope_sub_organization_id_ext='team-a')
        self.assertFalse(PolicyEngine().evaluate(self.endpoint, 'tool:delete').allowed)

    def test_full_input_and_output_are_inspected(self):
        Policy.objects.create(tenant_id=TENANT, name='PII', policy_type='output_filter', config={'block_pii': True})
        self.assertFalse(PolicyEngine().evaluate(self.endpoint, 'llm:response', context={'output_text': 'Contact jane@example.com'}).allowed)
        self.assertFalse(PolicyEngine().evaluate(self.endpoint, 'llm:response', context={}).allowed)
        text = 'x' * 20000 + ' secret tail'
        normalized = normalize_context({'request_body': json.dumps({'messages': [{'content': text}]})})
        self.assertIn('secret tail', normalized['input_text'])

    def test_audit_changes_and_tail_deletion_are_detected(self):
        from zentinelle.models import AuditLog
        from zentinelle.services.audit_chain import verify_chain
        entry = AuditLog.log(tenant_id=TENANT, action='update', resource_type='policy', resource_id='p', changes={'enabled': False})
        self.assertTrue(verify_chain(TENANT)['valid'])
        AuditLog.objects.filter(pk=entry.pk).update(changes={'enabled': True})
        self.assertFalse(verify_chain(TENANT)['valid'])
        AuditLog.objects.filter(pk=entry.pk).delete()
        self.assertFalse(verify_chain(TENANT)['valid'])

    def test_retention_preserves_holds_and_checkpoint_verification(self):
        from datetime import timedelta

        from django.utils import timezone

        from zentinelle.models import AuditLog, Event
        from zentinelle.models.audit import AuditChainHead
        from zentinelle.models.retention_policy import LegalHold
        from zentinelle.services.audit_chain import checkpoint, verify_chain
        from zentinelle.tasks.scheduled import (cleanup_old_events,
                                                enforce_retention_policies)
        AuditLog.objects.filter(tenant_id=TENANT).delete()
        AuditChainHead.objects.filter(tenant_id=TENANT).delete()
        old = timezone.now() - timedelta(days=800)
        entry = AuditLog.objects.create(tenant_id=TENANT, action='update', resource_type='policy', resource_id='old', timestamp=old)
        pinned = checkpoint(TENANT)
        Event.objects.create(tenant_id=TENANT, event_type='usage', event_category='telemetry', occurred_at=old, status='processed')
        hold = LegalHold.objects.create(tenant_id=TENANT, name='Preserve', applies_to_all=True)
        for task in (cleanup_old_events, enforce_retention_policies):
            self.assertEqual(task()['tenants_failed'], 0)
            self.assertTrue(AuditLog.objects.filter(pk=entry.pk).exists())
            self.assertEqual(Event.objects.filter(tenant_id=TENANT).count(), 1)
        hold.release()
        AuditLog.log(tenant_id=TENANT, action='update', resource_type='policy', resource_id='new')
        self.assertEqual(cleanup_old_events()['tenants_failed'], 0)
        self.assertFalse(AuditLog.objects.filter(pk=entry.pk).exists(), list(AuditLog.objects.values('resource_type', 'resource_id', 'chain_sequence', 'timestamp')))
        self.assertTrue(verify_chain(TENANT, expected_checkpoint=pinned)['valid'])

    def test_budget_uses_real_scope_and_consumes_capacity_before_execution(self):
        from zentinelle.models.budget import BudgetCharge
        policy = Policy.objects.create(tenant_id=TENANT, name='Budget', policy_type='budget_limit', config={'monthly_limit_usd': .03})
        context = {'model': 'gpt-4o', 'input_text': 'hello', 'max_output_tokens': 1, 'request_id': 'one', 'current_month_spend_usd': -10000}
        engine = PolicyEngine()
        self.assertTrue(engine.evaluate(self.endpoint, 'llm:invoke', context=context).allowed)
        self.assertFalse(engine.evaluate(self.endpoint, 'llm:invoke', context={**context, 'request_id': 'two'}).allowed)
        self.assertFalse(engine.evaluate(self.endpoint, 'llm:invoke', context=context).allowed)
        self.assertEqual(BudgetCharge.objects.count(), 1)
        policy.scope_type = 'endpoint'
        policy.scope_endpoint = AgentEndpoint.objects.create(tenant_id=TENANT, agent_id='other', name='Other')
        policy.save()
        self.assertTrue(engine.evaluate(self.endpoint, 'llm:invoke', context=context).allowed)

    def test_capture_does_not_persist_prompt_content_by_default(self):
        from django.utils import timezone

        from zentinelle.models.compliance import InteractionLog
        entry = InteractionLog.objects.create(tenant_id=TENANT, interaction_type='chat', user_identifier='user', occurred_at=timezone.now(), input_content='jane@example.com', output_content='private', tool_calls=[{'args': 'private'}])
        entry.refresh_from_db()
        self.assertEqual(entry.input_content, '')
        self.assertEqual(entry.output_content, '')
        self.assertEqual(entry.tool_calls, [])

    def test_graphql_viewer_cannot_mutate_but_operator_can_create(self):
        from zentinelle.auth.roles import ROLE_OPERATOR
        self.client.force_login(self.user)
        query = 'mutation { createPolicy(input: {name: "Browser policy", policyType: "agent_capability", config: {denied_actions: ["tool:delete"]}}) {success error} }'
        denied = self.client.post('/gql/zentinelle/', {'query': query}, format='json').json()
        self.assertEqual(denied['errors'][0]['extensions']['code'], 'FORBIDDEN')
        assign_role(self.user, ROLE_OPERATOR)
        allowed = self.client.post('/gql/zentinelle/', {'query': query}, format='json').json()
        self.assertNotIn('errors', allowed)
        self.assertTrue(allowed['data']['createPolicy']['success'], allowed)
        self.assertEqual(Policy.objects.get(name='Browser policy').tenant_id, TENANT)


class ConcurrentAdmissionTests(TransactionTestCase):
    def test_parallel_requests_cannot_spend_the_same_remaining_budget(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier

        from django.db import connections

        from zentinelle.models.budget import BudgetCharge
        endpoint = AgentEndpoint.objects.create(tenant_id=TENANT, agent_id='parallel-budget', name='Parallel')
        Policy.objects.create(tenant_id=TENANT, name='Cap', policy_type='budget_limit', config={'monthly_budget_usd': .03})
        barrier = Barrier(2)

        def invoke(request_id):
            try:
                barrier.wait(timeout=10)
                return PolicyEngine().evaluate(endpoint, 'llm:invoke', context={
                    'request_id': request_id, 'model': 'gpt-4o', 'input_text': 'hello', 'max_output_tokens': 1,
                }).allowed
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            decisions = list(executor.map(invoke, ['one', 'two']))
        self.assertEqual(sorted(decisions), [False, True])
        self.assertEqual(BudgetCharge.objects.filter(tenant_id=TENANT).count(), 1)

    def test_only_one_parallel_request_can_use_an_approval(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier

        from django.db import connections
        endpoint = AgentEndpoint.objects.create(tenant_id=TENANT, agent_id='parallel-approval', name='Parallel')
        policy = Policy.objects.create(tenant_id=TENANT, name='Approval', policy_type='agent_capability', config={'require_approval': ['tool:send']})
        token = issue_approval(tenant_id=TENANT, kind='policy', subject='user', action='tool:send',
                               context={'tool_args': {'recipient': 'intended'}}, endpoint_id=endpoint.pk,
                               policies=[policy], granted_by='operator')
        barrier = Barrier(2)

        def invoke(_):
            try:
                barrier.wait(timeout=10)
                return PolicyEngine().evaluate(endpoint, 'tool:send', 'user', {
                    'tool_args': {'recipient': 'intended'}, 'approval_token': token,
                }).allowed
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            decisions = list(executor.map(invoke, [1, 2]))
        self.assertEqual(sorted(decisions), [False, True])
