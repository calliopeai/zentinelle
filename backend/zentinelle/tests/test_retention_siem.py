"""
Tests for event retention TTL enforcement and SIEM export (issue #35).

All tests use unittest.TestCase + unittest.mock only — no database required.
"""
import json
import tempfile
import unittest
from datetime import datetime
from datetime import timezone as dt_timezone
from unittest.mock import MagicMock, patch

from django.test import TestCase

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_policy(
    tenant_id='tenant1',
    name='Test Retention',
    event_retention_days=90,
    audit_log_retention_days=365,
    auto_delete_user_data=False,
):
    """Return a minimal Policy-like mock object with data_retention config."""
    p = MagicMock()
    p.tenant_id = tenant_id
    p.name = name
    p.config = {
        'event_retention_days': event_retention_days,
        'audit_log_retention_days': audit_log_retention_days,
        'auto_delete_user_data': auto_delete_user_data,
    }
    return p


def _make_audit_record(
    record_id='aaaaaaaa-0000-0000-0000-000000000001',
    tenant_id='tenant1',
    action='create',
    ext_user_id='user1',
    resource_type='policy',
    resource_id='res-001',
    chain_sequence=1,
    entry_hash='abc123',
):
    """Return a minimal AuditLog-like mock object."""
    r = MagicMock()
    r.id = record_id
    r.tenant_id = tenant_id
    r.action = action
    r.timestamp = datetime(2026, 1, 1, 0, 0, 0, tzinfo=dt_timezone.utc)
    r.ext_user_id = ext_user_id
    r.resource_type = resource_type
    r.resource_id = resource_id
    r.chain_sequence = chain_sequence
    r.entry_hash = entry_hash
    r.hash_version = 2
    r.chain_hash = 'chain-hash'
    r.api_key_prefix = ''
    r.ip_address = None
    r.user_agent = ''
    r.resource_name = ''
    r.changes = {}
    r.metadata = {}
    return r


# ---------------------------------------------------------------------------
# Task: enforce_retention_policies
# ---------------------------------------------------------------------------

