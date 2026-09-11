from unittest.mock import patch
import hashlib
import json
import tempfile

from django.test import TestCase
from django.utils import timezone

from zentinelle.models import Event
from zentinelle.models.retention_policy import LegalHold
from zentinelle.services.privacy_lifecycle import (clear_remote_erasure_adapters,
                                                    erase_tenant,
                                                   register_remote_erasure_adapter,
                                                   restore_archive)


class PrivacyLifecycleTests(TestCase):
    def tearDown(self):
        clear_remote_erasure_adapters()

    @patch('zentinelle.services.privacy_lifecycle.held', return_value=True)
    def test_active_hold_blocks_erasure(self, _held):
        with self.assertRaisesRegex(ValueError, 'legal hold'):
            erase_tenant('tenant-a')

    @patch('zentinelle.services.clickhouse_service._get_clickhouse_url', return_value='')
    @patch('zentinelle.services.clickhouse_service.erase_tenant_analytics', return_value=False)
    def test_erasure_deletes_sql_and_records_completion_without_optional_clickhouse(self, _analytics, _url):
        Event.objects.create(tenant_id='tenant-a', event_type='test', occurred_at=timezone.now())
        result = erase_tenant('tenant-a')
        self.assertEqual(Event.objects.filter(tenant_id='tenant-a').count(), 0)
        self.assertFalse(result['clickhouse_confirmed'])
        self.assertEqual(result['records']['Event'], 1)

    @patch('zentinelle.services.clickhouse_service._get_clickhouse_url', return_value='')
    @patch('zentinelle.services.clickhouse_service.erase_tenant_analytics', return_value=False)
    def test_subject_erasure_is_scoped_and_preserves_other_subjects(self, _analytics, _url):
        Event.objects.create(tenant_id='tenant-a', user_identifier='user-a', event_type='test', occurred_at=timezone.now())
        Event.objects.create(tenant_id='tenant-a', user_identifier='user-b', event_type='test', occurred_at=timezone.now())
        result = erase_tenant('tenant-a', subject_id='user-a')
        self.assertEqual(Event.objects.filter(tenant_id='tenant-a', user_identifier='user-a').count(), 0)
        self.assertEqual(Event.objects.filter(tenant_id='tenant-a', user_identifier='user-b').count(), 1)
        self.assertEqual(result['subject_id'], 'user-a')

    def test_subject_erasure_honors_subject_legal_hold(self):
        LegalHold.objects.create(tenant_id='tenant-a', name='case', user_identifiers=['user-a'])
        with self.assertRaisesRegex(ValueError, 'this subject'):
            erase_tenant('tenant-a', subject_id='user-a')

    @patch('zentinelle.services.clickhouse_service._get_clickhouse_url', return_value='')
    @patch('zentinelle.services.clickhouse_service.erase_tenant_analytics', return_value=False)
    def test_subject_erasure_uses_authenticated_remote_adapter(self, _analytics, _url):
        from zentinelle.models import RetentionOutcome
        manifest = {'tenant_id': 'tenant-a', 'entity_type': 'user', 'action': 'archive',
                    'subject_id': 'user-a', 'destination': 's3://bucket/user-a'}
        from zentinelle.services.retention import signed_retention_manifest
        manifest = signed_retention_manifest('tenant-a', 'user', 'archive', 1, 's3://bucket/user-a', subject_id='user-a')
        RetentionOutcome.objects.create(tenant_id='tenant-a', entity_type='user', status='archived', manifest=manifest, destination=manifest['destination'])
        calls = []
        register_remote_erasure_adapter('s3', lambda **kwargs: calls.append(kwargs) or True)
        result = erase_tenant('tenant-a', subject_id='user-a')
        self.assertEqual(result['archives_deleted'], 1)
        self.assertEqual(calls[0]['tenant_id'], 'tenant-a')

    @patch('zentinelle.services.clickhouse_service._get_clickhouse_url', return_value='')
    @patch('zentinelle.services.clickhouse_service.erase_tenant_analytics', return_value=False)
    def test_unsupported_remote_archive_fails_closed(self, _analytics, _url):
        from zentinelle.models import RetentionOutcome
        from zentinelle.services.retention import signed_retention_manifest
        manifest = signed_retention_manifest('tenant-a', 'user', 'archive', 1, 's3://bucket/user-a', subject_id='user-a')
        RetentionOutcome.objects.create(tenant_id='tenant-a', entity_type='user', status='archived', manifest=manifest, destination=manifest['destination'])
        with self.assertRaisesRegex(RuntimeError, 'authenticated provider'):
            erase_tenant('tenant-a', subject_id='user-a')

    def test_restore_verifies_checksum_and_defaults_to_preview(self):
        from zentinelle.services.retention import signed_retention_manifest
        with tempfile.NamedTemporaryFile(mode='wb') as archive:
            payload = {'id': '00000000-0000-0000-0000-000000000099', 'tenant_id': 'tenant-a',
                       'event_type': 'restored', 'event_category': 'telemetry', 'payload': {},
                       'status': 'processed', 'occurred_at': '2026-01-01T00:00:00+00:00'}
            raw = (json.dumps(payload) + '\n').encode(); archive.write(raw); archive.flush()
            manifest = signed_retention_manifest('tenant-a', 'events', 'archive', 1, archive.name)
            manifest['archive_checksum'] = hashlib.sha256(raw).hexdigest()
            result = restore_archive(manifest, 'tenant-a')
            self.assertTrue(result['dry_run'])
            self.assertEqual(result['records'], 1)
            manifest['archive_checksum'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'checksum'):
                restore_archive(manifest, 'tenant-a')
