"""Feature and entitlement status for the optional policy copilot."""
from django.http import JsonResponse
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess
from zentinelle.models import (AuditLog, ControlEvidence, LLMProviderKey, Policy,
                               PolicyChangeSet, TenantConfig)
from zentinelle.schema.auth_helpers import get_request_tenant_id


class PolicyCopilotStatusView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def get(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        values = config.settings if config else {}
        key_configured = LLMProviderKey.objects.filter(
            tenant_id=tenant_id, is_active=True, enabled_for_assistant=True,
        ).exists()
        enabled = bool(values.get('policy_copilot_enabled', False))
        return JsonResponse({
            'enabled': enabled and key_configured,
            'configured': enabled,
            'available': key_configured,
            'reason': None if (enabled and key_configured) else (
                'Configure an active provider key' if enabled else 'Disabled by tenant policy'
            ),
            'model': values.get('assistant_model', ''),
            'provider': values.get('assistant_provider', ''),
        })


class PolicyCopilotDraftView(APIView):
    """Validate a structured policy draft without mutating live policy state."""
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def post(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        values = config.settings if config else {}
        if not values.get('policy_copilot_enabled', False):
            return JsonResponse({'error': 'Policy copilot is disabled'}, status=403)
        if not LLMProviderKey.objects.filter(tenant_id=tenant_id, is_active=True, enabled_for_assistant=True).exists():
            return JsonResponse({'error': 'Configure an active provider key before using the copilot'}, status=503)
        payload = request.data if isinstance(request.data, dict) else {}
        policy_type = payload.get('policy_type')
        draft_config = payload.get('config')
        natural_language = str(payload.get('prompt', '')).strip()
        if natural_language and (not policy_type or not isinstance(draft_config, dict)):
            policy_type, draft_config = self._infer_draft(natural_language)
        valid_types = {choice[0] for choice in Policy.PolicyType.choices}
        errors = {}
        if policy_type not in valid_types:
            errors['policy_type'] = 'Unsupported policy type'
        if not isinstance(draft_config, dict):
            errors['config'] = 'Policy config must be an object'
        if errors:
            return JsonResponse({'error': 'Invalid policy draft', 'fields': errors}, status=400)
        AuditLog.objects.create(
            tenant_id=tenant_id, ext_user_id=str(request.user.pk), action=AuditLog.Action.ACCESS,
            resource_type='policy_copilot', resource_id=tenant_id,
            metadata={'operation': 'draft', 'policy_type': policy_type},
        )
        draft = {
            'name': payload.get('name', ''),
            'policy_type': policy_type,
            'config': draft_config,
            'scope_type': payload.get('scope_type', Policy.ScopeType.ORGANIZATION),
            'enforcement': payload.get('enforcement', Policy.Enforcement.ENFORCE),
        }
        return JsonResponse({
            'draft': draft,
            'mutated': False,
            'next_step': 'Submit through the staged policy change workflow for validation and approval',
        })

    @staticmethod
    def _infer_draft(prompt):
        """Map only reviewed intents; ambiguous language stays unsupported."""
        text = prompt.lower()
        if 'model' in text and any(word in text for word in ('restrict', 'allow', 'block')):
            models = [token.strip('.,') for token in text.split() if token.startswith(('gpt-', 'claude-', 'gemini-'))]
            return 'model_restriction', {'allowed_models': models} if models else {'allowed_models': [], 'review_required': True}
        if 'tool' in text and any(word in text for word in ('block', 'deny', 'restrict')):
            tools = [token.strip('.,') for token in text.split() if '_' in token]
            return 'tool_permission', {'denied_tools': tools, 'review_required': True}
        if 'retention' in text or 'delete' in text:
            return 'data_retention', {'review_required': True}
        return None, None


class PolicyCopilotExplainView(APIView):
    """Read-only explanation of effective policy and taxonomy state."""
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def post(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        if not (config and (config.settings or {}).get('policy_copilot_enabled', False)):
            return JsonResponse({'error': 'Policy copilot is disabled'}, status=403)
        payload = request.data if isinstance(request.data, dict) else {}
        agent_id = str(payload.get('agent_id', '')).strip()
        from zentinelle.models import AgentEndpoint
        endpoint = AgentEndpoint.objects.filter(tenant_id=tenant_id, agent_id=agent_id).first()
        if endpoint is None:
            return JsonResponse({'error': 'Agent not found'}, status=404)
        from zentinelle.services.policy_engine import PolicyEngine
        policies = PolicyEngine().get_effective_policies(endpoint, use_cache=False)
        action = str(payload.get('action', 'llm:invoke'))
        decision = PolicyEngine().evaluate(endpoint, action, context=payload.get('context', {}) or {}, dry_run=True)
        control_ids = [policy.policy_type for policy in policies]
        evidence = ControlEvidence.objects.filter(tenant_id=tenant_id, control_id__in=control_ids).order_by('-captured_at')
        evidence_by_control = {}
        for item in evidence:
            evidence_by_control.setdefault(item.control_id, item)
        AuditLog.objects.create(tenant_id=tenant_id, ext_user_id=str(request.user.pk), action=AuditLog.Action.ACCESS,
                                resource_type='policy_copilot', resource_id=tenant_id,
                                metadata={'operation': 'explain', 'agent_id': agent_id, 'action': action})
        return JsonResponse({'agent_id': agent_id, 'action': action,
                             'decision': {'allowed': decision.allowed, 'reason': decision.reason, 'dry_run': True},
                             'taxonomy': (endpoint.metadata or {}).get('taxonomy', {}),
                             'scope': {'tenant_id': tenant_id, 'sub_organization_id': endpoint.sub_organization_id_ext,
                                       'deployment_id': endpoint.deployment_id_ext, 'endpoint_id': endpoint.agent_id},
                             'policies': [{'id': str(policy.id), 'name': policy.name, 'type': policy.policy_type,
                                           'version': policy.version, 'enforcement': policy.enforcement,
                                           'selectors': (policy.config or {}).get('taxonomy_selectors', [])}
                                          for policy in policies],
                             'evidence': [{'control_id': key, 'status': value.effective_status,
                                           'captured_at': value.captured_at.isoformat(), 'id': str(value.id)}
                                          for key, value in evidence_by_control.items()]})


class PolicyCopilotDiffView(APIView):
    """Return a tenant-scoped, non-mutating diff and impact preview."""
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def post(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        if not (config and (config.settings or {}).get('policy_copilot_enabled', False)):
            return JsonResponse({'error': 'Policy copilot is disabled'}, status=403)
        payload = request.data if isinstance(request.data, dict) else {}
        policy_id = str(payload.get('policy_id', '')).strip()
        draft = payload.get('draft') if isinstance(payload.get('draft'), dict) else payload
        current = Policy.objects.filter(tenant_id=tenant_id, id=policy_id).first() if policy_id else None
        if policy_id and current is None:
            return JsonResponse({'error': 'Policy not found'}, status=404)
        before = {'policy_type': current.policy_type, 'scope_type': current.scope_type,
                  'enforcement': current.enforcement, 'config': current.config} if current else {}
        after = {'policy_type': draft.get('policy_type'), 'scope_type': draft.get('scope_type'),
                 'enforcement': draft.get('enforcement'), 'config': draft.get('config', {})}
        changed = [key for key in after if after[key] != before.get(key)]
        from zentinelle.models import AgentEndpoint
        impacted = AgentEndpoint.objects.filter(tenant_id=tenant_id).count()
        AuditLog.objects.create(tenant_id=tenant_id, ext_user_id=str(request.user.pk), action=AuditLog.Action.ACCESS,
                                resource_type='policy_copilot', resource_id=tenant_id,
                                metadata={'operation': 'diff', 'policy_id': policy_id, 'changed': changed})
        return JsonResponse({'policy_id': policy_id or None, 'before': before, 'after': after,
                             'changed_fields': changed, 'impacted_agent_count': impacted,
                             'mutated': False, 'next_step': 'Submit through staged policy workflow'})


class PolicyCopilotStageView(APIView):
    """Turn a reviewed draft into a normal staged-workflow change set."""
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def post(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        if not (config and (config.settings or {}).get('policy_copilot_enabled', False)):
            return JsonResponse({'error': 'Policy copilot is disabled'}, status=403)
        payload = request.data if isinstance(request.data, dict) else {}
        draft = payload.get('draft')
        if not isinstance(draft, dict) or draft.get('policy_type') not in {choice[0] for choice in Policy.PolicyType.choices}:
            return JsonResponse({'error': 'A valid structured draft is required'}, status=400)
        actor = str(getattr(request.user, 'pk', '') or getattr(request.user, 'username', '') or 'operator')
        change = PolicyChangeSet.objects.create(
            tenant_id=tenant_id, title=str(payload.get('title') or 'Policy copilot draft')[:255],
            description='Created by policy copilot; requires normal validation and approval.',
            changes=[draft], created_by=actor,
            target_selectors=draft.get('target_selectors', {}) if isinstance(draft.get('target_selectors', {}), dict) else {},
        )
        AuditLog.objects.create(tenant_id=tenant_id, ext_user_id=actor, action=AuditLog.Action.ACCESS,
                                resource_type='policy_copilot', resource_id=str(change.id),
                                metadata={'operation': 'stage', 'mutated_live_policy': False})
        return JsonResponse({'change_id': str(change.id), 'status': change.status,
                             'mutated_live_policy': False, 'next_step': 'Validate, stage, approve, and promote through policy workflow'}, status=201)
