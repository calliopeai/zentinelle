"""
Retention status endpoint.

GET /api/zentinelle/v1/retention/status/

Returns active data_retention policy configs for the authenticated tenant.
"""
import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from zentinelle.models import Policy
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_tenant_id_from_request

logger = logging.getLogger(__name__)


class RetentionStatusView(APIView):
    """
    Return data retention policy configuration for the authenticated tenant.

    GET /api/zentinelle/v1/retention/status/

    Response:
    {
        "policies": [
            {
                "policy_name": "HIPAA: Data Retention",
                "event_retention_days": 2555,
                "audit_log_retention_days": 2555,
                "auto_delete_user_data": false
            }
        ]
    }
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = get_tenant_id_from_request(request)
        if not tenant_id:
            return Response({'error': 'Could not resolve tenant'}, status=401)

        retention_policies = Policy.objects.filter(
            tenant_id=tenant_id,
            policy_type=Policy.PolicyType.DATA_RETENTION,
            enabled=True,
        ).order_by('-priority', 'name')

        policies = []
        for policy in retention_policies:
            config = policy.config or {}
            policies.append({
                'policy_name': policy.name,
                'event_retention_days': config.get('event_retention_days'),
                'audit_log_retention_days': config.get('audit_log_retention_days'),
                'auto_delete_user_data': config.get('auto_delete_user_data', False),
            })

        return Response({'policies': policies})
