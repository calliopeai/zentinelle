"""
Tests for event retention TTL enforcement and SIEM export (issue #35).

All tests use unittest.TestCase + unittest.mock only — no database required.
"""
import io
import json
import unittest
from datetime import datetime, timezone as dt_timezone
from unittest.mock import MagicMock, patch, call


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
    return r


# ---------------------------------------------------------------------------
# Task: enforce_retention_policies
# ---------------------------------------------------------------------------

class TestEnforceRetentionTask(unittest.TestCase):
    """Tests for zentinelle.tasks.scheduled.enforce_retention_policies."""

    def _run_task(
        self,
        policies,
        mock_policy_qs,
        mock_event_qs,
        mock_audit_qs,
        mock_event_delete_result=(3, {}),
        mock_audit_delete_result=(5, {}),
    ):
        """
        Patch the ORM and run the task, returning its result dict.

        patches:
            Policy.objects.filter  -> mock_policy_qs (iterable of policy mocks)
            Event.objects.filter   -> mock_event_qs
            AuditLog.objects.filter -> mock_audit_qs
            AuditLog.objects.create -> MagicMock()
        """
        from zentinelle.tasks.scheduled import enforce_retention_policies

        policy_filter_mock = MagicMock(return_value=iter(policies))
        event_filter_mock = MagicMock()
        audit_filter_mock = MagicMock()

        event_delete_chain = MagicMock()
        event_delete_chain.delete.return_value = mock_event_delete_result

        audit_delete_chain = MagicMock()
        audit_delete_chain.delete.return_value = mock_audit_delete_result

        event_filter_mock.return_value = event_delete_chain
        audit_filter_mock.return_value = audit_delete_chain

        with patch('zentinelle.models.Policy') as MockPolicy, \
             patch('zentinelle.models.AuditLog') as MockAuditLog, \
             patch('zentinelle.models.Event') as MockEvent:

            MockPolicy.objects.filter.return_value = iter(policies)
            MockPolicy.PolicyType.DATA_RETENTION = 'data_retention'
            MockPolicy.Enforcement.ENFORCE = 'enforce'

            MockEvent.objects.filter.return_value = event_delete_chain
            MockAuditLog.objects.filter.return_value = audit_delete_chain
            MockAuditLog.Action.DELETE = 'delete'
            MockAuditLog.objects.create.return_value = MagicMock()

            result = enforce_retention_policies()

        return result, MockEvent, MockAuditLog

    # -----------------------------------------------------------------------
    # Test: task deletes old Event records
    # -----------------------------------------------------------------------
    def test_deletes_old_event_records(self):
        """Task calls delete() on the Event queryset filtered by tenant and cutoff."""
        policy = _make_policy(event_retention_days=30, audit_log_retention_days=365)

        from zentinelle.tasks.scheduled import enforce_retention_policies

        event_qs_mock = MagicMock()
        event_qs_mock.delete.return_value = (7, {})

        audit_qs_mock = MagicMock()
        audit_qs_mock.delete.return_value = (0, {})

        with patch('zentinelle.models.Policy') as MockPolicy, \
             patch('zentinelle.models.AuditLog') as MockAuditLog, \
             patch('zentinelle.models.Event') as MockEvent:

            MockPolicy.objects.filter.return_value = [policy]
            MockPolicy.PolicyType.DATA_RETENTION = 'data_retention'
            MockPolicy.Enforcement.ENFORCE = 'enforce'

            MockEvent.objects.filter.return_value = event_qs_mock
            MockAuditLog.objects.filter.return_value = audit_qs_mock
            MockAuditLog.Action.DELETE = 'delete'
            MockAuditLog.objects.create.return_value = MagicMock()

            result = enforce_retention_policies()

        MockEvent.objects.filter.assert_called_once()
        call_kwargs = MockEvent.objects.filter.call_args
        self.assertEqual(call_kwargs.kwargs['tenant_id'], 'tenant1')
        self.assertIn('occurred_at__lt', call_kwargs.kwargs)

        event_qs_mock.delete.assert_called_once()
        self.assertEqual(result['events_deleted'], 7)

    # -----------------------------------------------------------------------
    # Test: task deletes old AuditLog records
    # -----------------------------------------------------------------------
    def test_deletes_old_audit_log_records(self):
        """Task calls delete() on the AuditLog queryset filtered by tenant and cutoff."""
        policy = _make_policy(event_retention_days=90, audit_log_retention_days=180)

        from zentinelle.tasks.scheduled import enforce_retention_policies

        event_qs_mock = MagicMock()
        event_qs_mock.delete.return_value = (0, {})

        audit_qs_mock = MagicMock()
        audit_qs_mock.delete.return_value = (11, {})

        with patch('zentinelle.models.Policy') as MockPolicy, \
             patch('zentinelle.models.AuditLog') as MockAuditLog, \
             patch('zentinelle.models.Event') as MockEvent:

            MockPolicy.objects.filter.return_value = [policy]
            MockPolicy.PolicyType.DATA_RETENTION = 'data_retention'
            MockPolicy.Enforcement.ENFORCE = 'enforce'

            MockEvent.objects.filter.return_value = event_qs_mock
            MockAuditLog.objects.filter.return_value = audit_qs_mock
            MockAuditLog.Action.DELETE = 'delete'
            MockAuditLog.objects.create.return_value = MagicMock()

            result = enforce_retention_policies()

        # AuditLog.objects.filter was called at least once for deletion
        filter_calls = MockAuditLog.objects.filter.call_args_list
        deletion_calls = [c for c in filter_calls if 'timestamp__lt' in c.kwargs]
        self.assertTrue(len(deletion_calls) >= 1, "Expected at least one deletion filter call on AuditLog")
        self.assertEqual(deletion_calls[0].kwargs['tenant_id'], 'tenant1')

        audit_qs_mock.delete.assert_called()
        self.assertEqual(result['audit_logs_deleted'], 11)

    # -----------------------------------------------------------------------
    # Test: per-tenant failure isolation
    # -----------------------------------------------------------------------
    def test_skips_tenant_gracefully_on_exception(self):
        """A per-tenant exception increments tenants_failed but does not abort the task."""
        good_policy = _make_policy(tenant_id='tenant-good', event_retention_days=30, audit_log_retention_days=365)
        bad_policy = _make_policy(tenant_id='tenant-bad', event_retention_days=30, audit_log_retention_days=365)

        from zentinelle.tasks.scheduled import enforce_retention_policies

        good_qs = MagicMock()
        good_qs.delete.return_value = (2, {})

        bad_qs = MagicMock()
        bad_qs.delete.side_effect = RuntimeError("DB exploded")

        audit_good_qs = MagicMock()
        audit_good_qs.delete.return_value = (3, {})

        def event_filter_side_effect(**kwargs):
            if kwargs.get('tenant_id') == 'tenant-bad':
                raise RuntimeError("DB exploded")
            return good_qs

        def audit_filter_side_effect(**kwargs):
            if kwargs.get('tenant_id') == 'tenant-bad':
                return bad_qs
            return audit_good_qs

        with patch('zentinelle.models.Policy') as MockPolicy, \
             patch('zentinelle.models.AuditLog') as MockAuditLog, \
             patch('zentinelle.models.Event') as MockEvent:

            MockPolicy.objects.filter.return_value = [good_policy, bad_policy]
            MockPolicy.PolicyType.DATA_RETENTION = 'data_retention'
            MockPolicy.Enforcement.ENFORCE = 'enforce'

            MockEvent.objects.filter.side_effect = event_filter_side_effect
            MockAuditLog.objects.filter.side_effect = audit_filter_side_effect
            MockAuditLog.Action.DELETE = 'delete'
            MockAuditLog.objects.create.return_value = MagicMock()

            result = enforce_retention_policies()

        self.assertEqual(result['tenants_failed'], 1)
        # Good tenant's events were still deleted
        self.assertGreater(result['events_deleted'], 0)


# ---------------------------------------------------------------------------
# View: AuditExportView
# ---------------------------------------------------------------------------

class TestAuditExportView(unittest.TestCase):
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
        from rest_framework.exceptions import AuthenticationFailed

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
        lines = [l for l in content.splitlines() if l.strip()]
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
        lines = [l for l in content.splitlines() if l.strip()]
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
        lines = [l for l in full.splitlines() if l.strip()]

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
