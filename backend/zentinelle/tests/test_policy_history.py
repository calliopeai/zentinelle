"""
Tests for PolicyHistory model, signal, and API views.

All tests use unittest.TestCase + unittest.mock — no database, no Django test runner.

Run:
    PYTHONPATH=. .venv/bin/python -m pytest zentinelle/tests/test_policy_history.py -v
"""
import unittest
from unittest.mock import MagicMock, patch, call

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_policy(
    pk=1,
    tenant_id='tenant-abc',
    name='Test Policy',
    policy_type='rate_limit',
    enforcement='enforce',
    priority=10,
    config=None,
    enabled=True,
    description='A test policy',
    version=1,
    changed_by=None,
    change_summary='',
):
    """Return a minimal Policy-like mock."""
    p = MagicMock()
    p.pk = pk
    p.tenant_id = tenant_id
    p.name = name
    p.policy_type = policy_type
    p.enforcement = enforcement
    p.priority = priority
    p.config = config if config is not None else {'requests_per_minute': 60}
    p.enabled = enabled
    p.description = description
    p.version = version
    p._changed_by = changed_by
    p._change_summary = change_summary
    return p


def _make_history_record(
    id=1,
    policy=None,
    version=1,
    snapshot=None,
    changed_by='system',
    changed_at=None,
    change_summary='',
):
    """Return a minimal PolicyHistory-like mock."""
    from datetime import datetime, timezone
    rec = MagicMock()
    rec.id = id
    rec.policy = policy
    rec.version = version
    rec.snapshot = snapshot or {'name': 'Test', 'version': version}
    rec.changed_by = changed_by
    rec.changed_at = changed_at or datetime(2026, 1, 1, tzinfo=timezone.utc)
    rec.change_summary = change_summary
    return rec


# ---------------------------------------------------------------------------
# Tests: Signal — create_policy_revision
# ---------------------------------------------------------------------------

class TestCreatePolicyRevisionSignal(unittest.TestCase):
    """Signal creates both PolicyRevision and PolicyHistory on Policy save."""

    @patch('zentinelle.models.policy.PolicyHistory')
    @patch('zentinelle.models.policy.PolicyRevision')
    def test_creates_policy_history_on_save(self, MockRevision, MockHistory):
        """Signal should create a PolicyHistory record on every Policy save."""
        from zentinelle.models.policy import create_policy_revision

        policy = _make_policy(version=1)
        MockRevision.objects.get_or_create.return_value = (MagicMock(), True)
        MockHistory.objects.get_or_create.return_value = (MagicMock(), True)

        create_policy_revision(sender=None, instance=policy, created=True)

        MockHistory.objects.get_or_create.assert_called_once()
        call_kwargs = MockHistory.objects.get_or_create.call_args
        assert call_kwargs.kwargs['defaults']['snapshot']['version'] == 1
        assert call_kwargs.kwargs['defaults']['snapshot']['name'] == 'Test Policy'

    @patch('zentinelle.models.policy.PolicyHistory')
    @patch('zentinelle.models.policy.PolicyRevision')
    def test_creates_policy_revision_on_save(self, MockRevision, MockHistory):
        """Signal should also create a PolicyRevision record."""
        from zentinelle.models.policy import create_policy_revision

        policy = _make_policy(version=2)
        MockRevision.objects.get_or_create.return_value = (MagicMock(), True)
        MockHistory.objects.get_or_create.return_value = (MagicMock(), True)

        create_policy_revision(sender=None, instance=policy, created=False)

        MockRevision.objects.get_or_create.assert_called_once()

    @patch('zentinelle.models.policy.PolicyHistory')
    @patch('zentinelle.models.policy.PolicyRevision')
    def test_changed_by_from_instance_attribute(self, MockRevision, MockHistory):
        """changed_by should use policy._changed_by when set."""
        from zentinelle.models.policy import create_policy_revision

        policy = _make_policy(version=3, changed_by='alice')
        MockRevision.objects.get_or_create.return_value = (MagicMock(), True)
        MockHistory.objects.get_or_create.return_value = (MagicMock(), True)

        create_policy_revision(sender=None, instance=policy, created=False)

        call_kwargs = MockHistory.objects.get_or_create.call_args
        assert call_kwargs.kwargs['defaults']['changed_by'] == 'alice'

    @patch('zentinelle.models.policy.PolicyHistory')
    @patch('zentinelle.models.policy.PolicyRevision')
    def test_changed_by_defaults_to_system(self, MockRevision, MockHistory):
        """changed_by should default to 'system' when _changed_by is not set."""
        from zentinelle.models.policy import create_policy_revision

        policy = _make_policy(version=4, changed_by=None)
        MockRevision.objects.get_or_create.return_value = (MagicMock(), True)
        MockHistory.objects.get_or_create.return_value = (MagicMock(), True)

        create_policy_revision(sender=None, instance=policy, created=False)

        call_kwargs = MockHistory.objects.get_or_create.call_args
        assert call_kwargs.kwargs['defaults']['changed_by'] == 'system'

    @patch('zentinelle.models.policy.PolicyHistory')
    @patch('zentinelle.models.policy.PolicyRevision')
    def test_snapshot_contains_required_fields(self, MockRevision, MockHistory):
        """Snapshot must contain all required policy state fields."""
        from zentinelle.models.policy import create_policy_revision

        cfg = {'requests_per_minute': 100, 'tokens_per_day': 500000}
        policy = _make_policy(version=1, config=cfg, description='My desc')
        MockRevision.objects.get_or_create.return_value = (MagicMock(), True)
        MockHistory.objects.get_or_create.return_value = (MagicMock(), True)

        create_policy_revision(sender=None, instance=policy, created=True)

        call_kwargs = MockHistory.objects.get_or_create.call_args
        snapshot = call_kwargs.kwargs['defaults']['snapshot']
        for field in ('name', 'policy_type', 'enforcement', 'priority', 'config', 'enabled', 'description', 'version'):
            assert field in snapshot, f"snapshot missing field: {field}"
        assert snapshot['config'] == cfg
        assert snapshot['description'] == 'My desc'


