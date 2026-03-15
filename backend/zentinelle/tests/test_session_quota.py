"""Unit tests for SessionQuotaEvaluator."""
import sys
import os
import types
import unittest
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Stub out Django modules BEFORE any zentinelle imports.
# ---------------------------------------------------------------------------
def _stub_django():
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

# ---------------------------------------------------------------------------
# Stub zentinelle.models
# ---------------------------------------------------------------------------
if 'zentinelle.models' not in sys.modules:
    _models_mod = types.ModuleType('zentinelle.models')

    class _PolicyStub:
        class PolicyType:
            pass
        class ScopeType:
            ORGANIZATION = 'organization'
        class Enforcement:
            ENFORCE = 'enforce'
            AUDIT = 'audit'
            DISABLED = 'disabled'

    _models_mod.Policy = _PolicyStub
    _models_mod.AgentEndpoint = MagicMock()
    sys.modules['zentinelle.models'] = _models_mod

# ---------------------------------------------------------------------------
# Stub zentinelle.services.evaluators.base (inline, no Django)
# ---------------------------------------------------------------------------
_base_path = os.path.join(os.path.dirname(__file__), '..', 'services', 'evaluators', 'base.py')
import importlib.util as _ilu

_base_spec = _ilu.spec_from_file_location(
    'zentinelle.services.evaluators.base', os.path.abspath(_base_path)
)
_base_mod = _ilu.module_from_spec(_base_spec)
sys.modules['zentinelle.services.evaluators.base'] = _base_mod
_base_spec.loader.exec_module(_base_mod)

# ---------------------------------------------------------------------------
# Provide an in-memory SessionStateStore stub for tests
# ---------------------------------------------------------------------------
_ss_mod = types.ModuleType('zentinelle.services.session_state')


class _InMemorySessionStateStore:
    """Pure in-memory stand-in for SessionStateStore (no Redis needed)."""

    def __init__(self, ttl=86400):
        self._data: Dict[tuple, Dict[str, int]] = {}

    def increment(self, session_id, tenant_id, counter, amount=1):
        key = (session_id, tenant_id)
        d = self._data.setdefault(key, {})
        d[counter] = d.get(counter, 0) + amount
        return d[counter]

    def get(self, session_id, tenant_id, counter):
        return self._data.get((session_id, tenant_id), {}).get(counter, 0)

    def get_all(self, session_id, tenant_id):
        return dict(self._data.get((session_id, tenant_id), {}))

    def reset(self, session_id, tenant_id):
        self._data.pop((session_id, tenant_id), None)


_ss_mod.SessionStateStore = _InMemorySessionStateStore
sys.modules['zentinelle.services.session_state'] = _ss_mod

# ---------------------------------------------------------------------------
# Load session_quota evaluator directly (bypass package __init__)
# ---------------------------------------------------------------------------
_sq_path = os.path.join(
    os.path.dirname(__file__), '..', 'services', 'evaluators', 'session_quota.py'
)
_sq_spec = _ilu.spec_from_file_location(
    'zentinelle.services.evaluators.session_quota', os.path.abspath(_sq_path)
)
_sq_mod = _ilu.module_from_spec(_sq_spec)
sys.modules['zentinelle.services.evaluators.session_quota'] = _sq_mod
_sq_spec.loader.exec_module(_sq_mod)
SessionQuotaEvaluator = _sq_mod.SessionQuotaEvaluator


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_policy(config=None, enforcement='enforce', name='Session Quota Policy'):
    p = MagicMock()
    p.id = '00000000-0000-0000-0000-000000000001'
    p.name = name
    p.policy_type = 'session_quota'
    p.config = config or {}
    p.enforcement = enforcement
    return p


