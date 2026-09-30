"""Pre-approval through the minting install, without distributing agent keys."""
from django.db import router, transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import AstroliftInstallAuthentication
from zentinelle.api.views.evaluate import EvaluateView
from zentinelle.models import AgentEndpoint, ApprovalRequest, AuditLog
from zentinelle.services.approvals import (decide_approval_request,
                                           sign_approval)


def _endpoint(request, agent_id):
    install = request.user.install
    tenant = request.data.get('tenant_id')
    if not isinstance(tenant, str) or tenant not in install.tenant_ids:
        return None
    return AgentEndpoint.objects.filter(tenant_id=tenant, astrolift_install=install, agent_id=agent_id).first()


class AstroliftAgentEvaluateView(EvaluateView):
    authentication_classes = [AstroliftInstallAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, agent_id):
        endpoint = _endpoint(request, agent_id)
        if endpoint is None:
            return Response({'error': 'Agent not found on this install'}, status=404)
        if endpoint.status != AgentEndpoint.Status.ACTIVE or not endpoint.api_key_hash or (
                endpoint.api_key_expires_at and endpoint.api_key_expires_at <= timezone.now()):
            return Response({'decision': 'deny', 'allowed': False, 'reason': 'Agent credentials are revoked or expired'}, status=403)
        if request.data.get('action') != 'tool_call':
            return Response({'error': 'This channel evaluates tool_call only'}, status=400)
        return self.evaluate(request, endpoint, host_approval=True)


class AstroliftAgentApprovalView(APIView):
    authentication_classes = [AstroliftInstallAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, agent_id, request_id):
        endpoint = _endpoint(request, agent_id)
        if endpoint is None:
            return Response({'error': 'Agent not found on this install'}, status=404)
        decision, actor, reason = request.data.get('decision'), request.data.get('actor_id'), request.data.get('reason', '')
        if decision not in ('approve', 'deny') or not isinstance(actor, str) or not 1 <= len(actor) <= 180 or not isinstance(reason, str) or len(reason) > 4000:
            return Response({'error': 'A bounded actor_id, decision and reason are required'}, status=400)
        if endpoint.status != AgentEndpoint.Status.ACTIVE or not endpoint.api_key_hash or (
                endpoint.api_key_expires_at and endpoint.api_key_expires_at <= timezone.now()):
            return Response({'error': 'Agent is stopped'}, status=403)
        held = ApprovalRequest.objects.filter(tenant_id=endpoint.tenant_id, endpoint_id_ext=str(endpoint.pk), pk=request_id).first()
        if held is None:
            return Response({'error': 'Approval request not found'}, status=404)
        try:
            with transaction.atomic(using=router.db_for_write(AuditLog)):
                held = ApprovalRequest.objects.select_for_update().get(tenant_id=endpoint.tenant_id, pk=held.pk)
                actor_identity = f'astrolift:{request.user.install.pk}:{actor}'
                expected = ApprovalRequest.Status.APPROVED if decision == 'approve' else ApprovalRequest.Status.DENIED
                if held.status == expected and held.decided_by == actor_identity and held.decision_reason == reason:
                    return self._response(held)
                held = decide_approval_request(tenant_id=endpoint.tenant_id, request_id=held.pk, approve=decision == 'approve',
                                               decided_by=actor_identity, reason=reason)
                AuditLog.log(tenant_id=endpoint.tenant_id, action='update', resource_type='approval_request', resource_id=held.pk,
                             ext_user_id=actor, metadata={'decision': decision, 'reason': reason, 'install_id': str(request.user.install.pk), 'endpoint_id': str(endpoint.pk)})
        except ValueError as exc:
            return Response({'error': str(exc)}, status=409)
        return self._response(held)

    @staticmethod
    def _response(held):
        result = {'request_id': str(held.pk), 'status': held.status}
        if held.approval is not None:
            result['approval_token'] = sign_approval(held.approval.pk)
        response = Response(result)
        response['Cache-Control'] = 'no-store'
        return response