# ---------------------------------------------------------------------------
# Tests: _diff_snapshots utility
# ---------------------------------------------------------------------------

class TestDiffSnapshots(unittest.TestCase):
    """Unit tests for the _diff_snapshots helper."""

    def _diff(self, a, b):
        from zentinelle.api.views.policy_history import _diff_snapshots
        return _diff_snapshots(a, b)

    def test_no_changes(self):
        snap = {'name': 'A', 'enabled': True, 'config': {'x': 1}}
        result = self._diff(snap, snap)
        self.assertEqual(result, {'added': {}, 'removed': {}, 'changed': {}})

    def test_field_changed(self):
        a = {'name': 'Old', 'enabled': True}
        b = {'name': 'New', 'enabled': True}
        result = self._diff(a, b)
        self.assertEqual(result['changed'], {'name': ['Old', 'New']})
        self.assertEqual(result['added'], {})
        self.assertEqual(result['removed'], {})

    def test_field_added(self):
        a = {'name': 'A'}
        b = {'name': 'A', 'description': 'Added'}
        result = self._diff(a, b)
        self.assertEqual(result['added'], {'description': 'Added'})

    def test_field_removed(self):
        a = {'name': 'A', 'description': 'Gone'}
        b = {'name': 'A'}
        result = self._diff(a, b)
        self.assertEqual(result['removed'], {'description': 'Gone'})

    def test_config_deep_diff_changed(self):
        a = {'config': {'rate': 10, 'limit': 100}}
        b = {'config': {'rate': 20, 'limit': 100}}
        result = self._diff(a, b)
        self.assertIn('config', result['changed'])
        self.assertEqual(result['changed']['config']['changed'], {'rate': [10, 20]})
        self.assertEqual(result['changed']['config']['added'], {})
        self.assertEqual(result['changed']['config']['removed'], {})

    def test_config_deep_diff_added_key(self):
        a = {'config': {'rate': 10}}
        b = {'config': {'rate': 10, 'burst': 5}}
        result = self._diff(a, b)
        self.assertIn('config', result['changed'])
        self.assertEqual(result['changed']['config']['added'], {'burst': 5})

    def test_config_deep_diff_removed_key(self):
        a = {'config': {'rate': 10, 'burst': 5}}
        b = {'config': {'rate': 10}}
        result = self._diff(a, b)
        self.assertIn('config', result['changed'])
        self.assertEqual(result['changed']['config']['removed'], {'burst': 5})

    def test_config_unchanged_not_in_changed(self):
        a = {'config': {'rate': 10}}
        b = {'config': {'rate': 10}}
        result = self._diff(a, b)
        self.assertNotIn('config', result['changed'])

    def test_config_completely_replaced(self):
        """Non-dict config values are treated as plain field changes."""
        a = {'config': 'old_string'}
        b = {'config': 'new_string'}
        result = self._diff(a, b)
        self.assertEqual(result['changed']['config'], ['old_string', 'new_string'])


# ---------------------------------------------------------------------------
# Tests: PolicyHistoryListView
# ---------------------------------------------------------------------------

