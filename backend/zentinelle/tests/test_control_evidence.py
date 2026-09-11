from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from zentinelle.models import ControlEvidence


class ControlEvidenceTests(TestCase):
    def test_expired_operating_evidence_is_stale(self):
        evidence = ControlEvidence.objects.create(
            tenant_id='tenant-a',
            control_id='pack:tool_permission:Tool Access',
            status=ControlEvidence.Status.VERIFIED_OPERATING,
            owner='security@example.test',
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.assertEqual(evidence.effective_status, ControlEvidence.Status.STALE)

    def test_current_failed_evidence_remains_failed(self):
        evidence = ControlEvidence.objects.create(
            tenant_id='tenant-a',
            control_id='pack:tool_permission:Tool Access',
            status=ControlEvidence.Status.FAILED,
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.assertEqual(evidence.effective_status, ControlEvidence.Status.FAILED)

    def test_coverage_states_include_observation_and_unsupported(self):
        self.assertIn('observation-only', {item.value for item in ControlEvidence.Status})
        self.assertIn('unsupported', {item.value for item in ControlEvidence.Status})
