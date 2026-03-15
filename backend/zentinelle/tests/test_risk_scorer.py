"""Unit tests for the RiskScorer."""
import sys
import os
import types
import unittest
from unittest.mock import MagicMock

# ---------------------------------------------------------------------------
# Stub out Django and Zentinelle ORM modules so this test has no DB deps.
# Must happen BEFORE any zentinelle import.
# ---------------------------------------------------------------------------
def _stub_django():
    """Insert minimal Django stubs into sys.modules."""
    for mod_name in [
        'django',
        'django.db',
        'django.db.models',
        'django.core',
        'django.core.cache',
        'django.dispatch',
        'django.db.models.signals',
    ]:
        if mod_name not in sys.modules:
            sys.modules[mod_name] = types.ModuleType(mod_name)

    # django.db.models needs Q, Prefetch, etc.
    db_models = sys.modules['django.db.models']
    for attr in ('Q', 'Prefetch', 'Model', 'CharField', 'TextField',
                 'BooleanField', 'IntegerField', 'JSONField', 'UUIDField',
                 'ForeignKey', 'CASCADE', 'TextChoices', 'Index',
                 'PositiveIntegerField', 'F'):
        if not hasattr(db_models, attr):
            setattr(db_models, attr, MagicMock())

    cache_mod = sys.modules['django.core.cache']
    if not hasattr(cache_mod, 'cache'):
        cache_mod.cache = MagicMock()

    dispatch_mod = sys.modules['django.dispatch']
    if not hasattr(dispatch_mod, 'receiver'):
        dispatch_mod.receiver = lambda *a, **kw: (lambda f: f)

    signals_mod = sys.modules['django.db.models.signals']
    if not hasattr(signals_mod, 'post_save'):
        signals_mod.post_save = MagicMock()


_stub_django()

# Make the backend package importable
_BACKEND = os.path.join(os.path.dirname(__file__), '..', '..', '..')
if os.path.abspath(_BACKEND) not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))

# Stub zentinelle.models before any package __init__ tries to import them
if 'zentinelle.models' not in sys.modules:
    _models_mod = types.ModuleType('zentinelle.models')

    class _PolicyStub:
        class PolicyType:
            pass
        class ScopeType:
            ORGANIZATION = 'organization'
            SUB_ORGANIZATION = 'sub_organization'
            ENDPOINT = 'endpoint'
            USER = 'user'
        class Enforcement:
            ENFORCE = 'enforce'
            AUDIT = 'audit'
            DISABLED = 'disabled'

    _models_mod.Policy = _PolicyStub
    _models_mod.AgentEndpoint = MagicMock()
    sys.modules['zentinelle.models'] = _models_mod

# Import directly to bypass package __init__ chain
import importlib.util as _ilu
_scorer_path = os.path.join(os.path.dirname(__file__), '..', 'services', 'risk_scorer.py')
_spec = _ilu.spec_from_file_location('zentinelle.services.risk_scorer', os.path.abspath(_scorer_path))
_mod = _ilu.module_from_spec(_spec)
sys.modules['zentinelle.services.risk_scorer'] = _mod
_spec.loader.exec_module(_mod)
RiskScorer = _mod.RiskScorer


def make_policy_result(name='Test Policy', result='pass', enforcement='enforce', policy_type='tool_permission'):
    return {
        'id': '00000000-0000-0000-0000-000000000001',
        'name': name,
        'type': policy_type,
        'result': result,
        'message': None,
        'enforcement': enforcement,
    }


