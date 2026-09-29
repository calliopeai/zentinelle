"""Human approval issuance; agent credentials cannot authorize their own work."""
from django.db import router, transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import (ZentinelleAPIKeyAuthentication,
                                 get_endpoint_from_request)
from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess
from zentinelle.api.serializers import ApprovalDecisionSerializer
from zentinelle.models import AgentEndpoint, ApprovalRequest, AuditLog
from zentinelle.schema.auth_helpers import get_request_tenant_id
from zentinelle.services.approvals import (decide_approval_request,
                                           issue_approval, sign_approval)
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


class ApprovalRequestListView(APIView):
    """Held actions still waiting for an operator, newest first (#377)."""

    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def get(self, request):
        tenant_id = get_request_tenant_id(request.user)
        held = list(ApprovalRequest.objects.filter(
            tenant_id=tenant_id, status=ApprovalRequest.Status.PENDING, expires_at__gt=timezone.now(),
        ).order_by('-created_at')[:100])
        agents = {
            str(pk): agent_id for pk, agent_id in AgentEndpoint.objects.filter(
                tenant_id=tenant_id, pk__in=[h.endpoint_id_ext for h in held],
            ).values_list('pk', 'agent_id')
        }
        return Response({'requests': [{
            'request_id': str(h.pk),
            'agent_id': agents.get(h.endpoint_id_ext, ''),
            'user_id': h.subject,
            'action': h.action,
            'context': h.context,
            'reason': h.reason,
            'trace_id': h.trace_id,
            'expires_at': h.expires_at,
            'created_at': h.created_at,
        } for h in held]})


class ApprovalRequestStatusView(APIView):
    """The requesting workload polls its own held action and nothing else."""

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, request_id):
        endpoint = get_endpoint_from_request(request)
        held = ApprovalRequest.objects.filter(
            tenant_id=endpoint.tenant_id, endpoint_id_ext=str(endpoint.pk), pk=request_id,
        ).select_related('approval').first()
        if held is None:
            return Response({'error': 'Approval request not found'}, status=404)
        current = held.current_status()
        body = {'request_id': str(held.pk), 'status': current, 'expires_at': held.expires_at}
        if current == ApprovalRequest.Status.APPROVED and held.approval is not None:
            # Signed per read. It names the human-granted, single-use record,
            # so signing it again authorizes nothing new.
            body['approval_token'] = sign_approval(held.approval.pk)
            body['approval_expires_at'] = held.approval.expires_at
        elif current == ApprovalRequest.Status.DENIED:
            body['reason'] = held.decision_reason or 'Denied by an approver'
        elif current == ApprovalRequest.EXPIRED:
            body['reason'] = 'No approval arrived before the request expired'
        return Response(body)


class ApprovalRequestDecisionView(APIView):
    """An operator approves or denies a held action; workload keys cannot."""

    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def post(self, request, request_id):
        tenant_id = get_request_tenant_id(request.user)
        serializer = ApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data['decision']
        reason = serializer.validated_data['reason']
        try:
            with transaction.atomic(using=router.db_for_write(AuditLog)):
                held = decide_approval_request(
                    tenant_id=tenant_id, request_id=request_id, approve=decision == 'approve',
                    decided_by=str(request.user.pk), reason=reason,
                )
                AuditLog.log(
                    tenant_id=tenant_id, action='update', resource_type='approval_request',
                    resource_id=held.pk, ext_user_id=str(request.user.pk),
                    metadata={'decision': decision, 'action': held.action, 'subject': held.subject,
                              'endpoint_id': held.endpoint_id_ext, 'reason': reason},
                )
        except ApprovalRequest.DoesNotExist:
            return Response({'error': 'Approval request not found'}, status=404)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=409)
        return Response({'request_id': str(held.pk), 'status': held.status, 'decided_at': held.decided_at})