class TestPolicyHistoryListView(unittest.TestCase):
    """Tests for the history list endpoint."""

    def _get_view(self):
        from zentinelle.api.views.policy_history import PolicyHistoryListView
        return PolicyHistoryListView()

    def _make_request(self, query_params=None, tenant_id='tenant-abc'):
        request = MagicMock()
        request.query_params = query_params or {}
        user = MagicMock()
        user.tenant_id = tenant_id
        request.user = user
        return request

    @patch('zentinelle.api.views.policy_history.get_tenant_id_from_request')
    @patch('zentinelle.api.views.policy_history.Policy')
    @patch('zentinelle.api.views.policy_history.PolicyHistory')
    def test_returns_history_newest_first(self, MockHistory, MockPolicy, mock_get_tenant):
        """History results should be ordered by descending version."""
        from datetime import datetime, timezone

        mock_get_tenant.return_value = 'tenant-abc'
        policy = MagicMock()
        policy.pk = 42
        MockPolicy.objects.get.return_value = policy

        rec1 = _make_history_record(id=2, policy=policy, version=2)
        rec2 = _make_history_record(id=1, policy=policy, version=1)

        qs = MagicMock()
        qs.order_by.return_value = qs
        qs.count.return_value = 2
        qs.__getitem__ = MagicMock(return_value=[rec1, rec2])
        MockHistory.objects.filter.return_value = qs

        view = self._get_view()
        request = self._make_request()
        response = view.get(request, policy_id=42)

        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(data['count'], 2)
        qs.order_by.assert_called_with('-version')

    @patch('zentinelle.api.views.policy_history.get_tenant_id_from_request')
    @patch('zentinelle.api.views.policy_history.Policy')
    def test_returns_404_when_policy_not_found(self, MockPolicy, mock_get_tenant):
        """Should return 404 when the policy does not exist."""
        mock_get_tenant.return_value = 'tenant-abc'
        MockPolicy.DoesNotExist = Exception
        MockPolicy.objects.get.side_effect = MockPolicy.DoesNotExist

        view = self._get_view()
        request = self._make_request()
        response = view.get(request, policy_id=999)

        self.assertEqual(response.status_code, 404)

    @patch('zentinelle.api.views.policy_history.get_tenant_id_from_request')
    @patch('zentinelle.api.views.policy_history.Policy')
    @patch('zentinelle.api.views.policy_history.PolicyHistory')
    def test_response_structure(self, MockHistory, MockPolicy, mock_get_tenant):
        """Response should contain count and results keys."""
        from datetime import datetime, timezone

        mock_get_tenant.return_value = 'tenant-abc'
        policy = MagicMock()
        policy.pk = 1
        MockPolicy.objects.get.return_value = policy

        rec = _make_history_record(id=1, policy=policy, version=1)

        qs = MagicMock()
        qs.order_by.return_value = qs
        qs.count.return_value = 1
        qs.__getitem__ = MagicMock(return_value=[rec])
        MockHistory.objects.filter.return_value = qs

        view = self._get_view()
        request = self._make_request()
        response = view.get(request, policy_id=1)

        self.assertIn('count', response.data)
        self.assertIn('results', response.data)
        self.assertEqual(len(response.data['results']), 1)
        result = response.data['results'][0]
        for key in ('id', 'policy_id', 'version', 'snapshot', 'changed_by', 'changed_at', 'change_summary'):
            self.assertIn(key, result)


# ---------------------------------------------------------------------------
# Tests: PolicyDiffView
# ---------------------------------------------------------------------------

