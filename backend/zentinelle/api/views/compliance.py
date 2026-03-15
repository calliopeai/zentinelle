"""
Compliance & Content Scanning API endpoints.

POST /api/zentinelle/v1/scan - Scan content (real-time)
POST /api/zentinelle/v1/scan/async - Queue content for async scanning
GET  /api/zentinelle/v1/scan/{scan_id} - Get scan result
GET  /api/zentinelle/v1/violations - List violations
GET  /api/zentinelle/v1/alerts - List compliance alerts
POST /api/zentinelle/v1/alerts/{alert_id}/acknowledge - Acknowledge alert
POST /api/zentinelle/v1/alerts/{alert_id}/resolve - Resolve alert
POST /api/zentinelle/v1/interaction - Log an interaction

Export endpoints:
GET /api/zentinelle/v1/export/violations.csv - Export violations as CSV
GET /api/zentinelle/v1/export/compliance-report.csv - Export assessments as CSV
GET /api/zentinelle/v1/export/summary.json - Export JSON compliance summary
"""
import csv
import io
import json
import logging
from datetime import timedelta
from collections import defaultdict

from django.http import StreamingHttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from zentinelle.models import (
    ContentRule,
    ContentScan,
    ContentViolation,
    ComplianceAlert,
    ComplianceAssessment,
    InteractionLog,
)
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_endpoint_from_request, get_tenant_id_from_request
from zentinelle.services.content_scanner import ContentScanner

logger = logging.getLogger(__name__)


