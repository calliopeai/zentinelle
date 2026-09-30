"""Signed delivery and outcome receipts on the authenticated install channel."""
from django.db import router, transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import AstroliftInstallAuthentication
from zentinelle.models import AgentEndpoint, AstroliftEnforcement, AuditLog
from zentinelle.services.astrolift_sessions import (canonical_body,
                                                    signed_delivery)


class AstroliftEnforcementView(APIView):
    authentication_classes = [AstroliftInstallAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, agent_id):
        tenant = request.query_params.get('tenant_id', '')
        install = request.user.install
        if tenant not in install.tenant_ids:
            return Response({'error': 'Agent not found'}, status=404)
        endpoint = AgentEndpoint.objects.filter(tenant_id=tenant, astrolift_install=install, agent_id=agent_id).first()
        if endpoint is None:
            return Response({'error': 'Agent not found'}, status=404)
        credential = request.META['HTTP_AUTHORIZATION'][len('Bearer '):].strip()
        records = AstroliftEnforcement.objects.filter(tenant_id=tenant, install=install, endpoint=endpoint,
                                                      status='pending').order_by('created_at')[:50]
        response = Response({'actions': [signed_delivery(row, credential) for row in records]})
        response['Cache-Control'] = 'no-store'
        return response


class AstroliftEnforcementOutcomeView(APIView):
    authentication_classes = [AstroliftInstallAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, agent_id, action_id):
        tenant, outcome = request.data.get('tenant_id'), request.data.get('outcome')
        install = request.user.install
        if tenant not in install.tenant_ids:
            return Response({'error': 'Action not found'}, status=404)
        if not isinstance(outcome, dict) or len(canonical_body(outcome)) > 16384 or outcome.get('status') not in ('applied', 'observed', 'refused', 'failed'):
            return Response({'error': 'A bounded outcome with a terminal status is required'}, status=400)
        using = router.db_for_write(AstroliftEnforcement)
        with transaction.atomic(using=using):
            row = AstroliftEnforcement.objects.select_for_update().filter(
                tenant_id=tenant, install=install, endpoint__agent_id=agent_id, id=action_id).first()
            if row is None:
                return Response({'error': 'Action not found'}, status=404)
            if row.status != 'pending':
                if row.outcome != outcome:
                    return Response({'error': 'Outcome conflicts with the recorded receipt'}, status=409)
            else:
                row.status, row.outcome, row.applied_at = outcome['status'], outcome, timezone.now()
                row.save(update_fields=['status', 'outcome', 'applied_at'])
            if not AuditLog.objects.filter(tenant_id=tenant, resource_type='agent_enforcement', resource_id=str(row.pk)).exists():
                AuditLog.log(tenant_id=tenant, action=AuditLog.Action.UPDATE, resource_type='agent_enforcement',
                             resource_id=str(row.pk), resource_name=row.payload.get('policy_name', ''),
                             changes=outcome, metadata={'source': 'astrolift', 'policy_id': row.payload.get('policy_id'),
                                                        'evidence_url': row.payload.get('evidence_url'), 'install_id': str(install.pk)})
        return Response({'status': row.status})
