import json
import uuid
from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from zentinelle.models import (Policy, PolicyChangeAcknowledgement,
                               PolicyChangeSet)


class PolicyChangeSetTests(TestCase):
    def setUp(self):
        self.change = PolicyChangeSet.objects.create(
            tenant_id='tenant-a',
            title='Restrict production models',
            changes=[{'policy_id': 'new:one', 'policy_type': 'model_restriction'}],
            base_versions={'policy-1': 3},
            target_selectors={'environment': 'production'},
            created_by='alice',
        )

    def test_reviewed_rollout_state_machine_captures_evidence_and_actors(self):
        self.change.transition(PolicyChangeSet.Status.VALIDATED, actor='reviewer', validation={'passed': True})
        self.change.transition(PolicyChangeSet.Status.STAGED)
        self.change.transition(PolicyChangeSet.Status.APPROVED, actor='approver')
        self.change.transition(PolicyChangeSet.Status.PROMOTED)
        self.change.refresh_from_db()

        self.assertEqual(self.change.status, PolicyChangeSet.Status.PROMOTED)
        self.assertEqual(self.change.reviewed_by, 'reviewer')
        self.assertEqual(self.change.approved_by, 'approver')
        self.assertTrue(self.change.validation['passed'])
        self.assertIsNotNone(self.change.staged_at)
        self.assertIsNotNone(self.change.promoted_at)

    def test_invalid_transition_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Cannot transition'):
            self.change.transition(PolicyChangeSet.Status.PROMOTED)

    def test_promoted_change_can_only_be_rolled_back(self):
        for state in (
            PolicyChangeSet.Status.VALIDATED,
            PolicyChangeSet.Status.STAGED,
            PolicyChangeSet.Status.APPROVED,
            PolicyChangeSet.Status.PROMOTED,
        ):
            self.change.transition(state, actor='operator')
        self.change.transition(PolicyChangeSet.Status.ROLLED_BACK)
        self.assertEqual(self.change.status, PolicyChangeSet.Status.ROLLED_BACK)

    def test_promotion_rejects_stale_base_version(self):
        policy = Policy.objects.create(
            tenant_id='tenant-a', name='Models', policy_type='model_restriction', config={}
        )
        self.change.changes = [{'policy_id': str(policy.id), 'config': {'allowed_models': ['gpt-5']}}]
        self.change.base_versions = {str(policy.id): policy.version - 1}
        self.change.status = PolicyChangeSet.Status.APPROVED
        self.change.save(update_fields=['changes', 'base_versions', 'status', 'updated_at'])

        from zentinelle.services.policy_rollout import promote_change_set
        with self.assertRaisesRegex(ValueError, 'changed since this draft'):
            promote_change_set(self.change.id, 'tenant-a', actor='operator')

    def test_promotion_updates_policy_and_records_rollback_snapshot(self):
        policy = Policy.objects.create(
            tenant_id='tenant-a', name='Models', policy_type='model_restriction', config={'allowed_models': ['gpt-4']}
        )
        self.change.changes = [{'policy_id': str(policy.id), 'config': {'allowed_models': ['gpt-5']}}]
        self.change.base_versions = {str(policy.id): policy.version}
        self.change.status = PolicyChangeSet.Status.APPROVED
        self.change.save(update_fields=['changes', 'base_versions', 'status', 'updated_at'])

        from zentinelle.services.policy_rollout import promote_change_set
        promoted = promote_change_set(self.change.id, 'tenant-a', actor='operator')
        policy.refresh_from_db()
        self.assertEqual(promoted.status, PolicyChangeSet.Status.PROMOTED)
        self.assertEqual(policy.config, {'allowed_models': ['gpt-5']})
        self.assertEqual(promoted.applied_snapshots[0]['snapshot']['version'], 1)

    def test_rollback_restores_policy_and_advances_version(self):
        policy = Policy.objects.create(
            tenant_id='tenant-a', name='Models', policy_type='model_restriction', config={'allowed_models': ['gpt-4']}
        )
        self.change.changes = [{'policy_id': str(policy.id), 'config': {'allowed_models': ['gpt-5']}}]
        self.change.base_versions = {str(policy.id): policy.version}
        self.change.status = PolicyChangeSet.Status.APPROVED
        self.change.save(update_fields=['changes', 'base_versions', 'status', 'updated_at'])

        from zentinelle.services.policy_rollout import (promote_change_set,
                                                        rollback_change_set)
        promoted = promote_change_set(self.change.id, 'tenant-a', actor='operator')
        rolled_back = rollback_change_set(promoted.id, 'tenant-a', actor='admin')
        policy.refresh_from_db()
        self.assertEqual(rolled_back.status, PolicyChangeSet.Status.ROLLED_BACK)
        self.assertEqual(policy.config, {'allowed_models': ['gpt-4']})
        self.assertEqual(policy.version, 3)

    def test_promotion_requires_declared_acknowledgements(self):
        policy = Policy.objects.create(
            tenant_id='tenant-a', name='Models', policy_type='model_restriction', config={}
        )
        self.change.changes = [{'policy_id': str(policy.id), 'config': {'allowed_models': ['gpt-5']}}]
        self.change.base_versions = {str(policy.id): policy.version}
        self.change.validation = {
            'required_acknowledgements': [
                {'subject_type': 'endpoint', 'subject_id': 'endpoint-1'},
            ],
        }
        self.change.status = PolicyChangeSet.Status.APPROVED
        self.change.save(update_fields=['changes', 'base_versions', 'validation', 'status', 'updated_at'])

        from zentinelle.services.policy_rollout import promote_change_set
        with self.assertRaisesRegex(ValueError, 'acknowledgements are missing'):
            promote_change_set(self.change.id, 'tenant-a', actor='admin')


