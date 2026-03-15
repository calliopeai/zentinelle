"""
Tests for compliance report export system.

Uses unittest.TestCase + unittest.mock only. No database required.
"""
import json
import unittest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_report(
    pk=1,
    tenant_id='tenant-1',
    report_type='control_coverage',
    status='pending',
    fmt='csv',
    file_path='',
    error_message='',
    created_at=None,
    completed_at=None,
    params=None,
):
    r = MagicMock()
    r.id = pk
    r.pk = pk
    r.tenant_id = tenant_id
    r.report_type = report_type
    r.status = status
    r.format = fmt
    r.file_path = file_path
    r.error_message = error_message
    r.created_at = created_at
    r.completed_at = completed_at
    r.params = params or {}
    return r


def _make_policy(
    name='Test Policy',
    policy_type='audit_policy',
    enforcement='enforce',
    enabled=True,
):
    p = MagicMock()
    p.name = name
    p.policy_type = policy_type
    p.enforcement = enforcement
    p.enabled = enabled
    return p


# ---------------------------------------------------------------------------
# Tests: rows_to_csv
# ---------------------------------------------------------------------------

class TestRowsToCsv(unittest.TestCase):

    def _call(self, headers, rows):
        from zentinelle.services.report_generator import rows_to_csv
        return rows_to_csv(headers, rows)

    def test_returns_string(self):
        result = self._call(['a', 'b'], [{'a': 1, 'b': 2}])
        self.assertIsInstance(result, str)

    def test_has_header_row(self):
        result = self._call(['name', 'value'], [{'name': 'foo', 'value': 'bar'}])
        lines = result.strip().splitlines()
        self.assertEqual(lines[0], 'name,value')

    def test_has_data_row(self):
        result = self._call(['name', 'value'], [{'name': 'foo', 'value': 'bar'}])
        lines = result.strip().splitlines()
        self.assertEqual(len(lines), 2)
        self.assertIn('foo', lines[1])
        self.assertIn('bar', lines[1])

    def test_empty_rows_returns_header_only(self):
        result = self._call(['x', 'y'], [])
        lines = result.strip().splitlines()
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0], 'x,y')

    def test_multiple_rows(self):
        rows = [{'a': i, 'b': i * 2} for i in range(5)]
        result = self._call(['a', 'b'], rows)
        lines = result.strip().splitlines()
        self.assertEqual(len(lines), 6)  # header + 5 data rows


# ---------------------------------------------------------------------------
# Tests: generate_control_coverage
# ---------------------------------------------------------------------------

