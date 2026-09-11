from django.test import TestCase

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
