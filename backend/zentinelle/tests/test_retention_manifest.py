from django.test import SimpleTestCase

from zentinelle.services.retention import (signed_retention_manifest,
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