class TestGenerateControlCoverage(unittest.TestCase):
    """
    Policy and get_pack are late imports inside generate_control_coverage, so we
    patch them at their source locations (zentinelle.models and
    zentinelle.services.compliance_packs) which is where the late import resolves.
    """

    def _call(self, tenant_id, pack_name, **kwargs):
        from zentinelle.services.report_generator import generate_control_coverage
        return generate_control_coverage(tenant_id, pack_name, **kwargs)

    def test_returns_active_status_for_enforce_policy(self):
        """Active enforce policy => status 'active'."""
        pack_data = {
            'name': 'hipaa',
            'display_name': 'HIPAA',
            'policies': [
                {
                    'name': 'HIPAA: PHI Output Blocking',
                    'policy_type': 'output_filter',
                    'enforcement': 'enforce',
                },
            ],
        }

        mock_policy = _make_policy(
            name='HIPAA: PHI Output Blocking',
            enforcement='enforce',
        )

        mock_policy_cls = MagicMock()
        mock_policy_cls.objects.filter.return_value.first.return_value = mock_policy
        mock_policy_cls.Enforcement.AUDIT = 'audit'

        import zentinelle.services.compliance_packs as packs_module
        import zentinelle.models as models_module

        original_get_pack = packs_module.get_pack
        original_policy = models_module.Policy
        try:
            packs_module.get_pack = lambda name: pack_data
            models_module.Policy = mock_policy_cls
            rows = self._call('tenant-1', 'hipaa')
        finally:
            packs_module.get_pack = original_get_pack
            models_module.Policy = original_policy

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['status'], 'active')
        self.assertEqual(row['actual_enforcement'], 'enforce')
        self.assertEqual(row['control_name'], 'HIPAA: PHI Output Blocking')

    def test_returns_inactive_for_missing_policy(self):
        """No matching policy => status 'inactive'."""
        pack_data = {
            'name': 'hipaa',
            'display_name': 'HIPAA',
            'policies': [
                {
                    'name': 'HIPAA: PHI Output Blocking',
                    'policy_type': 'output_filter',
                    'enforcement': 'enforce',
                },
            ],
        }

        mock_policy_cls = MagicMock()
        mock_policy_cls.objects.filter.return_value.first.return_value = None
        mock_policy_cls.Enforcement.AUDIT = 'audit'

        import zentinelle.services.compliance_packs as packs_module
        import zentinelle.models as models_module

        original_get_pack = packs_module.get_pack
        original_policy = models_module.Policy
        try:
            packs_module.get_pack = lambda name: pack_data
            models_module.Policy = mock_policy_cls
            rows = self._call('tenant-1', 'hipaa')
        finally:
            packs_module.get_pack = original_get_pack
            models_module.Policy = original_policy

        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['status'], 'inactive')
        self.assertEqual(row['actual_enforcement'], '')

    def test_returns_audit_only_for_audit_enforcement(self):
        """Policy with enforcement='audit' => status 'audit-only'."""
        pack_data = {
            'name': 'soc2',
            'display_name': 'SOC 2',
            'policies': [
                {
                    'name': 'SOC2: Audit Logging',
                    'policy_type': 'audit_policy',
                    'enforcement': 'enforce',
                },
            ],
        }

        mock_policy = _make_policy(name='SOC2: Audit Logging', enforcement='audit')
        mock_policy_cls = MagicMock()
        mock_policy_cls.objects.filter.return_value.first.return_value = mock_policy
        mock_policy_cls.Enforcement.AUDIT = 'audit'

        import zentinelle.services.compliance_packs as packs_module
        import zentinelle.models as models_module

        original_get_pack = packs_module.get_pack
        original_policy = models_module.Policy
        try:
            packs_module.get_pack = lambda name: pack_data
            models_module.Policy = mock_policy_cls
            rows = self._call('tenant-1', 'soc2')
        finally:
            packs_module.get_pack = original_get_pack
            models_module.Policy = original_policy

        self.assertEqual(rows[0]['status'], 'audit-only')

    def test_raises_for_unknown_pack(self):
        """Unknown pack name raises ValueError."""
        import zentinelle.services.compliance_packs as packs_module

        original_get_pack = packs_module.get_pack
        try:
            packs_module.get_pack = lambda name: None
            with self.assertRaises(ValueError):
                self._call('tenant-1', 'nonexistent_pack')
        finally:
            packs_module.get_pack = original_get_pack


# ---------------------------------------------------------------------------
# Tests: API views
# ---------------------------------------------------------------------------