class TestEnforceRetentionTask(TestCase):
    def setUp(self):
        from datetime import timedelta

        from django.utils import timezone

        from zentinelle.models import AuditLog, Event
        self.old = timezone.now() - timedelta(days=800)
        self.audit = AuditLog.objects.create(tenant_id='tenant1', action='update', resource_type='policy', resource_id='p', timestamp=self.old)
        self.event = Event.objects.create(tenant_id='tenant1', event_type='usage', event_category='telemetry', status='processed', occurred_at=self.old)

    def test_both_cleanup_paths_respect_holds_then_delete_expired_data(self):
        from zentinelle.models import AuditLog, Event
        from zentinelle.models.retention_policy import LegalHold
        from zentinelle.tasks.scheduled import (cleanup_old_events,
                                                enforce_retention_policies)
        hold = LegalHold.objects.create(tenant_id='tenant1', name='Hold', applies_to_all=True)
        for task in (cleanup_old_events, enforce_retention_policies):
            self.assertEqual(task()['tenants_failed'], 0)
            self.assertTrue(Event.objects.filter(pk=self.event.pk).exists())
            self.assertTrue(AuditLog.objects.filter(pk=self.audit.pk).exists())
        hold.release()
        result = cleanup_old_events()
        self.assertEqual(result['tenants_failed'], 0)
        self.assertFalse(Event.objects.filter(pk=self.event.pk).exists())
        self.assertFalse(AuditLog.objects.filter(pk=self.audit.pk).exists())

    def test_minimum_retention_and_archive_intent_preserve_data(self):
        from zentinelle.models import Event
        from zentinelle.models.retention_policy import RetentionPolicy
        from zentinelle.tasks.scheduled import cleanup_old_events
        policy = RetentionPolicy.objects.create(tenant_id='tenant1', name='Long retention', entity_type='events', retention_days=30, minimum_retention_days=1000)
        cleanup_old_events()
        self.assertTrue(Event.objects.filter(pk=self.event.pk).exists())
        policy.minimum_retention_days = None
        policy.expiration_action = 'archive'
        policy.save()
        result = cleanup_old_events()
        self.assertTrue(Event.objects.filter(pk=self.event.pk).exists())
        self.assertTrue(result['preserved_for_review'])

    def test_archive_writes_verified_payload_before_deleting_expired_records(self):
        from zentinelle.models import Event, RetentionOutcome
        from zentinelle.models.retention_policy import RetentionPolicy
        from zentinelle.services.retention import verify_retention_manifest
        from zentinelle.tasks.scheduled import cleanup_old_events

        with tempfile.TemporaryDirectory() as archive_dir:
            RetentionPolicy.objects.create(
                tenant_id='tenant1', name='Archive events', entity_type='events',
                retention_days=30, expiration_action='archive', archive_location=archive_dir,
            )
            result = cleanup_old_events()
            self.assertEqual(result['tenants_failed'], 0)
            self.assertFalse(Event.objects.filter(pk=self.event.pk).exists())
            outcome = RetentionOutcome.objects.get(tenant_id='tenant1', entity_type='events')
            self.assertEqual(outcome.status, RetentionOutcome.Status.ARCHIVED)
            self.assertTrue(verify_retention_manifest(outcome.manifest))
            with open(outcome.destination, encoding='utf-8') as archived:
                payload = json.loads(archived.readline())
            self.assertEqual(payload['id'], str(self.event.id))

    def test_archive_rejects_unconfigured_remote_transport_and_preserves_source(self):
        from zentinelle.models import Event, RetentionOutcome
        from zentinelle.models.retention_policy import RetentionPolicy
        from zentinelle.tasks.scheduled import cleanup_old_events

        RetentionPolicy.objects.create(
            tenant_id='tenant1', name='Remote archive', entity_type='events',
            retention_days=30, expiration_action='archive', archive_location='s3://bucket/tenant1',
        )
        result = cleanup_old_events()
        self.assertGreaterEqual(result['tenants_failed'], 1)
        self.assertTrue(Event.objects.filter(pk=self.event.pk).exists())
        self.assertTrue(RetentionOutcome.objects.filter(
            tenant_id='tenant1', entity_type='events', status=RetentionOutcome.Status.FAILED,
        ).exists())

    def test_one_tenant_failure_does_not_delete_its_data(self):
        from zentinelle.models import Event
        from zentinelle.tasks.scheduled import cleanup_old_events
        with patch('zentinelle.services.retention.retention_decision', side_effect=ValueError('Invalid retention')):
            result = cleanup_old_events()
        self.assertEqual(result['tenants_failed'], 1)
        self.assertTrue(Event.objects.filter(pk=self.event.pk).exists())


