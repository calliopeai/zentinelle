"""The policy boundary validates workload authority claims."""

from types import SimpleNamespace

import pytest

from zentinelle.services.authority import normalize_authority
from zentinelle.services.policy_engine import PolicyEngine


def test_normalize_authority_accepts_workload_and_task_identity():
    authority = normalize_authority(
        {'tenant_id': 'tenant-a', 'workload_id': 'agent-review', 'task_id': 'task-1'}
    )

    assert authority == {
        'tenant_id': 'tenant-a',
        'workload_id': 'agent-review',
        'task_id': 'task-1',
    }


@pytest.mark.parametrize(
    'authority',
    [['tenant-a'], {'unexpected': 'x'}, {'task_id': 1}, {'task_id': 'x' * 256}],
)
def test_normalize_authority_rejects_invalid_values(authority):
    with pytest.raises(ValueError, match='authority'):
        normalize_authority(authority)


def test_policy_engine_rejects_cross_tenant_authority():
    result = PolicyEngine().evaluate(
        endpoint=SimpleNamespace(tenant_id='tenant-a', id='endpoint-1'),
        action='tool:read',
        context={'authority': {'tenant_id': 'tenant-b', 'task_id': 'task-1'}},
    )

    assert result.allowed is False
    assert 'does not match' in result.reason