class TestPolicyDiffView(unittest.TestCase):
    """Tests for the policy diff endpoint."""

    def _get_view(self):
        from zentinelle.api.views.policy_history import PolicyDiffView
        return PolicyDiffView()

    def _make_request(self, from_v=None, to_v=None, tenant_id='tenant-abc'):
        request = MagicMock()
        params = {}
        if from_v is not None:
            params['from'] = str(from_v)
        if to_v is not None:
            params['to'] = str(to_v)
        request.query_params = params
        user = MagicMock()
        user.tenant_id = tenant_id
        request.user = user
        return request

    @patch('zentinelle.api.views.policy_history.get_tenant_id_from_request')
    @patch('zentinelle.api.views.policy_history.Policy')
    @patch('zentinelle.api.views.policy_history.PolicyHistory')
    def test_returns_correct_diff_structure(self, MockHistory, MockPolicy, mock_get_tenant):
        """Diff response should contain added, removed, changed keys."""
        mock_get_tenant.return_value = 'tenant-abc'
        policy = MagicMock()
        policy.pk = 1
        MockPolicy.objects.get.return_value = policy

        snap1 = {'name': 'Old', 'enabled': True, 'config': {'rate': 10}}
        snap2 = {'name': 'New', 'enabled': True, 'config': {'rate': 20}}

        rec1 = MagicMock()
        rec1.snapshot = snap1
        rec2 = MagicMock()
        rec2.snapshot = snap2

        def get_side_effect(policy, version):
            if version == 1:
                return rec1
            if version == 2:
                return rec2
            raise MockHistory.DoesNotExist

        MockHistory.objects.get.side_effect = get_side_effect

        view = self._get_view()
        request = self._make_request(from_v=1, to_v=2)
        response = view.get(request, policy_id=1)

        self.assertEqual(response.status_code, 200)
        for key in ('added', 'removed', 'changed', 'from_version', 'to_version', 'policy_id'):
            self.assertIn(key, response.data)
        self.assertEqual(response.data['changed']['name'], ['Old', 'New'])

    @patch('zentinelle.api.views.policy_history.get_tenant_id_from_request')
    @patch('zentinelle.api.views.policy_history.Policy')
    @patch('zentinelle.api.views.policy_history.PolicyHistory')
    def test_returns_404_when_from_version_not_found(self, MockHistory, MockPolicy, mock_get_tenant):
        """Should return 404 when the 'from' version does not exist."""
        mock_get_tenant.return_value = 'tenant-abc'
        policy = MagicMock()
        MockPolicy.objects.get.return_value = policy

        MockHistory.DoesNotExist = Exception
        MockHistory.objects.get.side_effect = MockHistory.DoesNotExist

        view = self._get_view()
        request = self._make_request(from_v=99, to_v=2)
        response = view.get(request, policy_id=1)

        self.assertEqual(response.status_code, 404)

    @patch('zentinelle.api.views.policy_history.get_tenant_id_from_request')
    @patch('zentinelle.api.views.policy_history.Policy')
    @patch('zentinelle.api.views.policy_history.PolicyHistory')
    def test_returns_404_when_to_version_not_found(self, MockHistory, MockPolicy, mock_get_tenant):
        """Should return 404 when the 'to' version does not exist."""
        mock_get_tenant.return_value = 'tenant-abc'
        policy = MagicMock()
        MockPolicy.objects.get.return_value = policy

        rec1 = MagicMock()
        rec1.snapshot = {'name': 'A'}

        MockHistory.DoesNotExist = Exception

        call_count = {'n': 0}

        def get_side_effect(**kwargs):
            call_count['n'] += 1
            if call_count['n'] == 1:
                return rec1
            raise MockHistory.DoesNotExist

        MockHistory.objects.get.side_effect = get_side_effect

        view = self._get_view()
        request = self._make_request(from_v=1, to_v=99)
        response = view.get(request, policy_id=1)

        self.assertEqual(response.status_code, 404)

    @patch('zentinelle.api.views.policy_history.get_tenant_id_from_request')
    @patch('zentinelle.api.views.policy_history.Policy')
    def test_returns_400_when_params_missing(self, MockPolicy, mock_get_tenant):
        """Should return 400 when from/to params are missing."""
        mock_get_tenant.return_value = 'tenant-abc'
        MockPolicy.objects.get.return_value = MagicMock()

        view = self._get_view()
        # missing both
        request = self._make_request()
        response = view.get(request, policy_id=1)
        self.assertEqual(response.status_code, 400)

    @patch('zentinelle.api.views.policy_history.get_tenant_id_from_request')
    @patch('zentinelle.api.views.policy_history.Policy')
    @patch('zentinelle.api.views.policy_history.PolicyHistory')
    def test_diff_with_nested_config_changes(self, MockHistory, MockPolicy, mock_get_tenant):
        """Diff should deep-compare config dicts."""
        mock_get_tenant.return_value = 'tenant-abc'
        policy = MagicMock()
        policy.pk = 5
        MockPolicy.objects.get.return_value = policy

        snap1 = {
            'name': 'Same',
            'config': {
                'allowed_models': ['gpt-4'],
                'blocked_models': ['gpt-3'],
                'max_tier': 'standard',
            },
        }
        snap2 = {
            'name': 'Same',
            'config': {
                'allowed_models': ['gpt-4', 'claude-3'],
                'max_tier': 'premium',
            },
        }

        rec1 = MagicMock()
        rec1.snapshot = snap1
        rec2 = MagicMock()
        rec2.snapshot = snap2

        def get_side_effect(policy, version):
            return rec1 if version == 1 else rec2

        MockHistory.objects.get.side_effect = get_side_effect

        view = self._get_view()
        request = self._make_request(from_v=1, to_v=2)
        response = view.get(request, policy_id=5)

        self.assertEqual(response.status_code, 200)
        config_diff = response.data['changed']['config']
        self.assertIn('changed', config_diff)
        self.assertIn('removed', config_diff)
        self.assertEqual(config_diff['changed']['max_tier'], ['standard', 'premium'])
        self.assertEqual(config_diff['removed']['blocked_models'], ['gpt-3'])


if __name__ == '__main__':
    unittest.main()
