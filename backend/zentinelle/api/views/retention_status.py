"""
Retention status endpoint.

GET /api/zentinelle/v1/retention/status/

Returns active data_retention policy configs for the authenticated tenant.
"""
import logging

from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import get_tenant_id_from_request
from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess
from zentinelle.models import Policy, RetentionOutcome
from zentinelle.services.retention import verify_retention_manifest

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

    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

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

        try:
            outcomes = RetentionOutcome.objects.filter(tenant_id=tenant_id).order_by('-created_at')[:100]
            outcome_counts = {
                status_value: RetentionOutcome.objects.filter(tenant_id=tenant_id, status=status_value).count()
                for status_value, _ in RetentionOutcome.Status.choices
            }
        except Exception:
            # Keep policy status readable during a migration/ledger outage.
            outcomes = []
            outcome_counts = {}
        serialized = [{
            'id': str(outcome.id), 'entity_type': outcome.entity_type,
            'status': outcome.status, 'record_count': outcome.record_count,
            'destination': outcome.destination, 'manifest_digest': outcome.manifest_digest,
            'manifest_verified': verify_retention_manifest(outcome.manifest),
            'created_at': outcome.created_at.isoformat(),
        } for outcome in outcomes]
        return Response({'policies': policies, 'outcomes': serialized, 'outcome_counts': outcome_counts})
