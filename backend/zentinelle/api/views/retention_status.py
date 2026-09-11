"""
Retention status endpoint.

GET /api/zentinelle/v1/retention/status/

Returns active data_retention policy configs for the authenticated tenant.
"""
import logging

from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import get_tenant_id_from_request
from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess, PortalAdminAccess
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


class PrivacyEraseView(APIView):
    """Explicit, hold-aware tenant erasure endpoint."""
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def post(self, request):
        tenant_id = get_tenant_id_from_request(request)
        if not tenant_id:
            return Response({'error': 'Could not resolve tenant'}, status=401)
        from zentinelle.services.privacy_lifecycle import erase_tenant
        subject_id = request.data.get('subject_id') if isinstance(request.data, dict) else None
        if subject_id is not None and (not isinstance(subject_id, str) or not subject_id.strip() or len(subject_id) > 255):
            return Response({'error': 'subject_id must be a non-empty bounded string'}, status=400)
        try:
            result = erase_tenant(tenant_id, actor=str(getattr(request.user, 'pk', '') or 'operator'), subject_id=subject_id.strip() if subject_id else None)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=409)
        except RuntimeError as exc:
            return Response({'error': str(exc)}, status=503)
        return Response(result)


class PrivacyRestoreView(APIView):
    """Preview or commit a verified local archive restore."""
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def post(self, request):
        tenant_id = get_tenant_id_from_request(request)
        payload = request.data if isinstance(request.data, dict) else {}
        manifest = payload.get('manifest')
        if not isinstance(manifest, dict):
            return Response({'error': 'manifest is required'}, status=400)
        from zentinelle.services.privacy_lifecycle import restore_archive
        try:
            result = restore_archive(manifest, tenant_id,
                                     actor=str(getattr(request.user, 'pk', '') or 'operator'),
                                     commit=payload.get('commit') is True)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        return Response(result)
