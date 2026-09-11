"""Human approval issuance; agent credentials cannot authorize their own work."""
from django.db import router, transaction
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess
from zentinelle.models import AgentEndpoint, AuditLog
from zentinelle.schema.auth_helpers import get_request_tenant_id
from zentinelle.services.approvals import issue_approval
from zentinelle.services.evaluation_context import normalize_context
from zentinelle.services.policy_engine import PolicyEngine


class ApprovalIssueView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def post(self, request):
        tenant_id = get_request_tenant_id(request.user)
        endpoint = AgentEndpoint.objects.filter(
            tenant_id=tenant_id, agent_id=request.data.get('agent_id'),
        ).first()
        if endpoint is None:
            return Response({'error': 'Agent not found'}, status=404)
        action = request.data.get('action')
        if not isinstance(action, str) or not action:
            return Response({'error': 'Action is required'}, status=400)
        try:
            context = normalize_context(request.data.get('context', {}))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid action context'}, status=400)
        user_id = request.data.get('user_id')
        policies = PolicyEngine().get_effective_policies(endpoint, user_id, use_cache=False)
        timeout = min([300] + [int(p.config.get('approval_timeout_seconds', 300)) for p in policies])
        with transaction.atomic(using=router.db_for_write(AuditLog)):
            token = issue_approval(
                tenant_id=tenant_id, kind='policy', subject=user_id, action=action,
                context=context, endpoint_id=endpoint.pk, policies=policies,
                granted_by=request.user.pk, timeout=timeout,
            )
            AuditLog.log(
                tenant_id=tenant_id, action='create', resource_type='execution_approval',
                resource_id=endpoint.pk, ext_user_id=str(request.user.pk),
                metadata={'action': action, 'subject': user_id, 'reason': request.data.get('reason', '')},
            )
        return Response({'approval_token': token, 'expires_in_seconds': timeout}, status=201)
