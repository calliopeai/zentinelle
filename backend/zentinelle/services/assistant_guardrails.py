"""Deterministic product guardrails for the portal support assistant.

The assistant is a Zentinelle support surface, not a general-purpose chatbot.
Rejecting an out-of-scope or injection-shaped message before it reaches a
provider keeps the boundary independent of model behavior.
"""
import re
from dataclasses import dataclass

from django.conf import settings

from zentinelle.models import Policy
from zentinelle.services.evaluators.ai_guardrail import AIGuardrailEvaluator
from zentinelle.services.evaluators.prompt_injection import \
    PromptInjectionEvaluator

DEFAULT_TOPIC_TERMS = {
    'zentinelle', 'governance', 'policy', 'policies', 'agent', 'agents',
    'workload', 'endpoint', 'model', 'models', 'llm', 'prompt', 'prompts',
    'injection', 'guardrail', 'security', 'risk', 'risks', 'compliance',
    'audit', 'incident', 'incidents', 'alert', 'alerts', 'retention',
    'legal', 'hold', 'budget', 'cost', 'provider', 'providers', 'tool',
    'tools', 'permission', 'permissions', 'access', 'data', 'trace',
    'traces', 'event', 'events', 'brocs', 'atlas', 'mitre', 'control',
    'controls', 'deployment', 'deployments', 'configuration', 'configure',
    'settings', 'apikey', 'credential', 'credentials', 'login', 'role',
    'roles', 'tenant', 'tenants', 'integration', 'integrations', 'sdk',
    'gateway', 'scan', 'scanning', 'report', 'reports', 'evidence',
}

INDIRECT_INJECTION_PATTERNS = (
    r'ignore\s+(?:all\s+)?previous\s+instructions',
    r'(?:reveal|show|print)\s+(?:the\s+)?system\s+prompt',
    r'do\s+not\s+follow\s+(?:the\s+)?policy',
    r' instructions\s*:\s*',
)


@dataclass(frozen=True)
class GuardrailDecision:
    allowed: bool
    reason: str = ''
    policy_ids: tuple[str, ...] = ()


def _terms(message: str) -> set[str]:
    return set(re.findall(r"[a-z][a-z0-9_-]{2,}", message.lower()))


def _allowed_topic_terms() -> set[str]:
    configured = getattr(settings, 'ASSISTANT_ALLOWED_TOPICS', ())
    terms = set(DEFAULT_TOPIC_TERMS)
    for topic in configured:
        terms.update(_terms(str(topic)))
    return terms


def check_support_message(tenant_id: str, message: str) -> GuardrailDecision:
    """Check scope and tenant-configured input policies before provider access."""
    if not isinstance(message, str) or not message.strip():
        return GuardrailDecision(False, 'A support question is required')

    context = {'input_text': message, 'topic': message, 'assistant_surface': 'support'}
    policies = Policy.objects.filter(
        tenant_id=tenant_id,
        enabled=True,
        scope_type=Policy.ScopeType.ORGANIZATION,
        enforcement__in=(Policy.Enforcement.ENFORCE, Policy.Enforcement.AUDIT),
        policy_type__in=(Policy.PolicyType.AI_GUARDRAIL, Policy.PolicyType.PROMPT_INJECTION),
    ).order_by('policy_type', 'priority', 'id')
    policy_ids = []
    for policy in policies:
        policy_ids.append(str(policy.id))
        evaluator = (AIGuardrailEvaluator() if policy.policy_type == Policy.PolicyType.AI_GUARDRAIL
                     else PromptInjectionEvaluator())
        result = evaluator.evaluate(policy, 'assistant:support', None, context, dry_run=True)
        if not result.passed and policy.enforcement == Policy.Enforcement.ENFORCE:
            return GuardrailDecision(False, result.message or 'Support guardrail denied this message', tuple(policy_ids))

    terms = _terms(message)
    if not terms.intersection(_allowed_topic_terms()):
        return GuardrailDecision(
            False,
            'I can help with Zentinelle governance, agents, policies, security, compliance, risk, audit, and operations. Please ask a question in that scope.',
            tuple(policy_ids),
        )
    return GuardrailDecision(True, policy_ids=tuple(policy_ids))


def check_support_output(text: str) -> GuardrailDecision:
    """Apply the product scope check to a completed model response."""
    if not isinstance(text, str) or not text.strip():
        return GuardrailDecision(False, 'The assistant returned no safe response')
    if not _terms(text).intersection(_allowed_topic_terms()):
        return GuardrailDecision(False, 'The generated response was outside the Zentinelle support scope')
    return GuardrailDecision(True)


def check_untrusted_content(text: str) -> GuardrailDecision:
    """Reject injection-shaped instructions returned by tools or retrieval."""
    if not isinstance(text, str):
        return GuardrailDecision(True)
    for pattern in INDIRECT_INJECTION_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return GuardrailDecision(False, 'Untrusted tool content contained an instruction injection')
    return GuardrailDecision(True)