class TestReportCreateView(unittest.TestCase):

    def setUp(self):
        from django.test import RequestFactory
        self.factory = RequestFactory()

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.Report')
    def test_create_returns_201_with_id_and_pending_status(self, mock_report_cls, mock_tenant):
        """POST /reports/ returns 201 with id and status='pending'."""
        from zentinelle.api.views.reports import ReportCreateView

        report = _make_report(pk=42, status='pending')
        mock_report_cls.objects.create.return_value = report
        mock_report_cls.Status.PENDING = 'pending'
        mock_report_cls.ReportType = MagicMock()

        view = ReportCreateView.as_view()
        request = self.factory.post(
            '/api/zentinelle/v1/reports/',
            data=json.dumps({
                'report_type': 'control_coverage',
                'params': {'pack_name': 'hipaa'},
                'format': 'csv',
            }),
            content_type='application/json',
        )
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)), \
             patch('zentinelle.api.views.reports._VALID_REPORT_TYPES', {'control_coverage', 'violation_summary', 'audit_trail'}), \
             patch('zentinelle.api.views.reports._VALID_FORMATS', {'csv', 'pdf', 'ndjson'}), \
             patch('zentinelle.api.views.reports.generate_report_task', None):
            response = view(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['id'], 42)
        self.assertEqual(response.data['status'], 'pending')

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.Report')
    def test_create_queues_celery_task(self, mock_report_cls, mock_tenant):
        """POST /reports/ queues the generate_report Celery task."""
        from zentinelle.api.views.reports import ReportCreateView

        report = _make_report(pk=7, status='pending')
        mock_report_cls.objects.create.return_value = report
        mock_report_cls.Status.PENDING = 'pending'

        mock_task = MagicMock()
        mock_task.delay = MagicMock()

        view = ReportCreateView.as_view()
        request = self.factory.post(
            '/api/zentinelle/v1/reports/',
            data=json.dumps({
                'report_type': 'audit_trail',
                'params': {'date_from': '2026-01-01', 'date_to': '2026-01-31'},
                'format': 'csv',
            }),
            content_type='application/json',
        )
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)), \
             patch('zentinelle.api.views.reports._VALID_REPORT_TYPES', {'control_coverage', 'violation_summary', 'audit_trail'}), \
             patch('zentinelle.api.views.reports._VALID_FORMATS', {'csv', 'pdf', 'ndjson'}), \
             patch('zentinelle.api.views.reports.generate_report_task', mock_task):
            response = view(request)

        self.assertEqual(response.status_code, 201)
        mock_task.delay.assert_called_once_with(7)

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.Report')
    def test_create_missing_report_type_returns_400(self, mock_report_cls, mock_tenant):
        """POST without report_type returns 400."""
        from zentinelle.api.views.reports import ReportCreateView

        view = ReportCreateView.as_view()
        request = self.factory.post(
            '/api/zentinelle/v1/reports/',
            data=json.dumps({'format': 'csv'}),
            content_type='application/json',
        )
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request)

        self.assertEqual(response.status_code, 400)

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.Report')
    def test_create_invalid_report_type_returns_400(self, mock_report_cls, mock_tenant):
        """POST with invalid report_type returns 400."""
        from zentinelle.api.views.reports import ReportCreateView

        view = ReportCreateView.as_view()
        request = self.factory.post(
            '/api/zentinelle/v1/reports/',
            data=json.dumps({'report_type': 'unknown_type', 'format': 'csv'}),
            content_type='application/json',
        )
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)), \
             patch('zentinelle.api.views.reports._VALID_REPORT_TYPES', {'control_coverage', 'violation_summary', 'audit_trail'}):
            response = view(request)

        self.assertEqual(response.status_code, 400)


class TestReportStatusView(unittest.TestCase):

    def setUp(self):
        from django.test import RequestFactory
        self.factory = RequestFactory()

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.Report')
    def test_status_returns_200_with_report_data(self, mock_report_cls, mock_tenant):
        """GET /reports/{id}/ returns 200 with report metadata."""
        from zentinelle.api.views.reports import ReportStatusView
        import datetime

        report = _make_report(
            pk=1,
            tenant_id='t1',
            report_type='control_coverage',
            status='generating',
            created_at=datetime.datetime(2026, 1, 1, 12, 0, 0),
        )
        mock_report_cls.objects.get.return_value = report

        view = ReportStatusView.as_view()
        request = self.factory.get('/api/zentinelle/v1/reports/1/')
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request, report_id=1)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], 1)
        self.assertEqual(response.data['status'], 'generating')
        self.assertEqual(response.data['report_type'], 'control_coverage')

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.Report')
    def test_status_returns_404_for_unknown_id(self, mock_report_cls, mock_tenant):
        """GET /reports/999/ returns 404 when not found."""
        from zentinelle.api.views.reports import ReportStatusView

        # DoesNotExist must be a real exception class, not a MagicMock
        class FakeDoesNotExist(Exception):
            pass

        mock_report_cls.DoesNotExist = FakeDoesNotExist
        mock_report_cls.objects.get.side_effect = FakeDoesNotExist()

        view = ReportStatusView.as_view()
        request = self.factory.get('/api/zentinelle/v1/reports/999/')
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request, report_id=999)

        self.assertEqual(response.status_code, 404)