class PolicyChangeSetAPITests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(username='operator-1', password='test')
        self.user.groups.add(Group.objects.get_or_create(name='zentinelle_operator')[0])

    @patch('zentinelle.api.views.policy_change.get_tenant_id_from_request', return_value='tenant-a')
    def test_create_and_list_are_tenant_scoped(self, _tenant):
        from zentinelle.api.views.policy_change import PolicyChangeSetListView

        request = self.factory.post(
            '/policy-changes',
            data=json.dumps({'title': 'Draft', 'changes': []}),
            content_type='application/json',
        )
        request.user = self.user
        created = PolicyChangeSetListView.as_view()(request)
        self.assertEqual(created.status_code, 201)

        other = PolicyChangeSet.objects.create(tenant_id='tenant-b', title='Other')
        request = self.factory.get('/policy-changes')
        request.user = self.user
        listed = PolicyChangeSetListView.as_view()(request)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data['results'][0]['tenant_id'], 'tenant-a')
        self.assertNotIn(str(other.id), {row['id'] for row in listed.data['results']})

    @patch('zentinelle.api.views.policy_change.get_tenant_id_from_request', return_value='tenant-a')
    def test_transition_requires_valid_state_and_scopes_change(self, _tenant):
        from zentinelle.api.views.policy_change import \
            PolicyChangeSetTransitionView

        change = PolicyChangeSet.objects.create(tenant_id='tenant-a', title='Draft')
        request = self.factory.post(
            '/policy-changes/transition',
            data=json.dumps({'status': PolicyChangeSet.Status.VALIDATED}),
            content_type='application/json',
        )
        request.user = self.user
        response = PolicyChangeSetTransitionView.as_view()(request, change_id=uuid.UUID(str(change.id)))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], PolicyChangeSet.Status.VALIDATED)

    @patch('zentinelle.api.views.policy_change.get_tenant_id_from_request', return_value='tenant-a')
    def test_operator_cannot_approve_or_promote(self, _tenant):
        from zentinelle.api.views.policy_change import \
            PolicyChangeSetTransitionView

        change = PolicyChangeSet.objects.create(tenant_id='tenant-a', title='Draft')
        request = self.factory.post(
            '/policy-changes/transition',
            data=json.dumps({'status': PolicyChangeSet.Status.APPROVED}),
            content_type='application/json',
        )
        request.user = self.user
        response = PolicyChangeSetTransitionView.as_view()(request, change_id=uuid.UUID(str(change.id)))
        self.assertEqual(response.status_code, 403)

    @patch('zentinelle.api.views.policy_change.get_tenant_id_from_request', return_value='tenant-a')
    def test_authenticated_operator_acknowledges_staged_change(self, _tenant):
        from zentinelle.api.views.policy_change import \
            PolicyChangeAcknowledgementView

        change = PolicyChangeSet.objects.create(
            tenant_id='tenant-a', title='Staged', status=PolicyChangeSet.Status.STAGED,
        )
        request = self.factory.post(
            '/policy-changes/acknowledge',
            data=json.dumps({
                'policy_version': {'policy-1': 4},
                'acknowledgement_digest': 'sha256:policy-1-v4',
            }),
            content_type='application/json',
        )
        request.user = self.user
        response = PolicyChangeAcknowledgementView.as_view()(request, change_id=uuid.UUID(str(change.id)))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], PolicyChangeAcknowledgement.Status.ACKNOWLEDGED)
        self.assertTrue(PolicyChangeAcknowledgement.objects.filter(change_set=change).exists())
