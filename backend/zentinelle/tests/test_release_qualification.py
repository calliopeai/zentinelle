from django.test import TestCase

from zentinelle.models import ReleaseQualification
from zentinelle.services.release_qualification import qualify_release


class ReleaseQualificationTests(TestCase):
    def test_all_required_checks_qualify_and_are_idempotent(self):
        checks = {name: True for name in ('migrations', 'auth', 'csrf', 'secret_rotation', 'dependency_scan', 'backup_restore', 'rollback')}
        record = qualify_release(release_id='rel-1', version='1.2.3', checks=checks, sbom_digest='sha256:x')
        self.assertEqual(record.status, ReleaseQualification.Status.QUALIFIED)
        self.assertEqual(qualify_release(release_id='rel-1', version='1.2.3', checks=checks).id, record.id)

    def test_missing_recovery_check_rejects(self):
        with self.assertRaisesRegex(ValueError, 'rollback'):
            qualify_release(release_id='rel-2', version='1.2.3', checks={'migrations': True})
