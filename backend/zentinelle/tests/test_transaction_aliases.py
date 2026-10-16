"""Locking and multi-write paths open their transaction on the model's own database (T6).

conftest.py turns the database router off for the suite, so a
`transaction.atomic()` on 'default' around a `select_for_update` on a model
routed to 'zentinelle' passes every other test, and fails with
TransactionManagementError on every real deployment. This module turns the
router back on. The test database mirrors 'zentinelle' and 'analytics' to
'default', but each alias keeps its own connection, as in production, so an
atomic block on the wrong alias leaves the lock outside any transaction.

TransactionTestCase, because TestCase would wrap every alias in a
transaction of its own and hide exactly this.
"""
import hashlib
import json
import tempfile
import uuid
from types import SimpleNamespace

from django.contrib.auth.models import User
from django.db import connections, router
from django.db.models.signals import pre_save
from django.test import Client, TransactionTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from zentinelle.models import (AgentEndpoint, ApprovalRequest, BudgetCharge,
                               Event, ModelRouteCanary, Policy,
                               PolicyChangeSet, RuntimeSettingsChange)
from zentinelle.tests._two_tenants_portal import TENANT_A, make_agent

ROUTED = override_settings(DATABASE_ROUTERS=['zentinelle.db_router.ZentinelleRouter'])