class TestAuditExportView(unittest.TestCase):
    def setUp(self):
        patcher = patch('zentinelle.services.audit_chain.checkpoint', return_value='signed-test-checkpoint')
        patcher.start()
        self.addCleanup(patcher.stop)

    """Tests for zentinelle.api.views.audit_export.AuditExportView."""

    def _make_request(self, params=None, key='sk_agent_testkey'):
        """Build a minimal mock request object."""
        req = MagicMock()
        req.META = {'HTTP_X_ZENTINELLE_KEY': key}
        req.query_params = params or {}
        return req

    # -----------------------------------------------------------------------
    # Test: 401 for missing key
    # -----------------------------------------------------------------------
    def test_returns_401_for_missing_key(self):
        """AuditExportView returns 401 when no API key is provided."""
        from zentinelle.api.views.audit_export import AuditExportView

        view = AuditExportView()

        with patch('zentinelle.api.views.audit_export.get_tenant_id_from_request', return_value=None):
            req = self._make_request(
                params={'from': '2026-01-01', 'to': '2026-01-31'},
                key='',
            )
            response = view.get(req)

        self.assertEqual(response.status_code, 401)

    # -----------------------------------------------------------------------
    # Test: 400 for missing from/to params
    # -----------------------------------------------------------------------
    def test_returns_400_for_missing_from_to(self):
        """AuditExportView returns 400 when from or to params are absent."""
        from zentinelle.api.views.audit_export import AuditExportView

        view = AuditExportView()

        with patch('zentinelle.api.views.audit_export.get_tenant_id_from_request', return_value='tenant1'):
            # Neither param
            req = self._make_request(params={})
            response = view.get(req)
            self.assertEqual(response.status_code, 400)

            # Missing 'to'
            req2 = self._make_request(params={'from': '2026-01-01'})
            response2 = view.get(req2)
            self.assertEqual(response2.status_code, 400)

            # Missing 'from'
            req3 = self._make_request(params={'to': '2026-01-31'})
            response3 = view.get(req3)
            self.assertEqual(response3.status_code, 400)

    # -----------------------------------------------------------------------
    # Test: NDJSON streaming
    # -----------------------------------------------------------------------
    def test_streams_ndjson_with_correct_content_type(self):
        """AuditExportView streams NDJSON with content-type application/x-ndjson."""
        from zentinelle.api.views.audit_export import AuditExportView

        view = AuditExportView()
        record = _make_audit_record()

        mock_qs = MagicMock()
        mock_qs.order_by.return_value = mock_qs
        mock_qs.iterator.return_value = iter([record])

        mock_audit_log = MagicMock()
        mock_audit_log.objects.filter.return_value = mock_qs

        with patch('zentinelle.api.views.audit_export.get_tenant_id_from_request', return_value='tenant1'), \
                patch('zentinelle.api.views.audit_export.AuditLog', mock_audit_log):

            req = self._make_request(params={
                'from': '2026-01-01',
                'to': '2026-01-31',
                'format': 'ndjson',
            })
            response = view.get(req)

        self.assertEqual(response['Content-Type'], 'application/x-ndjson')

        # Consume the streaming content
        content = b''.join(response.streaming_content).decode()
        lines = [line for line in content.splitlines() if line.strip()]
        self.assertEqual(len(lines), 1)

        obj = json.loads(lines[0])
        self.assertEqual(obj['tenant_id'], 'tenant1')
        self.assertEqual(obj['action'], 'create')
        self.assertIn('id', obj)
        self.assertIn('timestamp', obj)
        self.assertIn('entry_hash', obj)

    # -----------------------------------------------------------------------
    # Test: CSV streaming
    # -----------------------------------------------------------------------
    def test_streams_csv_with_correct_content_type(self):
        """AuditExportView streams CSV with content-type text/csv."""
        from zentinelle.api.views.audit_export import AuditExportView

        view = AuditExportView()
        record = _make_audit_record()

        mock_qs = MagicMock()
        mock_qs.order_by.return_value = mock_qs
        mock_qs.iterator.return_value = iter([record])

        mock_audit_log = MagicMock()
        mock_audit_log.objects.filter.return_value = mock_qs

        with patch('zentinelle.api.views.audit_export.get_tenant_id_from_request', return_value='tenant1'), \
                patch('zentinelle.api.views.audit_export.AuditLog', mock_audit_log):

            req = self._make_request(params={
                'from': '2026-01-01',
                'to': '2026-01-31',
                'format': 'csv',
            })
            response = view.get(req)

        self.assertIn('text/csv', response['Content-Type'])

        content = b''.join(response.streaming_content).decode()
        lines = [line for line in content.splitlines() if line.strip()]
        # First line is header
        self.assertGreaterEqual(len(lines), 2)
        self.assertIn('tenant_id', lines[0])
        self.assertIn('action', lines[0])


# ---------------------------------------------------------------------------
# View: RetentionStatusView
# ---------------------------------------------------------------------------

