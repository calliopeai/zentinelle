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
        if action == 'suspend':
            endpoint.status = AgentEndpoint.Status.SUSPENDED
            endpoint.save(update_fields=['status', 'updated_at'])
        elif action == 'revoke':
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
        else:
            return JsonResponse({'error': 'action must be suspend, revoke, or contain_tools'}, status=400)
        AuditLog.objects.create(
            tenant_id=tenant_id, ext_user_id=str(request.user.pk), action=AuditLog.Action.SUSPEND if action == 'suspend' else AuditLog.Action.UPDATE,
            resource_type='agent_endpoint', resource_id=str(endpoint.id), resource_name=endpoint.name,
            metadata={'control_action': action},
        )
        return JsonResponse({'agent_id': endpoint.agent_id, 'status': endpoint.status, 'metadata': endpoint.metadata})
