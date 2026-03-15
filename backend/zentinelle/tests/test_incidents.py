"""
Tests for incident management backend.

Uses unittest.TestCase + unittest.mock only. No database required.
"""
import json
import unittest
from unittest.mock import MagicMock, patch, call


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_evaluation_result(
    allowed=False,
    dry_run=False,
    risk_score=0,
    policies_evaluated=None,
):
    result = MagicMock()
    result.allowed = allowed
    result.dry_run = dry_run
    result.risk_score = risk_score
    result.policies_evaluated = policies_evaluated or []
    return result


def _make_policy(policy_id='policy-1', name='Test Policy', config=None):
    p = MagicMock()
    p.id = policy_id
    p.name = name
    p.config = config if config is not None else {}
    return p


def _make_incident(
    pk=42,
    tenant_id='tenant-1',
    title='Test incident',
    severity='medium',
    status='open',
    source='manual',
    source_ref='',
    assignee_id='',
    created_at=None,
    updated_at=None,
    resolved_at=None,
):
    inc = MagicMock()
    inc.id = pk
    inc.pk = pk
    inc.tenant_id = tenant_id
    inc.title = title
    inc.description = ''
    inc.severity = severity
    inc.status = status
    inc.source = source
    inc.source_ref = source_ref
    inc.assignee_id = assignee_id
    inc.created_at = created_at
    inc.updated_at = updated_at
    inc.resolved_at = resolved_at
    return inc


def _make_comment(pk=1, author_id='system', body='hello', created_at=None):
    c = MagicMock()
    c.id = pk
    c.author_id = author_id
    c.body = body
    c.created_at = created_at
    return c


# ---------------------------------------------------------------------------
# Tests: severity mapping (pure function, no patching needed)
# ---------------------------------------------------------------------------

class TestRiskScoreToSeverity(unittest.TestCase):

    def _map(self, score):
        from zentinelle.services.incident_service import _risk_score_to_severity
        return _risk_score_to_severity(score)

    def test_score_0_maps_to_low(self):
        self.assertEqual(self._map(0), 'low')

    def test_score_39_maps_to_low(self):
        self.assertEqual(self._map(39), 'low')

    def test_score_40_maps_to_medium(self):
        self.assertEqual(self._map(40), 'medium')

    def test_score_50_maps_to_medium(self):
        self.assertEqual(self._map(50), 'medium')

    def test_score_59_maps_to_medium(self):
        self.assertEqual(self._map(59), 'medium')

    def test_score_60_maps_to_high(self):
        self.assertEqual(self._map(60), 'high')

    def test_score_70_maps_to_high(self):
        self.assertEqual(self._map(70), 'high')

    def test_score_79_maps_to_high(self):
        self.assertEqual(self._map(79), 'high')

    def test_score_80_maps_to_critical(self):
        self.assertEqual(self._map(80), 'critical')

    def test_score_85_maps_to_critical(self):
        self.assertEqual(self._map(85), 'critical')

    def test_score_100_maps_to_critical(self):
        self.assertEqual(self._map(100), 'critical')


# ---------------------------------------------------------------------------
# Tests: incident_service._maybe_create_incident
#
# The function uses late imports inside the try block:
#   from zentinelle.models import Incident
#   from zentinelle.tasks.notifications import send_incident_notification
#
# We patch these at their *source* locations so the late import picks up
# the mock: 'zentinelle.models.Incident' and
# 'zentinelle.tasks.notifications.send_incident_notification'.
# ---------------------------------------------------------------------------

