import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from zentinelle.services.retention import (expire_archive,
                                           signed_retention_manifest,
                                           verify_retention_manifest)


class RetentionManifestTests(SimpleTestCase):
    def test_manifest_has_digest_and_signed_payload(self):
        manifest = signed_retention_manifest('tenant-a', 'events', 'archive', 3, 's3://bucket/tenant-a')
        self.assertEqual(len(manifest['digest']), 64)
        self.assertIn('signature', manifest)
        self.assertEqual(manifest['record_count'], 3)

    def test_manifest_verification_rejects_tampering(self):
        manifest = signed_retention_manifest('tenant-a', 'events', 'archive', 3, 's3://bucket/tenant-a')
        self.assertTrue(verify_retention_manifest(manifest))
        manifest['record_count'] = 4
        self.assertFalse(verify_retention_manifest(manifest))

    def test_expiry_requires_verified_tenant_bound_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'archive.jsonl'
            archive.write_text('{"tenant_id":"tenant-a"}\n', encoding='utf-8')
            manifest = signed_retention_manifest('tenant-a', 'events', 'archive', 1, str(archive))
            self.assertTrue(expire_archive(manifest, 'tenant-a')['expired'])
            self.assertFalse(archive.exists())
            archive.write_text('again', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'cross-tenant'):
                expire_archive(manifest, 'tenant-b')
            self.assertTrue(archive.exists())

    def test_subject_scope_is_signed_and_tamper_evident(self):
        manifest = signed_retention_manifest('tenant-a', 'user', 'archive', 1, 'file:///tmp/user-a', subject_id='user-a')
        self.assertTrue(verify_retention_manifest(manifest))
        manifest['subject_id'] = 'user-b'
        self.assertFalse(verify_retention_manifest(manifest))

    def test_expiry_rejects_symlink_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'target'
            link = Path(directory) / 'archive-link'
            target.write_text('sensitive', encoding='utf-8')
            link.symlink_to(target)
            manifest = signed_retention_manifest('tenant-a', 'events', 'archive', 1, str(link))
            with self.assertRaisesRegex(ValueError, 'regular file'):
                expire_archive(manifest, 'tenant-a')
            self.assertTrue(target.exists())