@ROUTED
class RoutedTransactionTests(TransactionTestCase):
    databases = '__all__'

    def setUp(self):
        self.assertEqual(router.db_for_write(AgentEndpoint), 'zentinelle', 'the router is not on')
        self.admin = Client()
        self.admin.force_login(User.objects.create_superuser('t6-admin', 't6@example.test', 'pw'))

    def test_the_kill_switch_stops_the_agent(self):
        agent, _ = make_agent(TENANT_A, agent_id='runaway')

        response = self.admin.post(reverse('zentinelle:agent-control', kwargs={'agent_id': 'runaway'}),
                                   data=json.dumps({'action': 'emergency_stop'}), content_type='application/json')

        self.assertEqual(response.status_code, 200, response.content)
        agent.refresh_from_db()
        self.assertEqual(agent.status, AgentEndpoint.Status.TERMINATED)

    def test_policy_promote_and_rollback_lock_inside_a_transaction(self):
        from zentinelle.services.policy_rollout import (promote_change_set,
                                                        rollback_change_set)
        for step in (promote_change_set, rollback_change_set):
            with self.subTest(step=step.__name__), self.assertRaises(PolicyChangeSet.DoesNotExist):
                step(uuid.uuid4(), TENANT_A)

    def test_a_policy_change_set_promotes(self):
        from zentinelle.services.policy_rollout import promote_change_set
        policy = Policy.objects.create(tenant_id=TENANT_A, name='p', policy_type=Policy.PolicyType.RATE_LIMIT,
                                       config={'requests_per_minute': 10})
        change = PolicyChangeSet.objects.create(
            tenant_id=TENANT_A, title='raise', status=PolicyChangeSet.Status.APPROVED,
            changes=[{'policy_id': str(policy.id), 'config': {'requests_per_minute': 20}}],
            base_versions={str(policy.id): policy.version})

        promote_change_set(change.id, TENANT_A)

        policy.refresh_from_db()
        self.assertEqual(policy.config, {'requests_per_minute': 20})

    def test_a_runtime_settings_change_applies_inside_a_transaction(self):
        from zentinelle.services.runtime_settings_changes import apply_change
        with self.assertRaises(RuntimeSettingsChange.DoesNotExist):
            apply_change(uuid.uuid4(), TENANT_A)

    def test_runtime_settings_save(self):
        response = self.admin.patch(reverse('zentinelle:runtime-settings'),
                                    data=json.dumps({'settings': {'policy_copilot_enabled': True}}),
                                    content_type='application/json')

        self.assertEqual(response.status_code, 200, response.content)

    def test_a_route_canary_rolls_back_inside_a_transaction(self):
        response = self.admin.post(reverse('zentinelle:model-route-canary-rollback',
                                           kwargs={'canary_id': uuid.uuid4()}))

        self.assertEqual(response.status_code, 404, response.content)
        self.assertFalse(ModelRouteCanary.objects.exists())

    def test_assistant_models_save(self):
        response = self.admin.post(reverse('zentinelle:assistant-models-bulk'),
                                   data=json.dumps({'provider': 'openai', 'enabled_ids': []}),
                                   content_type='application/json')

        self.assertEqual(response.status_code, 200, response.content)

    def test_budget_reconciliation_locks_inside_a_transaction(self):
        from zentinelle.services.budget_reconciliation import (
            cancel_charge, reconcile_charge)
        with self.assertRaises(BudgetCharge.DoesNotExist):
            cancel_charge(uuid.uuid4(), tenant_id=TENANT_A, provider_request_id='r', provider='openai')
        with self.assertRaises(BudgetCharge.DoesNotExist):
            reconcile_charge(uuid.uuid4(), tenant_id=TENANT_A,
                             provider_usage={'provider': 'openai', 'billed_usd': '0.01', 'request_id': 'r'})

    def test_an_astrolift_approval_decision_is_recorded(self):
        from zentinelle.tests.test_astrolift_agent_keys import AGENT, mint
        from zentinelle.tests.test_astrolift_clusters import (as_install,
                                                              connect_install)
        credential, _ = connect_install([TENANT_A])
        self.assertEqual(mint(credential).status_code, 201)
        Policy.objects.create(tenant_id=TENANT_A, name='Shell needs approval',
                              policy_type=Policy.PolicyType.TOOL_PERMISSION, config={'requires_approval': ['Bash']})
        held = as_install(credential).post(
            reverse('zentinelle:astrolift-agent-evaluate', kwargs={'agent_id': AGENT}),
            {'tenant_id': TENANT_A, 'agent_id': AGENT, 'action': 'tool_call', 'user_id': 'u',
             'context': {'harness': 'claude', 'session_id': 's', 'tool_call_id': 'r1', 'tool_name': 'Bash',
                         'tool_input': {'command': 'pwd'}}}, format='json').json()['approval']['request_id']

        decision = as_install(credential).post(
            reverse('zentinelle:astrolift-agent-approval', kwargs={'agent_id': AGENT, 'request_id': held}),
            {'tenant_id': TENANT_A, 'decision': 'approve', 'actor_id': 'controller-1', 'reason': 'ok'}, format='json')

        self.assertEqual(decision.status_code, 200, decision.content)
        self.assertEqual(ApprovalRequest.objects.get(pk=held).status, ApprovalRequest.Status.APPROVED)

    def test_operator_agent_create_runs_in_a_transaction_on_its_database(self):
        from zentinelle.api.auth import ZentinelleServiceUser
        in_transaction = []

        def record(sender, **kwargs):
            in_transaction.append(connections[router.db_for_write(AgentEndpoint)].in_atomic_block)

        pre_save.connect(record, sender=AgentEndpoint)
        self.addCleanup(pre_save.disconnect, record, sender=AgentEndpoint)
        operator = APIClient()
        operator.force_authenticate(user=ZentinelleServiceUser(
            SimpleNamespace(tenant_id=TENANT_A, scopes=['read', 'write'], is_active=True, pk=1, id=1)))

        response = operator.post(reverse('zentinelle:operator-agents'), {'agent_id': 'op-bot', 'name': 'op'},
                                 format='json')

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(in_transaction, [True])

    def test_an_archive_restore_is_all_or_nothing(self):
        from zentinelle.services.privacy_lifecycle import restore_archive
        from zentinelle.services.retention import signed_retention_manifest
        good = {'id': str(uuid.uuid4()), 'tenant_id': TENANT_A, 'event_type': 'restored',
                'event_category': 'telemetry', 'payload': {}, 'status': 'processed',
                'occurred_at': '2026-01-01T00:00:00+00:00'}
        # Longer than the column: the insert fails after the first one landed.
        bad = {**good, 'id': str(uuid.uuid4()), 'event_type': 'x' * 500}
        with tempfile.NamedTemporaryFile(mode='wb') as archive:
            raw = ''.join(json.dumps(record) + '\n' for record in (good, bad)).encode()
            archive.write(raw)
            archive.flush()
            manifest = signed_retention_manifest(TENANT_A, 'events', 'archive', 2, archive.name,
                                                 archive_checksum=hashlib.sha256(raw).hexdigest())
            with self.assertRaises(Exception):
                restore_archive(manifest, TENANT_A, commit=True)

        self.assertFalse(Event.objects.filter(pk=good['id']).exists(), 'half the archive was restored')