class TestMaybeCreateIncident(unittest.TestCase):

    def _call(self, tenant_id, result, policies):
        from zentinelle.services.incident_service import _maybe_create_incident
        return _maybe_create_incident(tenant_id, result, policies)

    def test_skips_when_dry_run(self):
        """dry_run=True -> no DB writes."""
        result = _make_evaluation_result(dry_run=True, allowed=False, risk_score=85)
        policy = _make_policy(config={'auto_incident': True})
        result.policies_evaluated = [{'id': policy.id, 'result': 'fail'}]

        created = []

        def fake_create(**kwargs):
            created.append(kwargs)
            return MagicMock(id=1)

        mock_inc_cls = MagicMock()
        mock_inc_cls.objects.create.side_effect = fake_create
        mock_inc_cls.Status.OPEN = 'open'
        mock_inc_cls.Source.POLICY_VIOLATION = 'policy_violation'

        # Patch at the import site used by the late import inside the function
        import zentinelle.models as zentinelle_models
        original = zentinelle_models.Incident
        try:
            zentinelle_models.Incident = mock_inc_cls
            self._call('tenant-1', result, [policy])
        finally:
            zentinelle_models.Incident = original

        self.assertEqual(created, [])

    def test_skips_when_auto_incident_false(self):
        """auto_incident=False -> no incident created."""
        result = _make_evaluation_result(dry_run=False, allowed=False, risk_score=85)
        policy = _make_policy(config={'auto_incident': False})
        result.policies_evaluated = [{'id': policy.id, 'result': 'fail', 'message': 'blocked'}]

        created = []

        mock_inc_cls = MagicMock()
        mock_inc_cls.objects.create.side_effect = lambda **kw: created.append(kw) or MagicMock(id=1)
        mock_inc_cls.Status.OPEN = 'open'
        mock_inc_cls.Source.POLICY_VIOLATION = 'policy_violation'

        import zentinelle.models as zentinelle_models
        original = zentinelle_models.Incident
        try:
            zentinelle_models.Incident = mock_inc_cls
            self._call('tenant-1', result, [policy])
        finally:
            zentinelle_models.Incident = original

        self.assertEqual(created, [])

    def test_skips_when_auto_incident_missing(self):
        """config without auto_incident key -> no incident created."""
        result = _make_evaluation_result(dry_run=False, allowed=False, risk_score=85)
        policy = _make_policy(config={})
        result.policies_evaluated = [{'id': policy.id, 'result': 'fail', 'message': 'blocked'}]

        created = []

        mock_inc_cls = MagicMock()
        mock_inc_cls.objects.create.side_effect = lambda **kw: created.append(kw) or MagicMock(id=1)
        mock_inc_cls.Status.OPEN = 'open'
        mock_inc_cls.Source.POLICY_VIOLATION = 'policy_violation'

        import zentinelle.models as zentinelle_models
        original = zentinelle_models.Incident
        try:
            zentinelle_models.Incident = mock_inc_cls
            self._call('tenant-1', result, [policy])
        finally:
            zentinelle_models.Incident = original

        self.assertEqual(created, [])

    def test_creates_incident_when_auto_incident_true(self):
        """auto_incident=True and not dry_run -> incident created."""
        result = _make_evaluation_result(dry_run=False, allowed=False, risk_score=50)
        policy = _make_policy(config={'auto_incident': True})
        result.policies_evaluated = [{'id': policy.id, 'result': 'fail', 'message': 'denied'}]

        created = []
        fake_incident = MagicMock(id=99)

        def fake_create(**kwargs):
            created.append(kwargs)
            return fake_incident

        mock_inc_cls = MagicMock()
        mock_inc_cls.objects.create.side_effect = fake_create
        mock_inc_cls.Status.OPEN = 'open'
        mock_inc_cls.Source.POLICY_VIOLATION = 'policy_violation'

        # Also mock the notification task so it doesn't blow up
        mock_task = MagicMock()
        mock_task.delay = MagicMock()

        import zentinelle.models as zentinelle_models
        import zentinelle.tasks.notifications as notif_module
        original_inc = zentinelle_models.Incident
        original_task = notif_module.send_incident_notification
        try:
            zentinelle_models.Incident = mock_inc_cls
            notif_module.send_incident_notification = mock_task
            self._call('tenant-1', result, [policy])
        finally:
            zentinelle_models.Incident = original_inc
            notif_module.send_incident_notification = original_task

        self.assertEqual(len(created), 1)
        kwargs = created[0]
        self.assertEqual(kwargs['tenant_id'], 'tenant-1')
        self.assertIn('Policy violation', kwargs['title'])
        self.assertEqual(kwargs['severity'], 'medium')  # risk_score=50 -> medium

    def test_skips_passed_policies(self):
        """Policies with result='pass' are not turned into incidents."""
        result = _make_evaluation_result(dry_run=False, allowed=True, risk_score=50)
        policy = _make_policy(config={'auto_incident': True})
        result.policies_evaluated = [{'id': policy.id, 'result': 'pass', 'message': 'ok'}]

        created = []

        mock_inc_cls = MagicMock()
        mock_inc_cls.objects.create.side_effect = lambda **kw: created.append(kw) or MagicMock(id=1)

        import zentinelle.models as zentinelle_models
        original = zentinelle_models.Incident
        try:
            zentinelle_models.Incident = mock_inc_cls
            self._call('tenant-1', result, [policy])
        finally:
            zentinelle_models.Incident = original

        self.assertEqual(created, [])


