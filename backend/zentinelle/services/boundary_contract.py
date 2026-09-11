"""Shared functional-boundary contract for gateway and adapter integrations."""

CONTRACT_VERSION = '1'
ACTION_ALIASES = {
    'tool.invoke': 'tool_call', 'mcp.tool_call': 'tool_call',
    'retrieve': 'retrieval', 'rag.retrieve': 'retrieval', 'data_access': 'retrieval',
    'workflow_step': 'workflow.transition', 'workflow': 'workflow.transition',
    'network.egress': 'egress', 'llm_call': 'llm:invoke', 'ai_request': 'llm:invoke',
}


def canonical_action(action):
    value = str(action or '').strip().lower()
    if not value:
        raise ValueError('action is required')
    return ACTION_ALIASES.get(value, value)


def resource_type_for_action(action):
    normalized = canonical_action(action)
    if normalized == 'tool_call':
        return 'tool'
    if normalized == 'retrieval':
        return 'retrieval'
    if normalized == 'workflow.transition':
        return 'workflow'
    if normalized in {'egress', 'llm:response'}:
        return 'egress'
    if normalized.startswith('llm:'):
        return 'model'
    return 'action'


def build_contract(*, endpoint, action, user_id='', context=None):
    """Build the canonical subject/action/resource envelope.

    Adapters should use this shape before executing a side effect. Tenant and
    endpoint identity are taken from authenticated state, never request data.
    """
    if not getattr(endpoint, 'tenant_id', '') or not getattr(endpoint, 'id', None):
        raise ValueError('authenticated tenant and endpoint are required')
    normalized = canonical_action(action)
    supplied = dict(context or {})
    resource_type = supplied.get('resource_type') or resource_type_for_action(normalized)
    resource_id = supplied.get('resource_id') or supplied.get('workload_id') or supplied.get('tool') or ''
    return {
        'contract_version': CONTRACT_VERSION,
        'subject': {'tenant_id': endpoint.tenant_id, 'user_id': str(user_id or ''),
                    'endpoint_id': str(endpoint.id), 'agent_id': endpoint.agent_id},
        'action': normalized,
        'resource': {'type': str(resource_type), 'id': str(resource_id)},
        'context': supplied,
    }
