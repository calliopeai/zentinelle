import json
import tempfile
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from zentinelle.models import ReleaseQualification
from zentinelle.services.release_qualification import qualify_release


class ReleaseQualificationTests(TestCase):
    def test_all_required_checks_qualify_and_are_idempotent(self):
        checks = {name: True for name in ('migrations', 'auth', 'csrf', 'secret_rotation', 'dependency_scan', 'backup_restore', 'rollback')}
        digest = 'sha256:' + 'a' * 64
        record = qualify_release(release_id='rel-1', version='1.2.3', checks=checks, sbom_digest=digest)
        self.assertEqual(record.status, ReleaseQualification.Status.QUALIFIED)
        self.assertEqual(qualify_release(release_id='rel-1', version='1.2.3', checks=checks).id, record.id)

    def test_missing_recovery_check_rejects(self):
        with self.assertRaisesRegex(ValueError, 'rollback'):
            qualify_release(release_id='rel-2', version='1.2.3', checks={'migrations': True})

    def test_invalid_sbom_digest_rejects(self):
        checks = {name: True for name in ('migrations', 'auth', 'csrf', 'secret_rotation', 'dependency_scan', 'backup_restore', 'rollback')}
        with self.assertRaisesRegex(ValueError, 'sha256 digest'):
            qualify_release(release_id='rel-bad-sbom', version='1.2.3', checks=checks, sbom_digest='sha256:bad')

    def test_management_command_persists_ci_artifact(self):
        checks = {name: True for name in ('migrations', 'auth', 'csrf', 'secret_rotation', 'dependency_scan', 'backup_restore', 'rollback')}
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as artifact:
            json.dump({'checks': checks, 'rollback_evidence': {'run': 'ci'}, 'sbom_digest': 'sha256:' + 'b' * 64}, artifact)
            artifact.flush()
            output = StringIO()
            call_command('qualify_release', release_id='rel-ci', release_version='1.2.3', checks_file=artifact.name, stdout=output)
        self.assertIn('qualified', output.getvalue())
