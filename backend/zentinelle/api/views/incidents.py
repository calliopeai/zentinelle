"""
Incident Management API endpoints.

GET  /api/zentinelle/v1/incidents/           — list incidents (filterable)
POST /api/zentinelle/v1/incidents/           — create a manual incident
GET  /api/zentinelle/v1/incidents/{id}/      — incident detail (with comments)
PATCH /api/zentinelle/v1/incidents/{id}/     — update status / assignee
POST /api/zentinelle/v1/incidents/{id}/comments/ — add a comment
"""
import logging

from django.utils import timezone

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from zentinelle.models import Incident, IncidentComment
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_tenant_id_from_request

logger = logging.getLogger(__name__)

try:
    from zentinelle.tasks.notifications import send_incident_notification
except Exception:  # pragma: no cover
    send_incident_notification = None  # type: ignore[assignment]

_VALID_STATUSES = {s.value for s in Incident.Status}
_VALID_SEVERITIES = {s.value for s in Incident.Severity}
_VALID_SOURCES = {s.value for s in Incident.Source}


def _serialize_comment(comment) -> dict:
    return {
        'id': comment.id,
        'author_id': comment.author_id,
        'body': comment.body,
        'created_at': comment.created_at.isoformat() if comment.created_at else None,
    }


def _serialize_incident(incident, include_comments: bool = False) -> dict:
    data = {
        'id': str(incident.id),
        'tenant_id': incident.tenant_id,
        'title': incident.title,
        'description': incident.description,
        'severity': incident.severity,
        'status': incident.status,
        'source': incident.source,
        'source_ref': incident.source_ref,
        'assignee_id': incident.assignee_id,
        'created_at': incident.created_at.isoformat() if incident.created_at else None,
        'updated_at': incident.updated_at.isoformat() if incident.updated_at else None,
        'resolved_at': incident.resolved_at.isoformat() if incident.resolved_at else None,
    }
    if include_comments:
        data['comments'] = [_serialize_comment(c) for c in incident.comments.all()]
    return data


class IncidentListView(APIView):
    """
    GET  /api/zentinelle/v1/incidents/ — list incidents for the tenant.
    POST /api/zentinelle/v1/incidents/ — create a manual incident.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = get_tenant_id_from_request(request)
        qs = Incident.objects.filter(tenant_id=tenant_id)

        # Optional filters
        filter_status = request.query_params.get('status')
        filter_severity = request.query_params.get('severity')

        if filter_status:
            qs = qs.filter(status=filter_status)
        if filter_severity:
            qs = qs.filter(severity=filter_severity)

        count = qs.count()
        results = [_serialize_incident(i) for i in qs]

        return Response({'count': count, 'results': results}, status=status.HTTP_200_OK)

    def post(self, request):
        tenant_id = get_tenant_id_from_request(request)
        data = request.data

        title = data.get('title', '').strip()
        if not title:
            return Response({'detail': '"title" is required.'}, status=status.HTTP_400_BAD_REQUEST)

        incident_severity = data.get('severity', Incident.Severity.MEDIUM)
        incident_source = data.get('source', Incident.Source.MANUAL)

        if incident_severity not in _VALID_SEVERITIES:
            return Response(
                {'detail': f'Invalid severity. Valid values: {sorted(_VALID_SEVERITIES)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if incident_source not in _VALID_SOURCES:
            return Response(
                {'detail': f'Invalid source. Valid values: {sorted(_VALID_SOURCES)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        incident = Incident.objects.create(
            tenant_id=tenant_id,
            title=title,
            description=data.get('description', ''),
            severity=incident_severity,
            status=Incident.Status.OPEN,
            source=incident_source,
        )

        # Queue notification (best-effort)
        try:
            if send_incident_notification is not None:
                send_incident_notification.delay(incident.id)
        except Exception as exc:
            logger.warning("Failed to queue notification for incident %s: %s", incident.id, exc)

        return Response(_serialize_incident(incident), status=status.HTTP_201_CREATED)


class IncidentDetailView(APIView):
    """
    GET   /api/zentinelle/v1/incidents/{id}/ — retrieve incident detail.
    PATCH /api/zentinelle/v1/incidents/{id}/ — update status or assignee.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def _get_incident(self, request, incident_id):
        tenant_id = get_tenant_id_from_request(request)
        try:
            return Incident.objects.prefetch_related('comments').get(
                pk=incident_id,
                tenant_id=tenant_id,
            )
        except (Incident.DoesNotExist, ValueError):
            return None

    def get(self, request, incident_id):
        incident = self._get_incident(request, incident_id)
        if incident is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(_serialize_incident(incident, include_comments=True), status=status.HTTP_200_OK)

    def patch(self, request, incident_id):
        incident = self._get_incident(request, incident_id)
        if incident is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        update_fields = ['updated_at']

        new_status = data.get('status')
        if new_status is not None:
            if new_status not in _VALID_STATUSES:
                return Response(
                    {'detail': f'Invalid status. Valid values: {sorted(_VALID_STATUSES)}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            incident.status = new_status
            update_fields.append('status')

            # Auto-set resolved_at when transitioning to resolved/closed
            if new_status in (Incident.Status.RESOLVED, Incident.Status.CLOSED):
                if not incident.resolved_at:
                    incident.resolved_at = timezone.now()
                    update_fields.append('resolved_at')

        new_assignee = data.get('assignee_id')
        if new_assignee is not None:
            incident.assignee_id = new_assignee
            update_fields.append('assignee_id')

        incident.save(update_fields=update_fields)

        return Response(_serialize_incident(incident, include_comments=True), status=status.HTTP_200_OK)


class IncidentCommentView(APIView):
    """
    POST /api/zentinelle/v1/incidents/{id}/comments/ — add a comment to an incident.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, incident_id):
        tenant_id = get_tenant_id_from_request(request)

        try:
            incident = Incident.objects.get(pk=incident_id, tenant_id=tenant_id)
        except (Incident.DoesNotExist, ValueError):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        body = request.data.get('body', '').strip()
        if not body:
            return Response({'detail': '"body" is required.'}, status=status.HTTP_400_BAD_REQUEST)

        author_id = request.data.get('author_id', 'system')

        comment = IncidentComment.objects.create(
            incident=incident,
            author_id=author_id,
            body=body,
        )

        return Response(_serialize_comment(comment), status=status.HTTP_201_CREATED)
