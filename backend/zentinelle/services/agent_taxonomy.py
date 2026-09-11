"""Canonical, composable agent taxonomy validation."""

CANONICAL_TAGS = {
    'function': {'hr', 'recruiting', 'finance', 'legal', 'support', 'customer_service', 'coding', 'research', 'sales', 'operations'},
    'mode': {'single_agent', 'workflow', 'swarm', 'delegated', 'human_assisted', 'scheduled'},
    'data': {'public', 'internal', 'confidential', 'restricted', 'regulated'},
    'authority': {'read_only', 'write', 'destructive', 'external_egress', 'privileged'},
    'environment': {'development', 'staging', 'production', 'emergency'},
    'service': {'customer_service', 'legal', 'coding', 'research', 'operations'},
    'service_subcategory': {'billing', 'technical_support', 'claims', 'contracts'},
}


def validate_taxonomy(tags, *, tenant_extensions=None):
    """Return normalized supported tags and explicit unsupported values.

    ``client``, ``workspace``, and ``project`` identifiers are tenant-owned
    labels; callers may supply them, but they are never treated as canonical
    policy values until an administrator has registered an extension.
    """
    if tags is None:
        tags = []
    if not isinstance(tags, list):
        raise ValueError('taxonomy tags must be a list')
    extensions = set(tenant_extensions or ())
    supported, unsupported = [], []
    for raw in tags:
        if not isinstance(raw, str) or raw.count(':') != 1:
            unsupported.append(raw)
            continue
        dimension, value = (part.strip().lower() for part in raw.split(':', 1))
        normalized = f'{dimension}:{value}'
        if value in CANONICAL_TAGS.get(dimension, set()) or normalized in extensions:
            supported.append(normalized)
        else:
            unsupported.append(normalized)
    return {'supported': sorted(set(supported)), 'unsupported': sorted(set(unsupported), key=str)}
