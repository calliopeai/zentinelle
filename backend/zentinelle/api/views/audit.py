"""
Audit chain verification API endpoint.

GET /api/zentinelle/v1/audit/verify
"""
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_tenant_id_from_request
from zentinelle.services.audit_chain import verify_chain, verify_recent

logger = logging.getLogger(__name__)


class AuditChainVerifyView(APIView):
    """
    Verify the tamper-evident audit chain for a tenant.

    GET /api/zentinelle/v1/audit/verify?tenant_id=...&from_sequence=1&to_sequence=100

    Query params:
        tenant_id       Required. Tenant to verify.
        from_sequence   Optional. Start of sequence range (default: 1).
        to_sequence     Optional. End of sequence range (default: all).
        recent          Optional. If set, verify the last N records instead.

    Response:
        {
            "valid": true,
            "records_checked": 42,
            "broken_at_sequence": null,
            "root_hash": "abc123..."
        }
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = request.query_params.get('tenant_id')
        if not tenant_id:
            # Fall back to the authenticated tenant
            tenant_id = get_tenant_id_from_request(request)

        if not tenant_id:
            return Response(
                {'error': 'tenant_id is required'},
                status=400,
            )

        recent_param = request.query_params.get('recent')
        if recent_param is not None:
            try:
                limit = int(recent_param)
            except (ValueError, TypeError):
                limit = 100
            result = verify_recent(tenant_id=tenant_id, limit=limit)
            return Response(result)

        try:
            from_sequence = int(request.query_params.get('from_sequence', 1))
        except (ValueError, TypeError):
            from_sequence = 1

        to_sequence_raw = request.query_params.get('to_sequence')
        to_sequence = None
        if to_sequence_raw is not None:
            try:
                to_sequence = int(to_sequence_raw)
            except (ValueError, TypeError):
                to_sequence = None

        result = verify_chain(
            tenant_id=tenant_id,
            from_sequence=from_sequence,
            to_sequence=to_sequence,
        )
        return Response(result)