class TestSessionQuotaEvaluator(unittest.TestCase):

    def _make_store(self):
        """Return a fresh in-memory SessionStateStore."""
        return _InMemorySessionStateStore()

    def _evaluate(self, evaluator, policy, action, context, dry_run=False, store=None):
        """Helper: patch SessionStateStore and run evaluate()."""
        _store = store if store is not None else self._make_store()
        # The evaluator imports SessionStateStore lazily inside evaluate(), so we
        # patch it on the session_state module that was injected into sys.modules.
        with patch.object(_ss_mod, 'SessionStateStore', return_value=_store):
            return evaluator.evaluate(policy, action, None, context, dry_run=dry_run), _store

    def test_no_session_id_passes(self):
        """Missing session_id in context must pass (fail-open)."""
        evaluator = SessionQuotaEvaluator()
        policy = make_policy(config={'max_bytes_read': 1000})
        result, _ = self._evaluate(evaluator, policy, 'tool:file_read', {})
        self.assertTrue(result.passed)

    def test_first_call_within_limits(self):
        """First call with small values should pass and increment counters."""
        evaluator = SessionQuotaEvaluator()
        policy = make_policy(config={
            'max_bytes_read': 52428800,
            'max_tool_calls': 200,
        })
        context = {
            'session_id': 'sess-1',
            'tenant_id': 'tenant-1',
            'bytes_read': 1024,
            'tool_call_count': 1,
        }
        result, store = self._evaluate(evaluator, policy, 'tool:file_read', context)
        self.assertTrue(result.passed)
        self.assertEqual(store.get('sess-1', 'tenant-1', 'bytes_read'), 1024)
        self.assertEqual(store.get('sess-1', 'tenant-1', 'tool_calls'), 1)

    def test_bytes_read_limit_exceeded(self):
        """Exceeding max_bytes_read should fail the evaluation."""
        store = self._make_store()
        store.increment('sess-1', 'tenant-1', 'bytes_read', 50000000)  # near limit
        evaluator = SessionQuotaEvaluator()
        policy = make_policy(config={'max_bytes_read': 52428800})
        context = {
            'session_id': 'sess-1',
            'tenant_id': 'tenant-1',
            'bytes_read': 5000000,  # pushes total over
        }
        result, _ = self._evaluate(evaluator, policy, 'tool:file_read', context, store=store)
        self.assertFalse(result.passed)
        self.assertIn('bytes read', result.message)

    def test_warn_at_threshold(self):
        """At warn_at_percent of limit the evaluation passes but emits a warning."""
        limit = 10000
        store = self._make_store()
        store.increment('sess-1', 'tenant-1', 'bytes_read', int(limit * 0.80))
        evaluator = SessionQuotaEvaluator()
        policy = make_policy(config={
            'max_bytes_read': limit,
            'warn_at_percent': 80,
        })
        context = {
            'session_id': 'sess-1',
            'tenant_id': 'tenant-1',
            'bytes_read': int(limit * 0.05),  # nudge above warn threshold, still under hard limit
        }
        result, _ = self._evaluate(evaluator, policy, 'tool:file_read', context, store=store)
        self.assertTrue(result.passed)
        self.assertTrue(
            any('[SessionQuota]' in w for w in result.warnings),
            f"Expected a [SessionQuota] warning, got: {result.warnings}",
        )

    def test_dry_run_does_not_increment(self):
        """In dry_run mode counters must NOT be incremented."""
        store = self._make_store()
        evaluator = SessionQuotaEvaluator()
        policy = make_policy(config={'max_bytes_read': 52428800})
        context = {
            'session_id': 'sess-1',
            'tenant_id': 'tenant-1',
            'bytes_read': 1024,
        }
        result, _ = self._evaluate(
            evaluator, policy, 'tool:file_read', context, dry_run=True, store=store
        )
        self.assertTrue(result.passed)
        self.assertEqual(store.get('sess-1', 'tenant-1', 'bytes_read'), 0)

    def test_multiple_counters_checked(self):
        """Each counter type should be independently enforced."""
        counters_and_context = [
            ('max_bytes_written', {'bytes_written': 1},        'bytes written'),
            ('max_outbound_calls', {'is_outbound_call': True}, 'outbound calls'),
            ('max_pii_accesses',  {'is_pii_access': True},     'PII accesses'),
            ('max_tool_calls',    {'tool_call_count': 1},      'tool calls'),
            ('max_session_tokens', {'tokens_used': 1},         'session tokens'),
        ]
        for config_key, extra_ctx, label in counters_and_context:
            with self.subTest(counter=config_key):
                evaluator = SessionQuotaEvaluator()
                policy = make_policy(config={config_key: 0})
                context = {'session_id': 'sess-x', 'tenant_id': 'tenant-x', **extra_ctx}
                result, _ = self._evaluate(evaluator, policy, 'action', context)
                self.assertFalse(result.passed, f"Expected failure for {config_key}")
                self.assertIn(label, result.message)


if __name__ == '__main__':
    unittest.main()
