"""Admin API for recording and reviewing control evidence."""
from django.utils.dateparse import parse_datetime
from django.db.models import Max
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAdminAccess
from zentinelle.models import AgentEndpoint, ControlEvidence, Event
from zentinelle.schema.auth_helpers import get_request_tenant_id


class ControlEvidenceView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def get(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        rows = ControlEvidence.objects.filter(tenant_id=tenant_id)[:200]
        serialized = [self._serialize(row) for row in rows]
        coverage = {status.value: 0 for status in ControlEvidence.Status}
        for item in serialized:
            coverage[item['effective_status']] = coverage.get(item['effective_status'], 0) + 1
        runtime = runtime_coverage(tenant_id)
        return Response({'evidence': serialized, 'coverage': coverage,
                         'runtime_coverage': runtime,
                         'coverage_as_of': max((item['captured_at'] for item in serialized), default=None)})

    def post(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        data = request.data if isinstance(request.data, dict) else {}
        control_id = str(data.get('control_id', '')).strip()
        if not control_id or len(control_id) > 255:
            return Response({'error': 'control_id is required'}, status=400)
        status_value = data.get('status', ControlEvidence.Status.UNKNOWN)
        if status_value not in {item.value for item in ControlEvidence.Status}:
            return Response({'error': 'invalid evidence status'}, status=400)
        links = data.get('evidence_links', [])
        if not isinstance(links, list) or len(links) > 50 or not all(isinstance(item, str) and len(item) <= 2048 for item in links):
            return Response({'error': 'evidence_links must be a bounded list of strings'}, status=400)
        expires_at = data.get('expires_at')
        if expires_at:
            expires_at = parse_datetime(expires_at) if isinstance(expires_at, str) else None
            if expires_at is None:
                return Response({'error': 'expires_at must be an ISO datetime'}, status=400)
        evidence = ControlEvidence.objects.create(
            tenant_id=tenant_id, control_id=control_id, status=status_value,
            owner=str(data.get('owner', ''))[:255], scope=data.get('scope', {}) if isinstance(data.get('scope', {}), dict) else {},
            evidence_links=links, test_results=data.get('test_results', {}) if isinstance(data.get('test_results', {}), dict) else {},
            expires_at=expires_at, source=str(data.get('source', ''))[:255], notes=str(data.get('notes', ''))[:4000],
        )
        return Response(self._serialize(evidence), status=201)

    @staticmethod
    def _serialize(row):
        return {'id': str(row.id), 'tenant_id': row.tenant_id, 'control_id': row.control_id,
                'status': row.status, 'effective_status': row.effective_status, 'owner': row.owner,
                'scope': row.scope, 'evidence_links': row.evidence_links, 'test_results': row.test_results,
                'captured_at': row.captured_at.isoformat(), 'expires_at': row.expires_at.isoformat() if row.expires_at else None,
                'source': row.source, 'notes': row.notes}


def runtime_coverage(tenant_id):
    """Compare registered workloads with observed gateway events.

    Absence of an event is surfaced as ``unknown`` rather than represented as
    proof of enforcement. This makes onboarding gaps visible to operators and
    avoids treating inventory metadata as runtime evidence.
    """
    endpoints = list(AgentEndpoint.objects.filter(tenant_id=tenant_id).values('id', 'agent_id', 'status'))
    observed_rows = Event.objects.filter(
        tenant_id=tenant_id, endpoint_id__isnull=False,
    ).values('endpoint_id').annotate(last_observed_at=Max('occurred_at'))
    observed = {row['endpoint_id']: row['last_observed_at'] for row in observed_rows}
    rows = []
    for endpoint in endpoints:
        endpoint_id = endpoint['id']
        rows.append({
            'agent_id': endpoint['agent_id'],
            'endpoint_id': str(endpoint_id),
            'status': 'observed' if endpoint_id in observed else 'unknown',
            'registered_status': endpoint['status'],
            'last_observed_at': observed.get(endpoint_id).isoformat() if observed.get(endpoint_id) else None,
        })
    return {
        'registered_workloads': len(endpoints),
        'observed_workloads': sum(item['status'] == 'observed' for item in rows),
        'unobserved_workloads': sum(item['status'] == 'unknown' for item in rows),
        'coverage_as_of': max((item['last_observed_at'] for item in rows if item['last_observed_at']), default=None),
        'workloads': rows,
    }
