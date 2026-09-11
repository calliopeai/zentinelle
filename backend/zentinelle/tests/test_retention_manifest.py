import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from zentinelle.services.retention import (signed_retention_manifest,
                                            verify_retention_manifest,
                                            expire_archive)


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
