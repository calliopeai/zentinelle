"""
Tests for the policy simulation service.
"""
import uuid
from datetime import datetime, timezone as dt_timezone
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase


def _make_event(event_id=None, event_type='ai_request', payload=None, user_identifier=''):
    """Create a mock Event object."""
    event = MagicMock()
    event.id = event_id or uuid.uuid4()
    event.event_type = event_type
    event.user_identifier = user_identifier
    event.payload = payload or {}
    event.occurred_at = datetime.now(dt_timezone.utc)
    return event


class TestSimulatePolicy(SimpleTestCase):
    """Tests for simulate_policy()."""

    @patch('zentinelle.services.policy_simulator.PolicyEngine')
    @patch('zentinelle.services.policy_simulator.Event')
    def test_simulate_empty_events(self, mock_event_cls, mock_engine_cls):
        """No events → total_events=0, impact_percent=0.0."""
        from zentinelle.services.policy_simulator import simulate_policy

        mock_qs = MagicMock()
        mock_qs.order_by.return_value.__getitem__ = MagicMock(return_value=[])
        # Make list() on the queryset return []
        mock_event_cls.objects.filter.return_value = mock_qs

        with patch('zentinelle.services.policy_simulator.list', return_value=[]):
            result = simulate_policy(
                tenant_id='test-tenant',
                policy_config={
                    'policy_type': 'model_restriction',
                    'config': {'allowed_models': ['claude-3']},
                    'enforcement': 'enforce',
                },
            )

        self.assertEqual(result['total_events'], 0)
        self.assertEqual(result['would_block'], 0)
        self.assertEqual(result['would_warn'], 0)
        self.assertEqual(result['would_pass'], 0)
        self.assertEqual(result['impact_percent'], 0.0)
        self.assertEqual(result['blocked_samples'], [])

    @patch('zentinelle.services.policy_simulator.PolicyEngine')
    @patch('zentinelle.services.policy_simulator.Event')
    def test_simulate_all_blocked(self, mock_event_cls, mock_engine_cls):
        """Evaluator always fails → would_block equals number of events."""
        from zentinelle.services.policy_simulator import simulate_policy
        from zentinelle.services.evaluators.base import PolicyResult

        events = [_make_event() for _ in range(5)]

        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = PolicyResult(passed=False, message='blocked')
        mock_engine = MagicMock()
        mock_engine._get_evaluator.return_value = mock_evaluator
        mock_engine_cls.return_value = mock_engine

        with patch('zentinelle.services.policy_simulator.list', return_value=events):
            result = simulate_policy(
                tenant_id='test-tenant',
                policy_config={
                    'policy_type': 'model_restriction',
                    'config': {},
                    'enforcement': 'enforce',
                },
            )

        self.assertEqual(result['total_events'], 5)
        self.assertEqual(result['would_block'], 5)
        self.assertEqual(result['would_warn'], 0)
        self.assertEqual(result['would_pass'], 0)
        self.assertGreater(result['impact_percent'], 0)
        self.assertEqual(len(result['blocked_samples']), 5)

    @patch('zentinelle.services.policy_simulator.PolicyEngine')
    @patch('zentinelle.services.policy_simulator.Event')
    def test_simulate_mixed_results(self, mock_event_cls, mock_engine_cls):
        """Some pass, some fail → correct counts."""
        from zentinelle.services.policy_simulator import simulate_policy
        from zentinelle.services.evaluators.base import PolicyResult

        events = [_make_event() for _ in range(4)]

        # Alternate pass/fail
        side_effects = [
            PolicyResult(passed=False, message='blocked'),
            PolicyResult(passed=True),
            PolicyResult(passed=False, message='blocked'),
            PolicyResult(passed=True),
        ]
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.side_effect = side_effects
        mock_engine = MagicMock()
        mock_engine._get_evaluator.return_value = mock_evaluator
        mock_engine_cls.return_value = mock_engine

        with patch('zentinelle.services.policy_simulator.list', return_value=events):
            result = simulate_policy(
                tenant_id='test-tenant',
                policy_config={
                    'policy_type': 'model_restriction',
                    'config': {},
                    'enforcement': 'enforce',
                },
            )

        self.assertEqual(result['total_events'], 4)
        self.assertEqual(result['would_block'], 2)
        self.assertEqual(result['would_pass'], 2)
        self.assertEqual(result['would_warn'], 0)
        self.assertEqual(result['impact_percent'], 50.0)


class TestDetectPolicyConflicts(SimpleTestCase):
    """Tests for detect_policy_conflicts()."""

    @patch('zentinelle.services.policy_simulator.Policy')
    def test_detect_no_conflicts(self, mock_policy_cls):
        """No existing policies → empty conflicts list."""
        from zentinelle.services.policy_simulator import detect_policy_conflicts

        mock_policy_cls.objects.filter.return_value = []

        result = detect_policy_conflicts(
            tenant_id='test-tenant',
            proposed_policy_config={
                'policy_type': 'model_restriction',
                'config': {'allowed_models': ['gpt-4']},
                'enforcement': 'enforce',
                'priority': 10,
            },
        )

        self.assertEqual(result, [])

    @patch('zentinelle.services.policy_simulator.Policy')
    def test_detect_contradiction(self, mock_policy_cls):
        """Existing policy allows model X, proposed blocks X → contradiction."""
        from zentinelle.services.policy_simulator import detect_policy_conflicts

        existing = MagicMock()
        existing.id = uuid.uuid4()
        existing.name = 'Existing Allowlist'
        existing.config = {'allowed_models': ['gpt-4', 'claude-3']}
        existing.priority = 5
        mock_policy_cls.objects.filter.return_value = [existing]

        result = detect_policy_conflicts(
            tenant_id='test-tenant',
            proposed_policy_config={
                'policy_type': 'model_restriction',
                'config': {'blocked_models': ['gpt-4']},
                'enforcement': 'enforce',
                'priority': 5,
            },
        )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['conflict_type'], 'contradiction')
        self.assertIn('gpt-4', result[0]['detail'])

    @patch('zentinelle.services.policy_simulator.Policy')
    def test_detect_shadowed(self, mock_policy_cls):
        """Existing policy has higher priority → shadowed conflict."""
        from zentinelle.services.policy_simulator import detect_policy_conflicts

        existing = MagicMock()
        existing.id = uuid.uuid4()
        existing.name = 'High Priority Policy'
        existing.config = {}
        existing.priority = 100
        mock_policy_cls.objects.filter.return_value = [existing]

        result = detect_policy_conflicts(
            tenant_id='test-tenant',
            proposed_policy_config={
                'policy_type': 'rate_limit',
                'config': {},
                'enforcement': 'enforce',
                'priority': 10,
            },
        )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['conflict_type'], 'shadowed')
