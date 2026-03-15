"""
SIEM export endpoint for AuditLog records.

GET /api/zentinelle/v1/audit/export/

Query params:
    from    ISO date or datetime (required)
    to      ISO date or datetime (required)
    format  ndjson | csv | cef  (default: ndjson)

Streams audit log records in the requested format. Large exports are
streamed using StreamingHttpResponse so the process does not buffer the
full result set in memory.
"""
import csv
import io
import json
import logging

from django.http import StreamingHttpResponse
from django.utils.dateparse import parse_datetime, parse_date
from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from zentinelle.models import AuditLog
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_tenant_id_from_request

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers: format-specific streaming generators
# ---------------------------------------------------------------------------

def _stream_ndjson(queryset):
    """Yield one JSON-encoded line per AuditLog record."""
    for record in queryset.iterator(chunk_size=500):
        yield json.dumps({
            'id': str(record.id),
            'tenant_id': record.tenant_id,
            'action': record.action,
            'timestamp': record.timestamp.isoformat(),
            'ext_user_id': record.ext_user_id,
            'resource_type': record.resource_type,
            'resource_id': record.resource_id,
            'chain_sequence': record.chain_sequence,
            'entry_hash': record.entry_hash,
        }) + '\n'


_CSV_FIELDS = [
    'id',
    'tenant_id',
    'action',
    'timestamp',
    'ext_user_id',
    'resource_type',
    'resource_id',
    'chain_sequence',
    'entry_hash',
]


def _stream_csv(queryset):
    """Yield CSV rows (header first, then one row per AuditLog record)."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_CSV_FIELDS)

    # Header
    writer.writeheader()
    yield buf.getvalue()
    buf.truncate(0)
    buf.seek(0)

    for record in queryset.iterator(chunk_size=500):
        writer.writerow({
            'id': str(record.id),
            'tenant_id': record.tenant_id,
            'action': record.action,
            'timestamp': record.timestamp.isoformat(),
            'ext_user_id': record.ext_user_id,
            'resource_type': record.resource_type,
            'resource_id': record.resource_id,
            'chain_sequence': record.chain_sequence,
            'entry_hash': record.entry_hash,
        })
        yield buf.getvalue()
        buf.truncate(0)
        buf.seek(0)


def _stream_cef(queryset):
    """Yield one CEF-formatted line per AuditLog record."""
    for record in queryset.iterator(chunk_size=500):
        line = (
            'CEF:0|Zentinelle|AuditLog|1.0'
            '|{action}|{action}|5'
            '|tenant={tenant_id} user={ext_user_id}'
            ' resource={resource_type}/{resource_id}'
            ' ts={timestamp}\n'
        ).format(
            action=record.action,
            tenant_id=record.tenant_id,
            ext_user_id=record.ext_user_id,
            resource_type=record.resource_type,
            resource_id=record.resource_id,
            timestamp=record.timestamp.isoformat(),
        )
        yield line


# ---------------------------------------------------------------------------
# View
# ---------------------------------------------------------------------------

class AuditExportView(APIView):
    """
    Stream AuditLog records for a tenant in NDJSON, CSV, or CEF format.

    GET /api/zentinelle/v1/audit/export/

    Query params:
        from    ISO date or datetime (required) — inclusive lower bound on timestamp
        to      ISO date or datetime (required) — inclusive upper bound on timestamp
        format  ndjson | csv | cef  (default: ndjson)
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = get_tenant_id_from_request(request)
        if not tenant_id:
            return Response({'error': 'Could not resolve tenant'}, status=401)

        # Parse required date range params
        from_raw = request.query_params.get('from')
        to_raw = request.query_params.get('to')

        if not from_raw or not to_raw:
            return Response(
                {'error': "'from' and 'to' query parameters are required"},
                status=400,
            )

        from_dt = self._parse_dt(from_raw)
        to_dt = self._parse_dt(to_raw)

        if from_dt is None:
            return Response({'error': f"Invalid 'from' value: {from_raw!r}"}, status=400)
        if to_dt is None:
            return Response({'error': f"Invalid 'to' value: {to_raw!r}"}, status=400)

        fmt = request.query_params.get('format', 'ndjson').lower()
        if fmt not in ('ndjson', 'csv', 'cef'):
            return Response(
                {'error': f"Unsupported format {fmt!r}. Choose from: ndjson, csv, cef"},
                status=400,
            )

        queryset = (
            AuditLog.objects
            .filter(
                tenant_id=tenant_id,
                timestamp__gte=from_dt,
                timestamp__lte=to_dt,
            )
            .order_by('timestamp')
        )

        if fmt == 'ndjson':
            streaming_gen = _stream_ndjson(queryset)
            content_type = 'application/x-ndjson'
        elif fmt == 'csv':
            streaming_gen = _stream_csv(queryset)
            content_type = 'text/csv'
        else:  # cef
            streaming_gen = _stream_cef(queryset)
            content_type = 'text/plain'

        response = StreamingHttpResponse(streaming_gen, content_type=content_type)
        if fmt == 'csv':
            response['Content-Disposition'] = 'attachment; filename="audit_export.csv"'
        return response

    @staticmethod
    def _parse_dt(value: str):
        """
        Parse an ISO date or datetime string into an aware datetime.

        Accepts:
        - "2024-01-15" (date) — treated as midnight UTC
        - "2024-01-15T00:00:00Z" (datetime)
        - "2024-01-15T00:00:00+00:00" (datetime with offset)
        """
        # Try datetime first
        dt = parse_datetime(value)
        if dt is not None:
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt)
            return dt

        # Try date
        d = parse_date(value)
        if d is not None:
            from datetime import datetime
            return timezone.make_aware(datetime(d.year, d.month, d.day))

        return None
