"""Validation for workload authority carried through policy requests."""

AUTHORITY_FIELDS = frozenset(
    {
        'tenant_id',
        'workload_id',
        'task_id',
        'user_id',
        'trace_id',
        'run_id',
        'policy_version',
    }
)


def normalize_authority(value):
    """Return a closed, string-only authority object.

    The authenticated endpoint remains the trust anchor. These fields carry
    workload and execution identity across gateway, SDK, and MCP clients.
    """
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError('authority must be an object')
    unknown = set(value) - AUTHORITY_FIELDS
    if unknown:
        raise ValueError(f'authority contains unsupported fields: {sorted(unknown)}')
    normalized = {}
    for key, item in value.items():
        if item is None:
            continue
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f'authority.{key} must be a non-empty string')
        if len(item) > 255:
            raise ValueError(f'authority.{key} exceeds 255 characters')
        normalized[key] = item
    return normalized
