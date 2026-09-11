from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from zentinelle.models import Event
from zentinelle.models.retention_policy import LegalHold
from zentinelle.services.privacy_lifecycle import erase_tenant


class PrivacyLifecycleTests(TestCase):
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