# ---------------------------------------------------------------------------
# Tests: API views
# ---------------------------------------------------------------------------

class TestIncidentListView(unittest.TestCase):
    """Tests for GET /incidents/ and POST /incidents/."""

    def setUp(self):
        from django.test import RequestFactory
        self.factory = RequestFactory()

    @patch('zentinelle.api.views.incidents.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.incidents.Incident')
    def test_list_returns_200(self, mock_inc_cls, mock_tenant):
        """GET /incidents/ returns 200 with count and results."""
        from zentinelle.api.views.incidents import IncidentListView

        inc = _make_incident(pk=1, tenant_id='t1')
        mock_qs = MagicMock()
        mock_qs.count.return_value = 1
        mock_qs.__iter__ = MagicMock(return_value=iter([inc]))
        mock_qs.filter.return_value = mock_qs
        mock_inc_cls.objects.filter.return_value = mock_qs

        view = IncidentListView.as_view()
        request = self.factory.get('/api/zentinelle/v1/incidents/')
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.incidents.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request)

        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertIn('count', data)
        self.assertIn('results', data)

    @patch('zentinelle.api.views.incidents.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.incidents.Incident')
    def test_create_returns_201(self, mock_inc_cls, mock_tenant):
        """POST /incidents/ with valid body returns 201."""
        from zentinelle.api.views.incidents import IncidentListView

        inc = _make_incident(pk=5, tenant_id='t1', title='Test', severity='high')
        mock_inc_cls.objects.create.return_value = inc
        mock_inc_cls.Severity.MEDIUM = 'medium'
        mock_inc_cls.Source.MANUAL = 'manual'
        mock_inc_cls.Status.OPEN = 'open'

        view = IncidentListView.as_view()
        request = self.factory.post(
            '/api/zentinelle/v1/incidents/',
            data=json.dumps({'title': 'Test', 'severity': 'high', 'source': 'manual'}),
            content_type='application/json',
        )
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        mock_task = MagicMock()
        mock_task.delay = MagicMock()

        with patch('zentinelle.api.views.incidents.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)), \
             patch('zentinelle.api.views.incidents._VALID_SEVERITIES', {'high', 'low', 'medium', 'critical', 'info'}), \
             patch('zentinelle.api.views.incidents._VALID_SOURCES', {'manual', 'policy_violation', 'anomaly'}), \
             patch('zentinelle.api.views.incidents.send_incident_notification', mock_task):
            response = view(request)

        self.assertEqual(response.status_code, 201)

    @patch('zentinelle.api.views.incidents.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.incidents.Incident')
    def test_create_missing_title_returns_400(self, mock_inc_cls, mock_tenant):
        """POST without title returns 400."""
        from zentinelle.api.views.incidents import IncidentListView

        view = IncidentListView.as_view()
        request = self.factory.post(
            '/api/zentinelle/v1/incidents/',
            data=json.dumps({'description': 'oops'}),
            content_type='application/json',
        )
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.incidents.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request)

        self.assertEqual(response.status_code, 400)


