import json
import tempfile
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from zentinelle.models import ReleaseQualification
from zentinelle.services.release_qualification import qualify_release


class ReleaseQualificationTests(TestCase):
    def test_all_required_checks_qualify_and_are_idempotent(self):
        checks = {
            name: True for name in (
                'migrations',
                'auth',
                'csrf',
                'secret_rotation',
                'dependency_scan',
                'backup_restore',
                'rollback')}
        digest = 'sha256:' + 'a' * 64
        record = qualify_release(
            release_id='rel-1',
            version='1.2.3',
            checks=checks,
            sbom_digest=digest)
        self.assertEqual(record.status, ReleaseQualification.Status.QUALIFIED)
        self.assertEqual(
            qualify_release(
                release_id='rel-1',
                version='1.2.3',
                checks=checks).id,
            record.id)

    def test_missing_recovery_check_rejects(self):
        with self.assertRaisesRegex(ValueError, 'rollback'):
            qualify_release(
                release_id='rel-2',
                version='1.2.3',
                checks={
                    'migrations': True})

    def test_production_requires_operational_security_evidence(self):
        checks = {
            name: True for name in (
                'migrations',
                'auth',
                'csrf',
                'secret_rotation',
                'dependency_scan',
                'backup_restore',
                'rollback')}
        with self.assertRaisesRegex(ValueError, 'tls'):
            qualify_release(
                release_id='rel-prod',
                version='1.2.3',
                checks=checks,
                environment='production')
        checks.update({'tls': True, 'oidc': True,
                      'load_slo': True, 'incident_drill': True})
        with self.assertRaisesRegex(ValueError, 'signed provenance'):
            qualify_release(
                release_id='rel-prod-no-signature',
                version='1.2.3',
                checks=checks,
                environment='production')
        from zentinelle.models import ReleaseQualification
        self.assertFalse(
            ReleaseQualification.objects.filter(
                release_id='rel-prod-no-signature').exists())
        with self.assertRaisesRegex(ValueError, 'verifiable provenance'):
            qualify_release(
                release_id='rel-prod-bad-signature',
                version='1.2.3',
                checks=checks,
                environment='production',
                signature='signed-by-someone')
        self.assertFalse(ReleaseQualification.objects.filter(
            release_id='rel-prod-bad-signature').exists())
        with self.assertRaisesRegex(ValueError, 'identify the qualified release'):
            qualify_release(
                release_id='rel-prod-replay',
                version='1.2.3',
                checks=checks,
                environment='production',
                signature='attestation://release/other-release')
        record = qualify_release(
            release_id='rel-prod-ok',
            version='1.2.3',
            checks=checks,
            environment='production',
            signature='attestation://release/rel-prod-ok')
        self.assertEqual(record.status, ReleaseQualification.Status.QUALIFIED)

    def test_non_string_signature_is_rejected_at_boundary(self):
        with self.assertRaisesRegex(ValueError, 'must be a string'):
            qualify_release(
                release_id='rel-bad-type',
                version='1.2.3',
                checks={},
                signature={
                    'ref': 'x'})

    def test_release_identifiers_are_bounded_strings(self):
        with self.assertRaisesRegex(ValueError, 'bounded strings'):
            qualify_release(release_id='', version='1.2.3', checks={})
        with self.assertRaisesRegex(ValueError, 'bounded strings'):
            qualify_release(
                release_id='rel', version={
                    'value': '1.2.3'}, checks={})

    def test_checks_must_be_bounded_boolean_object(self):
        with self.assertRaisesRegex(ValueError, 'boolean values'):
            qualify_release(
                release_id='rel-bad-checks',
                version='1.2.3',
                checks=['migrations'])
        with self.assertRaisesRegex(ValueError, 'boolean values'):
            qualify_release(
                release_id='rel-bad-checks',
                version='1.2.3',
                checks={
                    'migrations': 'true'})

    def test_rollback_evidence_is_bounded_object(self):
        with self.assertRaisesRegex(ValueError, 'rollback_evidence'):
            qualify_release(
                release_id='rel-bad-evidence',
                version='1.2.3',
                checks={},
                rollback_evidence=['x'])
        with self.assertRaisesRegex(ValueError, 'rollback_evidence'):
            qualify_release(
                release_id='rel-large-evidence',
                version='1.2.3',
                checks={},
                rollback_evidence={
                    'log': 'x' * 17000})

    def test_invalid_sbom_digest_rejects(self):
        checks = {
            name: True for name in (
                'migrations',
                'auth',
                'csrf',
                'secret_rotation',
                'dependency_scan',
                'backup_restore',
                'rollback')}
        with self.assertRaisesRegex(ValueError, 'sha256 digest'):
            qualify_release(
                release_id='rel-bad-sbom',
                version='1.2.3',
                checks=checks,
                sbom_digest='sha256:bad')

    def test_command_binds_digest_to_sbom_file(self):
        checks = {
            name: True for name in (
                'migrations',
                'auth',
                'csrf',
                'secret_rotation',
                'dependency_scan',
                'backup_restore',
                'rollback')}
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt') as sbom, tempfile.NamedTemporaryFile(mode='w', suffix='.json') as artifact:
            sbom.write('package==1.0\n')
            sbom.flush()
            import hashlib
            with open(sbom.name, 'rb') as handle:
                digest = 'sha256:' + hashlib.sha256(handle.read()).hexdigest()
            json.dump({'checks': checks, 'sbom_digest': digest}, artifact)
            artifact.flush()
            output = StringIO()
            call_command(
                'qualify_release',
                release_id='rel-file',
                release_version='1.2.3',
                checks_file=artifact.name,
                sbom_file=sbom.name,
                stdout=output)
        self.assertIn('qualified', output.getvalue())

    def test_management_command_persists_ci_artifact(self):
        checks = {
            name: True for name in (
                'migrations',
                'auth',
                'csrf',
                'secret_rotation',
                'dependency_scan',
                'backup_restore',
                'rollback')}
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as artifact:
            json.dump({'checks': checks, 'rollback_evidence': {
                      'run': 'ci'}, 'sbom_digest': 'sha256:' + 'b' * 64}, artifact)
            artifact.flush()
            output = StringIO()
            call_command(
                'qualify_release',
                release_id='rel-ci',
                release_version='1.2.3',
                checks_file=artifact.name,
                stdout=output)
        self.assertIn('qualified', output.getvalue())