class TestReportDownloadView(unittest.TestCase):

    def setUp(self):
        from django.test import RequestFactory
        self.factory = RequestFactory()

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.Report')
    def test_download_returns_409_when_pending(self, mock_report_cls, mock_tenant):
        """GET /reports/{id}/download/ returns 409 when status is 'pending'."""
        from zentinelle.api.views.reports import ReportDownloadView

        report = _make_report(pk=1, status='pending')
        mock_report_cls.objects.get.return_value = report
        mock_report_cls.Status.COMPLETE = 'complete'

        view = ReportDownloadView.as_view()
        request = self.factory.get('/api/zentinelle/v1/reports/1/download/')
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request, report_id=1)

        self.assertEqual(response.status_code, 409)

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.Report')
    def test_download_returns_409_when_generating(self, mock_report_cls, mock_tenant):
        """GET /reports/{id}/download/ returns 409 when status is 'generating'."""
        from zentinelle.api.views.reports import ReportDownloadView

        report = _make_report(pk=2, status='generating')
        mock_report_cls.objects.get.return_value = report
        mock_report_cls.Status.COMPLETE = 'complete'

        view = ReportDownloadView.as_view()
        request = self.factory.get('/api/zentinelle/v1/reports/2/download/')
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request, report_id=2)

        self.assertEqual(response.status_code, 409)

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.Report')
    def test_download_returns_404_when_file_path_empty(self, mock_report_cls, mock_tenant):
        """GET download returns 404 when file_path is empty (test/mock scenario)."""
        from zentinelle.api.views.reports import ReportDownloadView

        report = _make_report(pk=3, status='complete', file_path='')
        mock_report_cls.objects.get.return_value = report
        mock_report_cls.Status.COMPLETE = 'complete'

        view = ReportDownloadView.as_view()
        request = self.factory.get('/api/zentinelle/v1/reports/3/download/')
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request, report_id=3)

        self.assertEqual(response.status_code, 404)

    @patch('zentinelle.api.views.reports.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.reports.os.path.exists', return_value=True)
    @patch('zentinelle.api.views.reports.Report')
    def test_download_returns_200_when_complete(self, mock_report_cls, mock_exists, mock_tenant):
        """GET download returns 200 with file content when report is complete."""
        import tempfile
        import os
        from zentinelle.api.views.reports import ReportDownloadView

        # Create a real temp file to serve
        fd, tmp_path = tempfile.mkstemp(suffix='.csv')
        try:
            os.write(fd, b'name,value\nfoo,bar\n')
            os.close(fd)

            report = _make_report(pk=4, status='complete', file_path=tmp_path, fmt='csv')
            mock_report_cls.objects.get.return_value = report
            mock_report_cls.Status.COMPLETE = 'complete'

            view = ReportDownloadView.as_view()
            request = self.factory.get('/api/zentinelle/v1/reports/4/download/')
            request.user = MagicMock(is_authenticated=True)
            request.auth = None

            with patch('zentinelle.api.views.reports.ZentinelleAPIKeyAuthentication.authenticate',
                       return_value=(request.user, None)):
                response = view(request, report_id=4)

            self.assertEqual(response.status_code, 200)
            self.assertIn('text/csv', response.get('Content-Type', ''))
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


if __name__ == '__main__':
    unittest.main()