class TestRetentionStatusView(unittest.TestCase):
    """Tests for zentinelle.api.views.retention_status.RetentionStatusView."""

    def _make_request(self):
        req = MagicMock()
        req.META = {'HTTP_X_ZENTINELLE_KEY': 'sk_agent_testkey'}
        req.query_params = {}
        return req

    def test_returns_policy_config_list(self):
        """RetentionStatusView returns list of data_retention policy configs."""
        from zentinelle.api.views.retention_status import RetentionStatusView

        hipaa_policy = MagicMock()
        hipaa_policy.name = 'HIPAA: Data Retention'
        hipaa_policy.config = {
            'event_retention_days': 2555,
            'audit_log_retention_days': 2555,
            'auto_delete_user_data': False,
        }

        gdpr_policy = MagicMock()
        gdpr_policy.name = 'GDPR: Data Retention Limits'
        gdpr_policy.config = {
            'event_retention_days': 365,
            'audit_log_retention_days': 730,
            'auto_delete_user_data': True,
        }

        mock_qs = MagicMock()
        mock_qs.order_by.return_value = [hipaa_policy, gdpr_policy]

        MockPolicy = MagicMock()
        MockPolicy.objects.filter.return_value = mock_qs
        MockPolicy.PolicyType.DATA_RETENTION = 'data_retention'

        view = RetentionStatusView()
        req = self._make_request()

        with patch('zentinelle.api.views.retention_status.get_tenant_id_from_request', return_value='tenant1'), \
                patch('zentinelle.api.views.retention_status.Policy', MockPolicy):

            response = view.get(req)

        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertIn('policies', data)
        self.assertEqual(len(data['policies']), 2)

        hipaa = data['policies'][0]
        self.assertEqual(hipaa['policy_name'], 'HIPAA: Data Retention')
        self.assertEqual(hipaa['event_retention_days'], 2555)
        self.assertEqual(hipaa['audit_log_retention_days'], 2555)
        self.assertFalse(hipaa['auto_delete_user_data'])

        gdpr = data['policies'][1]
        self.assertEqual(gdpr['policy_name'], 'GDPR: Data Retention Limits')
        self.assertEqual(gdpr['event_retention_days'], 365)
        self.assertTrue(gdpr['auto_delete_user_data'])

    def test_returns_401_when_no_tenant(self):
        """RetentionStatusView returns 401 when tenant cannot be resolved."""
        from zentinelle.api.views.retention_status import RetentionStatusView

        view = RetentionStatusView()
        req = self._make_request()

        with patch('zentinelle.api.views.retention_status.get_tenant_id_from_request', return_value=None):
            response = view.get(req)

        self.assertEqual(response.status_code, 401)


# ---------------------------------------------------------------------------
# Streaming helpers: _stream_ndjson, _stream_csv, _stream_cef
# ---------------------------------------------------------------------------

class TestStreamingHelpers(unittest.TestCase):
    """Unit tests for the NDJSON/CSV/CEF generator functions."""

    def _make_records(self, count=2):
        records = []
        for i in range(count):
            r = _make_audit_record(
                record_id=f'aaaaaaaa-0000-0000-0000-{i:012d}',
                tenant_id='tenant1',
                action='create',
                ext_user_id=f'user{i}',
                resource_type='policy',
                resource_id=f'res-{i:03d}',
                chain_sequence=i + 1,
                entry_hash=f'hash{i}',
            )
            records.append(r)
        return records

    def test_ndjson_yields_one_line_per_record(self):
        from zentinelle.api.views.audit_export import _stream_ndjson

        records = self._make_records(3)
        mock_qs = MagicMock()
        mock_qs.iterator.return_value = iter(records)

        lines = list(_stream_ndjson(mock_qs))
        self.assertEqual(len(lines), 3)
        for line in lines:
            self.assertTrue(line.endswith('\n'))
            obj = json.loads(line)
            self.assertIn('id', obj)
            self.assertIn('tenant_id', obj)
            self.assertIn('action', obj)
            self.assertIn('entry_hash', obj)

    def test_csv_first_line_is_header(self):
        from zentinelle.api.views.audit_export import _stream_csv

        records = self._make_records(2)
        mock_qs = MagicMock()
        mock_qs.iterator.return_value = iter(records)

        chunks = list(_stream_csv(mock_qs))
        full = ''.join(chunks)
        lines = [line for line in full.splitlines() if line.strip()]

        self.assertGreaterEqual(len(lines), 3)  # header + 2 data rows
        header = lines[0]
        self.assertIn('tenant_id', header)
        self.assertIn('action', header)
        self.assertIn('entry_hash', header)

    def test_cef_format_structure(self):
        from zentinelle.api.views.audit_export import _stream_cef

        records = self._make_records(1)
        mock_qs = MagicMock()
        mock_qs.iterator.return_value = iter(records)

        lines = list(_stream_cef(mock_qs))
        self.assertEqual(len(lines), 1)
        line = lines[0]
        self.assertTrue(line.startswith('CEF:0|Zentinelle|AuditLog|1.0|'))
        self.assertIn('tenant=tenant1', line)
        self.assertIn('resource=policy/res-000', line)


if __name__ == '__main__':
    unittest.main()