class ScanContentView(APIView):
    """
    Scan content for policy violations.

    POST /api/zentinelle/v1/scan

    This is used for real-time scanning before content is sent to AI.
    Returns immediately with scan results and action to take.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Scan content and return results.

        Request body:
        {
            "content": "User's prompt text",
            "user_id": "username",
            "content_type": "user_input",  // optional, default: user_input
            "session_id": "...",           // optional
            "request_id": "...",           // optional
            "token_count": 150,            // optional
            "estimated_cost": 0.0015,      // optional
            "metadata": {}                 // optional
        }

        Response:
        {
            "allowed": true/false,
            "action": "allow" | "block" | "warn" | "redact",
            "scan_id": "uuid",
            "violations": [...],
            "redacted_content": "...",  // if action == "redact"
            "warnings": [...],
            "scan_duration_ms": 15
        }
        """
        # Validate request
        content = request.data.get('content')
        if not content:
            return Response(
                {'error': 'content is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user_id = request.data.get('user_id', 'anonymous')
        content_type = request.data.get('content_type', ContentScan.ContentType.USER_INPUT)

        # Get endpoint
        endpoint = get_endpoint_from_request(request)

        # Create scanner
        scanner = ContentScanner(endpoint.tenant_id)

        # Run scan
        try:
            result, scan = scanner.scan(
                content=content,
                user_id=user_id,
                endpoint=endpoint,
                content_type=content_type,
                scan_mode=ContentRule.ScanMode.REALTIME,
                session_id=request.data.get('session_id', ''),
                request_id=request.data.get('request_id', ''),
                ip_address=self._get_client_ip(request),
                token_count=request.data.get('token_count'),
                estimated_cost=request.data.get('estimated_cost'),
            )
        except Exception as e:
            logger.error(f"Scan failed: {e}")
            return Response(
                {'error': 'Scan failed', 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Build response
        response_data = {
            'allowed': result.action != 'block',
            'action': result.action,
            'scan_id': str(scan.id),
            'has_violations': result.has_violations,
            'violation_count': len(result.violations),
            'max_severity': result.max_severity,
            'scan_duration_ms': result.scan_duration_ms,
        }

        if result.violations:
            response_data['violations'] = [
                {
                    'type': v.rule_type,
                    'severity': v.severity,
                    'category': v.category,
                    'confidence': v.confidence,
                }
                for v in result.violations
            ]

        if result.action == 'redact' and result.redacted_content:
            response_data['redacted_content'] = result.redacted_content

        if result.action == 'warn':
            response_data['warnings'] = [
                f"{v.rule_type}: {v.category}" for v in result.violations
            ]

        return Response(response_data, status=status.HTTP_200_OK)

    def _get_client_ip(self, request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')


class AsyncScanView(APIView):
    """
    Queue content for async scanning.

    POST /api/zentinelle/v1/scan/async

    Use this for non-blocking scanning where results are
    analyzed after the fact (e.g., for AI responses).
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Queue content for async scanning.

        Returns immediately with a scan_id that can be used
        to retrieve results later.
        """
        content = request.data.get('content')
        if not content:
            return Response(
                {'error': 'content is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user_id = request.data.get('user_id', 'anonymous')
        content_type = request.data.get('content_type', ContentScan.ContentType.USER_INPUT)
        endpoint = get_endpoint_from_request(request)

        # Create pending scan record
        import hashlib
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        scan = ContentScan.objects.create(
            tenant_id=endpoint.tenant_id,
            endpoint=endpoint,
            deployment_id_ext=endpoint.deployment_id_ext if endpoint else "",
            user_identifier=user_id,
            content_type=content_type,
            content_hash=content_hash,
            content_length=len(content),
            content_preview=content[:500],
            content_stored=True,
            scan_mode=ContentRule.ScanMode.ASYNC,
            status=ContentScan.ScanStatus.PENDING,
            session_id=request.data.get('session_id', ''),
            request_id=request.data.get('request_id', ''),
            token_count=request.data.get('token_count'),
            estimated_cost_usd=request.data.get('estimated_cost'),
        )

        # Queue for async processing
        from zentinelle.tasks.compliance import process_async_scan
        try:
            process_async_scan.delay(str(scan.id), content)
        except Exception as e:
            logger.warning(f"Failed to queue async scan: {e}")

        return Response({
            'scan_id': str(scan.id),
            'status': 'queued',
        }, status=status.HTTP_202_ACCEPTED)


class ScanResultView(APIView):
    """
    Get scan result by ID.

    GET /api/zentinelle/v1/scan/{scan_id}
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, scan_id):
        endpoint = get_endpoint_from_request(request)

        try:
            scan = ContentScan.objects.get(
                id=scan_id,
                tenant_id=endpoint.tenant_id
            )
        except ContentScan.DoesNotExist:
            return Response(
                {'error': 'Scan not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        violations = ContentViolation.objects.filter(scan=scan)

        response_data = {
            'scan_id': str(scan.id),
            'status': scan.status,
            'content_type': scan.content_type,
            'content_length': scan.content_length,
            'has_violations': scan.has_violations,
            'violation_count': scan.violation_count,
            'max_severity': scan.max_severity,
            'action_taken': scan.action_taken,
            'was_blocked': scan.was_blocked,
            'was_redacted': scan.was_redacted,
            'scan_duration_ms': scan.scan_duration_ms,
            'scanned_at': scan.scanned_at.isoformat() if scan.scanned_at else None,
            'created_at': scan.created_at.isoformat(),
        }

        if violations.exists():
            response_data['violations'] = [
                {
                    'id': str(v.id),
                    'rule_type': v.rule_type,
                    'severity': v.severity,
                    'category': v.category,
                    'confidence': v.confidence,
                    'enforcement': v.enforcement,
                    'was_blocked': v.was_blocked,
                    'was_redacted': v.was_redacted,
                }
                for v in violations
            ]

        return Response(response_data, status=status.HTTP_200_OK)


class ViolationsListView(APIView):
    """
    List violations for the organization.

    GET /api/zentinelle/v1/violations

    Query params:
        - user_id: Filter by user
        - rule_type: Filter by rule type
        - severity: Filter by severity
        - from_date: Start date
        - to_date: End date
        - limit: Max results (default 100)
        - offset: Pagination offset
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        endpoint = get_endpoint_from_request(request)

        # Build query
        queryset = ContentViolation.objects.filter(
            scan__tenant_id=endpoint.tenant_id
        ).select_related('scan', 'rule')

        # Apply filters
        user_id = request.query_params.get('user_id')
        if user_id:
            queryset = queryset.filter(scan__user_identifier=user_id)

        rule_type = request.query_params.get('rule_type')
        if rule_type:
            queryset = queryset.filter(rule_type=rule_type)

        severity = request.query_params.get('severity')
        if severity:
            queryset = queryset.filter(severity=severity)

        from_date = request.query_params.get('from_date')
        if from_date:
            queryset = queryset.filter(created_at__gte=from_date)

        to_date = request.query_params.get('to_date')
        if to_date:
            queryset = queryset.filter(created_at__lte=to_date)

        # Pagination
        limit = min(int(request.query_params.get('limit', 100)), 1000)
        offset = int(request.query_params.get('offset', 0))

        total = queryset.count()
        violations = queryset.order_by('-created_at')[offset:offset + limit]

        return Response({
            'total': total,
            'limit': limit,
            'offset': offset,
            'violations': [
                {
                    'id': str(v.id),
                    'scan_id': str(v.scan_id),
                    'user_identifier': v.scan.user_identifier,
                    'rule_type': v.rule_type,
                    'severity': v.severity,
                    'category': v.category,
                    'enforcement': v.enforcement,
                    'confidence': v.confidence,
                    'was_blocked': v.was_blocked,
                    'was_redacted': v.was_redacted,
                    'created_at': v.created_at.isoformat(),
                }
                for v in violations
            ]
        }, status=status.HTTP_200_OK)


class AlertsListView(APIView):
    """
    List compliance alerts.

    GET /api/zentinelle/v1/alerts

    Query params:
        - status: Filter by status (open, acknowledged, resolved, etc.)
        - severity: Filter by severity
        - user_id: Filter by user
        - limit: Max results
        - offset: Pagination offset
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        endpoint = get_endpoint_from_request(request)

        queryset = ComplianceAlert.objects.filter(
            tenant_id=endpoint.tenant_id
        )

        # Apply filters
        alert_status = request.query_params.get('status')
        if alert_status:
            queryset = queryset.filter(status=alert_status)

        severity = request.query_params.get('severity')
        if severity:
            queryset = queryset.filter(severity=severity)

        user_id = request.query_params.get('user_id')
        if user_id:
            queryset = queryset.filter(user_identifier=user_id)

        # Pagination
        limit = min(int(request.query_params.get('limit', 50)), 500)
        offset = int(request.query_params.get('offset', 0))

        total = queryset.count()
        alerts = queryset.order_by('-created_at')[offset:offset + limit]

        return Response({
            'total': total,
            'limit': limit,
            'offset': offset,
            'alerts': [
                {
                    'id': str(a.id),
                    'alert_type': a.alert_type,
                    'severity': a.severity,
                    'title': a.title,
                    'description': a.description,
                    'user_identifier': a.user_identifier,
                    'status': a.status,
                    'violation_count': a.violation_count,
                    'first_violation_at': a.first_violation_at.isoformat(),
                    'last_violation_at': a.last_violation_at.isoformat(),
                    'created_at': a.created_at.isoformat(),
                }
                for a in alerts
            ]
        }, status=status.HTTP_200_OK)


class AcknowledgeAlertView(APIView):
    """
    Acknowledge a compliance alert.

    POST /api/zentinelle/v1/alerts/{alert_id}/acknowledge
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, alert_id):
        endpoint = get_endpoint_from_request(request)

        try:
            alert = ComplianceAlert.objects.get(
                id=alert_id,
                tenant_id=endpoint.tenant_id
            )
        except ComplianceAlert.DoesNotExist:
            return Response(
                {'error': 'Alert not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if alert.status != ComplianceAlert.Status.OPEN:
            return Response(
                {'error': f'Alert is already {alert.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.utils import timezone
        alert.status = ComplianceAlert.Status.ACKNOWLEDGED
        alert.acknowledged_at = timezone.now()
        # Note: In real implementation, would get user from auth context
        alert.save()

        return Response({
            'alert_id': str(alert.id),
            'status': alert.status,
            'acknowledged_at': alert.acknowledged_at.isoformat(),
        }, status=status.HTTP_200_OK)


class ResolveAlertView(APIView):
    """
    Resolve a compliance alert.

    POST /api/zentinelle/v1/alerts/{alert_id}/resolve

    Request body:
    {
        "resolution_notes": "Investigated and determined to be false positive",
        "false_positive": false  // optional, marks as false positive
    }
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, alert_id):
        endpoint = get_endpoint_from_request(request)

        try:
            alert = ComplianceAlert.objects.get(
                id=alert_id,
                tenant_id=endpoint.tenant_id
            )
        except ComplianceAlert.DoesNotExist:
            return Response(
                {'error': 'Alert not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        if alert.status == ComplianceAlert.Status.RESOLVED:
            return Response(
                {'error': 'Alert is already resolved'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.utils import timezone

        is_false_positive = request.data.get('false_positive', False)
        alert.status = ComplianceAlert.Status.FALSE_POSITIVE if is_false_positive else ComplianceAlert.Status.RESOLVED
        alert.resolved_at = timezone.now()
        alert.resolution_notes = request.data.get('resolution_notes', '')
        alert.save()

        return Response({
            'alert_id': str(alert.id),
            'status': alert.status,
            'resolved_at': alert.resolved_at.isoformat(),
        }, status=status.HTTP_200_OK)


class LogInteractionView(APIView):
    """
    Log a complete AI interaction for audit purposes.

    POST /api/zentinelle/v1/interaction

    This is called after an AI interaction completes to log
    the full request/response for audit and analysis.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Log an AI interaction.

        Request body:
        {
            "user_id": "username",
            "interaction_type": "chat",
            "session_id": "...",
            "request_id": "...",
            "ai_provider": "openai",
            "ai_model": "gpt-4",
            "input_content": "User's prompt",
            "input_token_count": 150,
            "output_content": "AI's response",
            "output_token_count": 500,
            "system_prompt": "...",  // optional
            "tool_calls": [...],     // optional
            "latency_ms": 1200,
            "estimated_cost_usd": 0.05,
            "occurred_at": "2024-01-15T10:30:00Z"
        }
        """
        endpoint = get_endpoint_from_request(request)

        from django.utils import timezone
        from django.utils.dateparse import parse_datetime

        occurred_at = request.data.get('occurred_at')
        if occurred_at:
            occurred_at = parse_datetime(occurred_at) or timezone.now()
        else:
            occurred_at = timezone.now()

        interaction = InteractionLog.objects.create(
            tenant_id=endpoint.tenant_id,
            endpoint=endpoint,
            deployment_id_ext=endpoint.deployment_id_ext,
            user_identifier=request.data.get('user_id', 'anonymous'),
            interaction_type=request.data.get('interaction_type', InteractionLog.InteractionType.CHAT),
            session_id=request.data.get('session_id', ''),
            request_id=request.data.get('request_id', ''),
            ai_provider=request.data.get('ai_provider', ''),
            ai_model=request.data.get('ai_model', ''),
            input_content=request.data.get('input_content', ''),
            input_token_count=request.data.get('input_token_count'),
            output_content=request.data.get('output_content', ''),
            output_token_count=request.data.get('output_token_count'),
            system_prompt=request.data.get('system_prompt', ''),
            tool_calls=request.data.get('tool_calls', []),
            latency_ms=request.data.get('latency_ms'),
            total_tokens=(request.data.get('input_token_count') or 0) + (request.data.get('output_token_count') or 0),
            estimated_cost_usd=request.data.get('estimated_cost_usd'),
            ip_address=self._get_client_ip(request),
            occurred_at=occurred_at,
        )

        # Queue async scanning of the input/output
        from zentinelle.tasks.compliance import scan_interaction
        try:
            scan_interaction.delay(str(interaction.id))
        except Exception as e:
            logger.warning(f"Failed to queue interaction scan: {e}")

        return Response({
            'interaction_id': str(interaction.id),
            'status': 'logged',
        }, status=status.HTTP_201_CREATED)

    def _get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')


# ---------------------------------------------------------------------------
# Export Views
# ---------------------------------------------------------------------------

def _parse_date_range(request, default_days=30):
    """
    Parse start/end query params as aware datetimes.

    Returns (start_dt, end_dt) tuple.
    """
    now = timezone.now()
    default_start = now - timedelta(days=default_days)

    raw_start = request.query_params.get('start')
    raw_end = request.query_params.get('end')

    start_dt = parse_datetime(raw_start) if raw_start else default_start
    end_dt = parse_datetime(raw_end) if raw_end else now

    # Fallback to defaults on bad parse
    if start_dt is None:
        start_dt = default_start
    if end_dt is None:
        end_dt = now

    # Make aware if naive
    if timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt)
    if timezone.is_naive(end_dt):
        end_dt = timezone.make_aware(end_dt)

    return start_dt, end_dt


class ExportViolationsCSVView(APIView):
    """
    Export violations as a streaming CSV download.

    GET /api/zentinelle/v1/export/violations.csv

    Query params:
        - start: ISO8601 datetime (default: 30 days ago)
        - end:   ISO8601 datetime (default: now)
        - severity: low|medium|high|critical (optional)
        - rule_type: filter by rule type (optional)
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = get_tenant_id_from_request(request)
        if not tenant_id:
            return Response(
                {'error': 'Unable to determine tenant'},
                status=status.HTTP_403_FORBIDDEN,
            )

        start_dt, end_dt = _parse_date_range(request)

        queryset = (
            ContentViolation.objects
            .filter(
                scan__tenant_id=tenant_id,
                created_at__gte=start_dt,
                created_at__lte=end_dt,
            )
            .select_related('scan')
            .order_by('created_at')
        )

        severity = request.query_params.get('severity')
        if severity:
            queryset = queryset.filter(severity=severity)

        rule_type = request.query_params.get('rule_type')
        if rule_type:
            queryset = queryset.filter(rule_type=rule_type)

        start_str = start_dt.date().isoformat()
        end_str = end_dt.date().isoformat()
        filename = f"violations-{start_str}-{end_str}.csv"

        def generate_rows():
            buf = io.StringIO()
            writer = csv.writer(buf)

            # Header
            writer.writerow([
                'id',
                'timestamp',
                'rule_type',
                'severity',
                'matched_text',
                'enforcement_action',
                'scan_id',
                'endpoint_id',
                'user_identifier',
                'session_id',
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

            for v in queryset.iterator(chunk_size=500):
                matched_text = (v.matched_text or '')[:100]
                endpoint_id = str(v.scan.endpoint_id) if v.scan.endpoint_id else ''
                writer.writerow([
                    str(v.id),
                    v.created_at.isoformat(),
                    v.rule_type,
                    v.severity,
                    matched_text,
                    v.enforcement,
                    str(v.scan_id),
                    endpoint_id,
                    v.scan.user_identifier,
                    v.scan.session_id,
                ])
                yield buf.getvalue()
                buf.seek(0)
                buf.truncate(0)

        response = StreamingHttpResponse(generate_rows(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class ExportComplianceReportCSVView(APIView):
    """
    Export ComplianceAssessment records as a streaming CSV download.

    GET /api/zentinelle/v1/export/compliance-report.csv

    Query params:
        - start:     ISO8601 datetime (default: 30 days ago)
        - end:       ISO8601 datetime (default: now)
        - framework: filter by framework slug (optional)
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = get_tenant_id_from_request(request)
        if not tenant_id:
            return Response(
                {'error': 'Unable to determine tenant'},
                status=status.HTTP_403_FORBIDDEN,
            )

        start_dt, end_dt = _parse_date_range(request)

        queryset = (
            ComplianceAssessment.objects
            .filter(
                tenant_id=tenant_id,
                assessed_at__gte=start_dt,
                assessed_at__lte=end_dt,
            )
            .order_by('assessed_at')
        )

        framework = request.query_params.get('framework')
        if framework:
            queryset = queryset.filter(framework_id=framework)

        start_str = start_dt.date().isoformat()
        end_str = end_dt.date().isoformat()
        filename = f"compliance-report-{start_str}-{end_str}.csv"

        def generate_rows():
            buf = io.StringIO()
            writer = csv.writer(buf)

            writer.writerow([
                'id',
                'assessed_at',
                'framework',
                'coverage_percent',
                'gaps_count',
                'overall_score',
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

            for a in queryset.iterator(chunk_size=500):
                # Derive per-framework coverage_percent from framework_scores if available
                fw_scores = a.framework_scores or {}
                if framework and framework in fw_scores:
                    fw_data = fw_scores[framework]
                    coverage_pct = fw_data.get('score', a.overall_score)
                    gaps_count = fw_data.get('gaps', a.total_gaps)
                else:
                    coverage_pct = a.overall_score
                    gaps_count = a.total_gaps

                writer.writerow([
                    str(a.id),
                    a.assessed_at.isoformat(),
                    a.framework_id or 'all',
                    round(coverage_pct, 2),
                    gaps_count,
                    round(a.overall_score, 2),
                ])
                yield buf.getvalue()
                buf.seek(0)
                buf.truncate(0)

        response = StreamingHttpResponse(generate_rows(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class ComplianceReportSummaryView(APIView):
    """
    Return a JSON compliance summary suitable for embedding in reports.

    GET /api/zentinelle/v1/export/summary.json

    Query params:
        - start: ISO8601 datetime (default: 30 days ago)
        - end:   ISO8601 datetime (default: now)
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant_id = get_tenant_id_from_request(request)
        if not tenant_id:
            return Response(
                {'error': 'Unable to determine tenant'},
                status=status.HTTP_403_FORBIDDEN,
            )

        start_dt, end_dt = _parse_date_range(request)

        # --- Violations ---
        violations_qs = ContentViolation.objects.filter(
            scan__tenant_id=tenant_id,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        ).select_related('scan')

        by_severity = defaultdict(int)
        by_rule_type = defaultdict(int)
        endpoint_counts = defaultdict(int)
        rule_counts = defaultdict(int)

        for v in violations_qs.iterator(chunk_size=1000):
            by_severity[v.severity] += 1
            by_rule_type[v.rule_type] += 1
            if v.scan.endpoint_id:
                endpoint_counts[str(v.scan.endpoint_id)] += 1
            rule_counts[v.rule_type] += 1

        violations_total = sum(by_severity.values())

        # --- Scans ---
        scans_qs = ContentScan.objects.filter(
            tenant_id=tenant_id,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
        )
        scans_total = scans_qs.count()
        scans_blocked = scans_qs.filter(was_blocked=True).count()
        scans_warned = scans_qs.filter(
            action_taken=ContentRule.Enforcement.WARN,
            was_blocked=False,
        ).count()
        scans_passed = scans_qs.filter(has_violations=False).count()

        # --- Compliance assessments ---
        assessments_qs = ComplianceAssessment.objects.filter(
            tenant_id=tenant_id,
            assessed_at__gte=start_dt,
            assessed_at__lte=end_dt,
        ).order_by('-assessed_at')

        latest = assessments_qs.first()
        overall_score = round(latest.overall_score, 2) if latest else None

        frameworks_list = []
        if latest and latest.framework_scores:
            for fw_id, fw_data in latest.framework_scores.items():
                frameworks_list.append({
                    'framework': fw_id,
                    'score': round(fw_data.get('score', 0), 2),
                    'covered': fw_data.get('covered', 0),
                    'total': fw_data.get('total', 0),
                    'gaps': fw_data.get('gaps', 0),
                })

        # Top endpoints by violation count (top 10)
        top_endpoints = sorted(
            [{'endpoint_id': eid, 'violation_count': cnt} for eid, cnt in endpoint_counts.items()],
            key=lambda x: x['violation_count'],
            reverse=True,
        )[:10]

        # Top violated rules (top 10)
        top_rules = sorted(
            [{'rule_type': rt, 'violation_count': cnt} for rt, cnt in rule_counts.items()],
            key=lambda x: x['violation_count'],
            reverse=True,
        )[:10]

        summary = {
            'generated_at': timezone.now().isoformat(),
            'period': {
                'start': start_dt.isoformat(),
                'end': end_dt.isoformat(),
            },
            'tenant_id': tenant_id,
            'violations': {
                'total': violations_total,
                'by_severity': dict(by_severity),
                'by_rule_type': dict(by_rule_type),
            },
            'scans': {
                'total': scans_total,
                'blocked': scans_blocked,
                'warned': scans_warned,
                'passed': scans_passed,
            },
            'compliance': {
                'frameworks': frameworks_list,
                'overall_score': overall_score,
            },
            'top_endpoints': top_endpoints,
            'top_violated_rules': top_rules,
        }

        return Response(summary, status=status.HTTP_200_OK)
