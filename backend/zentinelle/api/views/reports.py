"""
Compliance report export API views.

POST /api/zentinelle/v1/reports/           — create a report job
GET  /api/zentinelle/v1/reports/{id}/      — check job status
GET  /api/zentinelle/v1/reports/{id}/download/ — download the generated file
"""
import logging
import os

from django.http import FileResponse
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from zentinelle.models import Report
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_tenant_id_from_request

logger = logging.getLogger(__name__)

_VALID_REPORT_TYPES = {rt.value for rt in Report.ReportType}
_VALID_FORMATS = {'csv', 'pdf', 'ndjson'}

try:
    from zentinelle.tasks.reports import generate_report as generate_report_task
except Exception:  # pragma: no cover
    generate_report_task = None  # type: ignore[assignment]


def _serialize_report(report) -> dict:
    return {
        'id': report.id,
        'report_type': report.report_type,
        'status': report.status,
        'format': report.format,
        'params': report.params,
        'created_at': report.created_at.isoformat() if report.created_at else None,
        'completed_at': report.completed_at.isoformat() if report.completed_at else None,
        'error_message': report.error_message or None,
    }


class ReportCreateView(APIView):
    """
    POST /api/zentinelle/v1/reports/

    Body:
        {
            "report_type": "control_coverage" | "violation_summary" | "audit_trail",
            "params": {"pack_name": "hipaa", "date_from": "...", "date_to": "..."},
            "format": "csv"
        }

    Returns 201 {id, status: 'pending'}.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant_id = get_tenant_id_from_request(request)
        data = request.data

        report_type = data.get('report_type', '').strip()
        if not report_type:
            return Response(
                {'detail': '"report_type" is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if report_type not in _VALID_REPORT_TYPES:
            return Response(
                {'detail': f'Invalid report_type. Valid values: {sorted(_VALID_REPORT_TYPES)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        fmt = data.get('format', 'csv')
        if fmt not in _VALID_FORMATS:
            return Response(
                {'detail': f'Invalid format. Valid values: {sorted(_VALID_FORMATS)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        params = data.get('params', {})
        if not isinstance(params, dict):
            return Response(
                {'detail': '"params" must be a JSON object.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report = Report.objects.create(
            tenant_id=tenant_id,
            report_type=report_type,
            format=fmt,
            params=params,
            status=Report.Status.PENDING,
        )

        # Queue the generation task (best-effort)
        try:
            if generate_report_task is not None:
                generate_report_task.delay(report.id)
        except Exception as exc:
            logger.warning("Failed to queue generate_report for report %s: %s", report.id, exc)

        return Response(
            {'id': report.id, 'status': report.status},
            status=status.HTTP_201_CREATED,
        )


class ReportStatusView(APIView):
    """
    GET /api/zentinelle/v1/reports/{id}/

    Returns report metadata including current status.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, report_id):
        tenant_id = get_tenant_id_from_request(request)
        try:
            report = Report.objects.get(id=report_id, tenant_id=tenant_id)
        except Report.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(_serialize_report(report), status=status.HTTP_200_OK)


class ReportDownloadView(APIView):
    """
    GET /api/zentinelle/v1/reports/{id}/download/

    Returns the generated report file. Returns 409 if not yet complete.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, report_id):
        tenant_id = get_tenant_id_from_request(request)
        try:
            report = Report.objects.get(id=report_id, tenant_id=tenant_id)
        except Report.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if report.status != Report.Status.COMPLETE:
            return Response(
                {'detail': f'Report is not ready. Current status: {report.status}'},
                status=status.HTTP_409_CONFLICT,
            )

        if not report.file_path:
            return Response(
                {'detail': 'Report file not available.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not os.path.exists(report.file_path):
            return Response(
                {'detail': 'Report file not found on disk.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Determine content type
        fmt = report.format or 'csv'
        content_type_map = {
            'csv': 'text/csv',
            'pdf': 'text/html',   # HTML until weasyprint is wired up
            'ndjson': 'application/x-ndjson',
        }
        content_type = content_type_map.get(fmt, 'application/octet-stream')

        ext_map = {
            'csv': 'csv',
            'pdf': 'html',
            'ndjson': 'ndjson',
        }
        ext = ext_map.get(fmt, fmt)
        filename = f"zentinelle_report_{report.id}.{ext}"

        file_handle = open(report.file_path, 'rb')
        response = FileResponse(file_handle, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