class TestRiskScorer(unittest.TestCase):

    def setUp(self):
        self.scorer = RiskScorer()

    def test_clean_request_zero_score(self):
        """No violations, safe action should produce a very low score."""
        score, factors = self.scorer.compute(
            action='llm:invoke',
            context={},
            policies_evaluated_results=[make_policy_result(result='pass')],
            warnings=[],
        )
        self.assertLess(score, 10, f"Expected low score for clean request, got {score}")

    def test_shell_execute_action_scores_high(self):
        """tool:shell_execute alone should push score into 20–25 range."""
        score, factors = self.scorer.compute(
            action='tool:shell_execute',
            context={},
            policies_evaluated_results=[],
            warnings=[],
        )
        self.assertGreaterEqual(score, 20)
        self.assertLessEqual(score, 25)
        action_factor_names = [f['factor'] for f in factors]
        self.assertIn('action_riskiness', action_factor_names)

    def test_pii_context_adds_score(self):
        """data_contains_pii=True should add a PII factor to the score."""
        score_without, _ = self.scorer.compute(
            action='tool:file_read',
            context={},
            policies_evaluated_results=[],
            warnings=[],
        )
        score_with, factors = self.scorer.compute(
            action='tool:file_read',
            context={'data_contains_pii': True},
            policies_evaluated_results=[],
            warnings=[],
        )
        self.assertGreater(score_with, score_without)
        factor_names = [f['factor'] for f in factors]
        self.assertIn('data_contains_pii', factor_names)

    def test_policy_violations_add_score(self):
        """Each failed enforcing policy should increase the score."""
        score_none, _ = self.scorer.compute(
            action='llm:invoke',
            context={},
            policies_evaluated_results=[],
            warnings=[],
        )
        score_one, _ = self.scorer.compute(
            action='llm:invoke',
            context={},
            policies_evaluated_results=[make_policy_result(result='fail')],
            warnings=[],
        )
        score_two, _ = self.scorer.compute(
            action='llm:invoke',
            context={},
            policies_evaluated_results=[
                make_policy_result(result='fail', name='Policy A'),
                make_policy_result(result='fail', name='Policy B'),
            ],
            warnings=[],
        )
        self.assertGreater(score_one, score_none)
        self.assertGreater(score_two, score_one)

    def test_behavioral_anomaly_warning_adds_score(self):
        """A [BehavioralAnomaly] warning should contribute +15 to score."""
        score_without, _ = self.scorer.compute(
            action='llm:invoke',
            context={},
            policies_evaluated_results=[],
            warnings=[],
        )
        score_with, factors = self.scorer.compute(
            action='llm:invoke',
            context={},
            policies_evaluated_results=[],
            warnings=['[BehavioralAnomaly] Unusual pattern detected'],
        )
        self.assertEqual(score_with - score_without, 15)
        factor_names = [f['factor'] for f in factors]
        self.assertIn('behavioral_anomaly', factor_names)

    def test_score_capped_at_100(self):
        """Piling up all risk signals must not exceed 100."""
        results = [make_policy_result(result='fail', name=f'Policy {i}') for i in range(10)]
        warnings = [
            '[BehavioralAnomaly] Unusual access pattern',
            '[Audit] Something noteworthy',
            '[Dry-run] Would be denied: Policy X: reason',
        ]
        context = {
            'data_contains_pii': True,
            'is_pii_access': True,
            'data_type': 'financial',
            'datasource': 'prod-database',
            'require_encryption': False,
        }
        score, _ = self.scorer.compute(
            action='tool:shell_execute',
            context=context,
            policies_evaluated_results=results,
            warnings=warnings,
        )
        self.assertLessEqual(score, 100)

    def test_risk_factors_list_populated(self):
        """factors list should describe what drove the score."""
        _, factors = self.scorer.compute(
            action='tool:file_write',
            context={'data_contains_pii': True},
            policies_evaluated_results=[make_policy_result(result='fail')],
            warnings=['[Audit] Something noted'],
        )
        self.assertIsInstance(factors, list)
        self.assertGreater(len(factors), 0)
        for f in factors:
            self.assertIn('factor', f)
            self.assertIn('score', f)
            self.assertIn('detail', f)
            self.assertIsInstance(f['score'], int)


if __name__ == '__main__':
    unittest.main()
