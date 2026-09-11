import json
import uuid
from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from zentinelle.models import PolicyChangeSet


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
