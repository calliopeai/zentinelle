"""Role-protected agent suspension, revocation and tool containment."""
import json

from django.http import JsonResponse
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAdminAccess
from zentinelle.models import AgentEndpoint, AuditLog
from zentinelle.schema.auth_helpers import get_request_tenant_id


class AgentControlView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def get(self, request, agent_id):
        tenant_id = get_request_tenant_id(request.user) or ''
        endpoint = AgentEndpoint.objects.filter(tenant_id=tenant_id, agent_id=agent_id).first()
        if endpoint is None:
            return JsonResponse({'error': 'Agent not found'}, status=404)
        from zentinelle.models import AuditLog, Incident
        from zentinelle.services.policy_engine import PolicyEngine
        policies = PolicyEngine().get_effective_policies(endpoint, use_cache=False)
        incidents = Incident.objects.filter(tenant_id=tenant_id, endpoint=endpoint).order_by('-created_at')[:10]
        recent_audits = AuditLog.objects.filter(
            tenant_id=tenant_id, resource_id=str(endpoint.id),
        ).order_by('-timestamp')[:20]
        containment = (endpoint.metadata or {}).get('containment', {'denied_tools': []})
        metadata = endpoint.metadata or {}
        return JsonResponse({
            'agent': {
                'agent_id': endpoint.agent_id, 'name': endpoint.name,
                'agent_type': endpoint.agent_type, 'status': endpoint.status,
                'health': endpoint.health, 'last_heartbeat': endpoint.last_heartbeat.isoformat() if endpoint.last_heartbeat else None,
                'owner_id': metadata.get('owner_id', ''), 'identities': metadata.get('identities', []),
                'taxonomy': metadata.get('taxonomy', {}), 'capabilities': endpoint.capabilities,
                'tools': metadata.get('tools', metadata.get('capabilities', [])),
                'model_routes': metadata.get('model_routes', []),
                'data_access': metadata.get('data_access', []),
                'budget': metadata.get('budget', {}),
                'deployment_id': endpoint.deployment_id_ext,
                'sub_organization_id': endpoint.sub_organization_id_ext,
                'containment': containment,
                'authority': metadata.get('authority', metadata.get('taxonomy', {}).get('supported', [])),
            },
            'policies': [{'id': str(policy.id), 'name': policy.name, 'type': policy.policy_type, 'version': policy.version, 'enforcement': policy.enforcement} for policy in policies],
            'incidents': [{'id': str(item.id), 'status': item.status, 'severity': item.severity, 'title': item.title} for item in incidents],
            'decision_traces': [
                {'trace_id': (item.metadata or {}).get('trace_id', ''), 'action': item.action,
                 'timestamp': item.timestamp.isoformat() if item.timestamp else None}
                for item in recent_audits if (item.metadata or {}).get('trace_id')
            ],
        })

    def post(self, request, agent_id):
        tenant_id = get_request_tenant_id(request.user) or ''
        endpoint = AgentEndpoint.objects.filter(tenant_id=tenant_id, agent_id=agent_id).first()
        if endpoint is None:
            return JsonResponse({'error': 'Agent not found'}, status=404)
        try:
            payload = json.loads(request.body or '{}')
        except (TypeError, ValueError, json.JSONDecodeError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        action = payload.get('action')
        if action not in ('suspend', 'revoke', 'emergency_stop', 'contain_tools'):
            return JsonResponse({'error': 'action must be suspend, revoke, emergency_stop, or contain_tools'}, status=400)
        from zentinelle.models import TenantConfig
        config = TenantConfig.objects.filter(tenant_id=tenant_id).values_list('settings', flat=True).first() or {}
        if config.get('control_approval_required', False):
            from zentinelle.services.approvals import consume_approvals, context_digest, find_approval
            actor = str(request.user.pk)
            approval_context = {'agent_id': agent_id, 'action': action, 'denied_tools': payload.get('denied_tools', [])}
            approval = find_approval(payload.get('approval_token'), tenant_id=tenant_id, kind='assistant', subject=actor,
                                     action=f'agent_control:{action}', digest=context_digest(approval_context))
            if not approval or not consume_approvals([approval.pk], tenant_id=tenant_id):
                return JsonResponse({'error': 'Current human approval for this exact control action is required'}, status=403)
        if action == 'suspend':
            endpoint.status = AgentEndpoint.Status.SUSPENDED
            endpoint.save(update_fields=['status', 'updated_at'])
        elif action in ('revoke', 'emergency_stop'):
            endpoint.status = AgentEndpoint.Status.TERMINATED
            endpoint.api_key_hash = ''
            endpoint.save(update_fields=['status', 'api_key_hash', 'updated_at'])
        elif action == 'contain_tools':
            tools = payload.get('denied_tools')
            if not isinstance(tools, list) or not all(isinstance(item, str) for item in tools):
                return JsonResponse({'error': 'denied_tools must be a list of strings'}, status=400)
            metadata = {**(endpoint.metadata or {}), 'containment': {'denied_tools': sorted(set(tools))}}
            endpoint.metadata = metadata
            endpoint.save(update_fields=['metadata', 'updated_at'])
        AuditLog.objects.create(
            tenant_id=tenant_id, ext_user_id=str(request.user.pk), action=AuditLog.Action.SUSPEND if action == 'suspend' else AuditLog.Action.UPDATE,
            resource_type='agent_endpoint', resource_id=str(endpoint.id), resource_name=endpoint.name,
            metadata={'control_action': action, 'emergency': action == 'emergency_stop'},
        )
        return JsonResponse({'agent_id': endpoint.agent_id, 'status': endpoint.status, 'metadata': endpoint.metadata})
