"""Shared functional-boundary contract for gateway and adapter integrations."""
import uuid

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


def evaluate_boundary(*, endpoint, action, user_id='', context=None, dry_run=False):
    """Authorize an adapter boundary using the canonical contract.

    Workflow, retrieval, MCP, and native integrations can call this helper
    immediately before a side effect. Identity is sourced from ``endpoint``;
    malformed context or evaluator outages return a deny decision rather than
    allowing an adapter to continue without evidence.
    """
    trace_id = str(uuid.uuid4())
    supplied = dict(context or {}) if isinstance(context or {}, dict) else None
    if supplied is None:
        return {'contract_version': CONTRACT_VERSION, 'action': str(action or ''),
                'decision': 'deny', 'allowed': False, 'reason': 'Boundary context must be an object',
                'trace_id': trace_id, 'coverage': {'status': 'unknown'}}
    supplied['trace_id'] = trace_id
    try:
        normalized = canonical_action(action)
        contract = build_contract(endpoint=endpoint, action=normalized, user_id=user_id, context=supplied)
        if normalized in {'tool_call', 'retrieval'}:
            from zentinelle.services.assistant_guardrails import \
                check_untrusted_content
            for key in ('tool_outputs', 'tool_result', 'rag_context', 'retrieved_content', 'content'):
                value = supplied.get(key)
                if value is None:
                    continue
                decision = check_untrusted_content(value if isinstance(value, str) else str(value))
                if not decision.allowed:
                    return {**contract, 'trace_id': trace_id, 'decision': 'deny', 'allowed': False,
                            'reason': decision.reason, 'coverage': {'status': 'enforced'},
                            'warnings': ['untrusted context rejected before policy evaluation']}
        from zentinelle.services.policy_engine import PolicyEngine
        result = PolicyEngine().evaluate(endpoint=endpoint, action=normalized, user_id=user_id,
                                         context=supplied, dry_run=dry_run)
        return {**contract, 'trace_id': trace_id,
                'decision': 'allow' if result.allowed else 'deny', 'allowed': result.allowed,
                'reason': result.reason, 'policies_evaluated': result.policies_evaluated,
                'coverage': result.coverage, 'warnings': result.warnings,
                'enforcement': result.enforcement}
    except Exception as exc:
        return {'contract_version': CONTRACT_VERSION, 'action': str(action or ''),
                'decision': 'deny', 'allowed': False,
                'reason': 'Boundary evaluation unavailable', 'trace_id': trace_id,
                'coverage': {'status': 'unknown'}, 'warnings': [str(exc)[:255]]}