class TestIncidentDetailView(unittest.TestCase):
    """Tests for GET/PATCH /incidents/{id}/."""

    def setUp(self):
        from django.test import RequestFactory
        self.factory = RequestFactory()

    @patch('zentinelle.api.views.incidents.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.incidents.Incident')
    def test_detail_returns_200(self, mock_inc_cls, mock_tenant):
        """GET /incidents/1/ returns 200."""
        from zentinelle.api.views.incidents import IncidentDetailView

        inc = _make_incident(pk=1, tenant_id='t1')
        inc.comments.all.return_value = []
        mock_inc_cls.objects.prefetch_related.return_value.get.return_value = inc

        view = IncidentDetailView.as_view()
        request = self.factory.get('/api/zentinelle/v1/incidents/1/')
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.incidents.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request, incident_id=1)

        self.assertEqual(response.status_code, 200)

    @patch('zentinelle.api.views.incidents.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.incidents.Incident')
    def test_patch_resolved_sets_resolved_at(self, mock_inc_cls, mock_tenant):
        """PATCH with status=resolved auto-sets resolved_at."""
        from zentinelle.api.views.incidents import IncidentDetailView
        from unittest.mock import PropertyMock
        import datetime

        fake_now = datetime.datetime(2026, 1, 1, 12, 0, 0)

        inc = _make_incident(pk=1, tenant_id='t1', status='open')
        inc.resolved_at = None
        inc.comments.all.return_value = []
        mock_inc_cls.objects.prefetch_related.return_value.get.return_value = inc
        mock_inc_cls.Status.RESOLVED = 'resolved'
        mock_inc_cls.Status.CLOSED = 'closed'

        view = IncidentDetailView.as_view()
        request = self.factory.patch(
            '/api/zentinelle/v1/incidents/1/',
            data=json.dumps({'status': 'resolved'}),
            content_type='application/json',
        )
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.incidents.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)), \
             patch('zentinelle.api.views.incidents._VALID_STATUSES', {'open', 'resolved', 'closed', 'investigating'}), \
             patch('zentinelle.api.views.incidents.timezone') as mock_tz:
            mock_tz.now.return_value = fake_now
            response = view(request, incident_id=1)

        self.assertEqual(inc.status, 'resolved')
        self.assertEqual(inc.resolved_at, fake_now)
        inc.save.assert_called_once()
        saved_fields = inc.save.call_args[1].get('update_fields', [])
        self.assertIn('resolved_at', saved_fields)


class TestIncidentCommentView(unittest.TestCase):
    """Tests for POST /incidents/{id}/comments/."""

    def setUp(self):
        from django.test import RequestFactory
        self.factory = RequestFactory()

    @patch('zentinelle.api.views.incidents.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.incidents.IncidentComment')
    @patch('zentinelle.api.views.incidents.Incident')
    def test_comment_post_creates_comment(self, mock_inc_cls, mock_comment_cls, mock_tenant):
        """POST /incidents/1/comments/ creates a comment and returns 201."""
        from zentinelle.api.views.incidents import IncidentCommentView

        inc = _make_incident(pk=1, tenant_id='t1')
        mock_inc_cls.objects.get.return_value = inc

        comment = _make_comment(pk=10, author_id='user-99', body='Looks bad')
        mock_comment_cls.objects.create.return_value = comment

        view = IncidentCommentView.as_view()
        request = self.factory.post(
            '/api/zentinelle/v1/incidents/1/comments/',
            data=json.dumps({'body': 'Looks bad', 'author_id': 'user-99'}),
            content_type='application/json',
        )
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.incidents.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request, incident_id=1)

        self.assertEqual(response.status_code, 201)
        mock_comment_cls.objects.create.assert_called_once_with(
            incident=inc,
            author_id='user-99',
            body='Looks bad',
        )

    @patch('zentinelle.api.views.incidents.get_tenant_id_from_request', return_value='t1')
    @patch('zentinelle.api.views.incidents.Incident')
    def test_comment_missing_body_returns_400(self, mock_inc_cls, mock_tenant):
        """POST without body returns 400."""
        from zentinelle.api.views.incidents import IncidentCommentView

        inc = _make_incident(pk=1, tenant_id='t1')
        mock_inc_cls.objects.get.return_value = inc

        view = IncidentCommentView.as_view()
        request = self.factory.post(
            '/api/zentinelle/v1/incidents/1/comments/',
            data=json.dumps({'author_id': 'user-99'}),
            content_type='application/json',
        )
        request.user = MagicMock(is_authenticated=True)
        request.auth = None

        with patch('zentinelle.api.views.incidents.ZentinelleAPIKeyAuthentication.authenticate',
                   return_value=(request.user, None)):
            response = view(request, incident_id=1)

        self.assertEqual(response.status_code, 400)


if __name__ == '__main__':
    unittest.main()
