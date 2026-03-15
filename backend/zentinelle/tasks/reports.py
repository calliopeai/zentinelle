"""
Celery task for async compliance report generation.
"""
import logging
import os
import tempfile

from celery import shared_task

logger = logging.getLogger(__name__)

CONTROL_COVERAGE_HEADERS = [
    'control_name', 'policy_type', 'required_enforcement', 'actual_enforcement', 'status',
]
VIOLATION_SUMMARY_HEADERS = ['date', 'policy_type', 'violation_count', 'warn_count']
AUDIT_TRAIL_HEADERS = [
    'id', 'tenant_id', 'action', 'resource_type', 'resource_id',
    'resource_name', 'ext_user_id', 'ip_address', 'timestamp', 'chain_sequence',
]


@shared_task(name='zentinelle.generate_report')
def generate_report(report_id: int) -> None:
    """Async report generation task."""
    from django.utils import timezone
    from zentinelle.models import Report
    from zentinelle.services.report_generator import (
        generate_control_coverage,
        generate_violation_summary,
        generate_audit_trail,
        rows_to_csv,
    )

    try:
        report = Report.objects.get(id=report_id)
    except Report.DoesNotExist:
        logger.error("generate_report: Report %s not found", report_id)
        return

    report.status = Report.Status.GENERATING
    report.save(update_fields=['status'])

    try:
        fmt = report.format or 'csv'
        params = report.params or {}
        content = None
        suffix = f'.{fmt}' if fmt != 'pdf' else '.html'  # pdf rendered as HTML for now

        if report.report_type == Report.ReportType.CONTROL_COVERAGE:
            pack_name = params.get('pack_name', '')
            if not pack_name:
                raise ValueError("params.pack_name is required for control_coverage reports")
            result = generate_control_coverage(report.tenant_id, pack_name, format=fmt)
            if fmt in ('pdf',):
                # HTML string
                content = result.encode('utf-8')
                suffix = '.html'
            else:
                content = rows_to_csv(CONTROL_COVERAGE_HEADERS, result).encode('utf-8')
                suffix = '.csv'

        elif report.report_type == Report.ReportType.VIOLATION_SUMMARY:
            from datetime import datetime
            date_from_str = params.get('date_from')
            date_to_str = params.get('date_to')
            if not date_from_str or not date_to_str:
                raise ValueError("params.date_from and params.date_to are required for violation_summary")
            date_from = datetime.fromisoformat(date_from_str)
            date_to = datetime.fromisoformat(date_to_str)
            result = generate_violation_summary(report.tenant_id, date_from, date_to, format=fmt)
            if fmt in ('pdf',):
                content = result.encode('utf-8')
                suffix = '.html'
            else:
                content = rows_to_csv(VIOLATION_SUMMARY_HEADERS, result).encode('utf-8')
                suffix = '.csv'

        elif report.report_type == Report.ReportType.AUDIT_TRAIL:
            from datetime import datetime
            date_from_str = params.get('date_from')
            date_to_str = params.get('date_to')
            if not date_from_str or not date_to_str:
                raise ValueError("params.date_from and params.date_to are required for audit_trail")
            date_from = datetime.fromisoformat(date_from_str)
            date_to = datetime.fromisoformat(date_to_str)
            result = generate_audit_trail(report.tenant_id, date_from, date_to, format=fmt)
            if fmt == 'ndjson':
                content = result.encode('utf-8')
                suffix = '.ndjson'
            elif fmt in ('pdf',):
                # Build a simple HTML for audit trail
                content = result.encode('utf-8')
                suffix = '.html'
            else:
                content = rows_to_csv(AUDIT_TRAIL_HEADERS, result).encode('utf-8')
                suffix = '.csv'
        else:
            raise ValueError(f"Unknown report_type: {report.report_type}")

        # Save to a temp file
        fd, file_path = tempfile.mkstemp(
            prefix=f'zentinelle_report_{report.id}_',
            suffix=suffix,
        )
        try:
            os.write(fd, content)
        finally:
            os.close(fd)

        report.file_path = file_path
        report.status = Report.Status.COMPLETE
        report.completed_at = timezone.now()
        report.save(update_fields=['file_path', 'status', 'completed_at'])

        logger.info(
            "Report %s (%s) generated for tenant=%s, path=%s",
            report_id,
            report.report_type,
            report.tenant_id,
            file_path,
        )

    except Exception as exc:
        logger.exception("Report %s generation failed: %s", report_id, exc)
        report.status = Report.Status.FAILED
        report.error_message = str(exc)[:500]
        report.save(update_fields=['status', 'error_message'])
