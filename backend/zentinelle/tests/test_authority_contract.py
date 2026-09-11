"""The shared authority shape is validated before policy evaluation."""

from types import SimpleNamespace

import pytest

from zentinelle.services.evaluation_context import normalize_context
from zentinelle.services.policy_engine import PolicyEngine


def test_normalize_context_accepts_workload_authority():
    context = normalize_context(
        {
            'authority': {
                'tenant_id': 'tenant-a',
                'workload_id': 'agent-review',
                'task_id': 'task-123',
                'trace_id': 'trace-1',
            }
        }
    )

    assert context['authority']['workload_id'] == 'agent-review'
    assert context['authority']['task_id'] == 'task-123'


@pytest.mark.parametrize(
    'authority',
    [
        ['tenant-a'],
        {'tenant_id': 42},
        {'unexpected': 'value'},
        {'task_id': 'x' * 256},
    ],
)
def test_normalize_context_rejects_invalid_authority(authority):
    with pytest.raises(ValueError, match='authority'):
        normalize_context({'authority': authority})


def test_policy_engine_rejects_cross_tenant_authority():
    endpoint = SimpleNamespace(tenant_id='tenant-a', id='endpoint-1')

    result = PolicyEngine().evaluate(
        endpoint=endpoint,
        action='tool:read',
        context={'authority': {'tenant_id': 'tenant-b', 'task_id': 'task-1'}},
    )

    assert result.allowed is False
    assert 'does not match' in result.reason
