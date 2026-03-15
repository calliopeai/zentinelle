"""
Compliance report generation service.

Provides generators for three report types:
- control_coverage: policy coverage against a compliance pack
- violation_summary: daily violation/warn counts from AuditLog
- audit_trail: raw AuditLog export

Each generator returns:
- format='csv'   → list of row dicts
- format='ndjson' → newline-delimited JSON string (audit_trail only)
- format='pdf'   → bytes (PDF via weasyprint; falls back to HTML bytes if not installed)
"""
import csv
import io
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# PDF helper
# ---------------------------------------------------------------------------

_PDF_CSS = """
@page { margin: 2cm; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; }
h1 { font-size: 16px; margin-bottom: 4px; color: #1B2559; }
p.meta { font-size: 10px; color: #64748B; margin-bottom: 12px; }
table { border-collapse: collapse; width: 100%; margin-top: 8px; }
th { background: #1B2559; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; }
td { padding: 5px 8px; border-bottom: 1px solid #E2E8F0; font-size: 10px; }
tr:nth-child(even) td { background: #F4F7FC; }
.badge-active   { color: #059C85; font-weight: bold; }
.badge-inactive { color: #E31A1A; font-weight: bold; }
.badge-audit    { color: #FF9B05; font-weight: bold; }
"""


def _html_to_pdf(html: str) -> bytes:
    """Convert an HTML string to PDF bytes via weasyprint. Falls back to HTML bytes."""
    try:
        import weasyprint
        return weasyprint.HTML(string=html).write_pdf(
            stylesheets=[weasyprint.CSS(string=_PDF_CSS)]
        )
    except ImportError:
        logger.warning(
            'weasyprint not installed — returning HTML bytes. '
            'Install with: pip install weasyprint'
        )
        return html.encode('utf-8')
    except Exception as exc:
        logger.error('PDF generation failed: %s', exc)
        return html.encode('utf-8')


# ---------------------------------------------------------------------------
# CSV helper
# ---------------------------------------------------------------------------

def rows_to_csv(headers: list, rows: list) -> str:
    """Write a list of row dicts to a CSV string with the given header fields."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers)
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Control coverage report
# ---------------------------------------------------------------------------

def generate_control_coverage(tenant_id: str, pack_name: str, format: str = 'csv'):
    """
    For each policy in the compliance pack, check if the tenant has an active Policy
    matching by name (via Policy.objects.filter(tenant_id=tenant_id, name=policy_def['name'])).

    Returns:
        list of row dicts  — format in ('csv', 'dict')
        bytes              — format == 'pdf' (PDF via weasyprint or HTML fallback)
    """
    from zentinelle.models import Policy
    from zentinelle.services.compliance_packs import get_pack

    pack = get_pack(pack_name)
    if pack is None:
        raise ValueError(f"Unknown compliance pack: '{pack_name}'")

    rows = []
    for policy_def in pack['policies']:
        control_name = policy_def['name']
        policy_type = policy_def['policy_type']
        required_enforcement = policy_def['enforcement']

        matching = Policy.objects.filter(
            tenant_id=tenant_id,
            name=control_name,
            enabled=True,
        ).first()

        if matching is None:
            actual_enforcement = ''
            row_status = 'inactive'
        elif matching.enforcement == Policy.Enforcement.AUDIT:
            actual_enforcement = matching.enforcement
            row_status = 'audit-only'
        else:
            actual_enforcement = matching.enforcement
            row_status = 'active'

        rows.append({
            'control_name': control_name,
            'policy_type': policy_type,
            'required_enforcement': required_enforcement,
            'actual_enforcement': actual_enforcement,
            'status': row_status,
        })

    if format == 'pdf':
        html = _control_coverage_html(pack, rows)
        return _html_to_pdf(html)

    return rows


def _control_coverage_html(pack: dict, rows: list) -> str:
    """Render control coverage data as a styled HTML document."""
    pack_name = pack.get('display_name', pack.get('name', ''))
    from datetime import date
    generated = date.today().isoformat()

    status_class = {
        'active': 'badge-active',
        'inactive': 'badge-inactive',
        'audit-only': 'badge-audit',
    }

    rows_html = ''.join(
        f"<tr>"
        f"<td>{r['control_name']}</td>"
        f"<td>{r['policy_type']}</td>"
        f"<td>{r['required_enforcement']}</td>"
        f"<td>{r['actual_enforcement']}</td>"
        f"<td class='{status_class.get(r['status'], '')}'>{r['status']}</td>"
        f"</tr>"
        for r in rows
    )

    total = len(rows)
    active = sum(1 for r in rows if r['status'] == 'active')
    coverage_pct = f"{active / total * 100:.0f}%" if total else "N/A"

    return (
        f"<html><head><meta charset='utf-8'></head><body>"
        f"<h1>Control Coverage Report: {pack_name}</h1>"
        f"<p class='meta'>Generated: {generated} &nbsp;|&nbsp; "
        f"Coverage: {active}/{total} controls active ({coverage_pct})</p>"
        f"<table>"
        f"<tr><th>Control Name</th><th>Policy Type</th>"
        f"<th>Required Enforcement</th><th>Actual Enforcement</th><th>Status</th></tr>"
        f"{rows_html}"
        f"</table></body></html>"
    )


# ---------------------------------------------------------------------------
# Violation summary report
# ---------------------------------------------------------------------------

def generate_violation_summary(
    tenant_id: str,
    date_from,
    date_to,
    format: str = 'csv',
):
    """
    Query AuditLog records for the tenant in the given date range.
    Groups by (date, resource_type) and returns daily counts.

    Returns:
        list of row dicts  — format in ('csv', 'dict')
        bytes              — format == 'pdf' (PDF via weasyprint or HTML fallback)
    """
    from zentinelle.models import AuditLog

    VIOLATION_ACTIONS = {
        AuditLog.Action.SUSPEND,
        AuditLog.Action.DELETE,
    }
    WARN_ACTIONS = {
        AuditLog.Action.CREATE,
        AuditLog.Action.UPDATE,
        AuditLog.Action.ACCESS,
    }

    qs = AuditLog.objects.filter(
        tenant_id=tenant_id,
        timestamp__gte=date_from,
        timestamp__lte=date_to,
    ).order_by('timestamp')

    from collections import defaultdict
    counts: dict = defaultdict(lambda: {'violation_count': 0, 'warn_count': 0})

    for entry in qs:
        day = entry.timestamp.date().isoformat()
        key = (day, entry.resource_type)
        if entry.action in VIOLATION_ACTIONS:
            counts[key]['violation_count'] += 1
        elif entry.action in WARN_ACTIONS:
            counts[key]['warn_count'] += 1

    rows = [
        {
            'date': day,
            'policy_type': resource_type,
            'violation_count': v['violation_count'],
            'warn_count': v['warn_count'],
        }
        for (day, resource_type), v in sorted(counts.items())
    ]

    if format == 'pdf':
        html = _violation_summary_html(rows, date_from, date_to)
        return _html_to_pdf(html)

    return rows


def _violation_summary_html(rows: list, date_from, date_to) -> str:
    """Render violation summary data as a styled HTML document."""
    from datetime import date as _date
    generated = _date.today().isoformat()
    period_from = date_from.date().isoformat() if hasattr(date_from, 'date') else str(date_from)
    period_to = date_to.date().isoformat() if hasattr(date_to, 'date') else str(date_to)

    total_violations = sum(r['violation_count'] for r in rows)
    total_warnings = sum(r['warn_count'] for r in rows)

    rows_html = ''.join(
        f"<tr>"
        f"<td>{r['date']}</td>"
        f"<td>{r['policy_type']}</td>"
        f"<td class='{'badge-inactive' if r['violation_count'] else ''}'>{r['violation_count']}</td>"
        f"<td class='{'badge-audit' if r['warn_count'] else ''}'>{r['warn_count']}</td>"
        f"</tr>"
        for r in rows
    )

    return (
        f"<html><head><meta charset='utf-8'></head><body>"
        f"<h1>Violation Summary Report</h1>"
        f"<p class='meta'>Period: {period_from} to {period_to} &nbsp;|&nbsp; "
        f"Generated: {generated} &nbsp;|&nbsp; "
        f"Total violations: {total_violations} &nbsp;|&nbsp; Warnings: {total_warnings}</p>"
        f"<table>"
        f"<tr><th>Date</th><th>Policy Type</th><th>Violations</th><th>Warnings</th></tr>"
        f"{rows_html}"
        f"</table></body></html>"
    )


# ---------------------------------------------------------------------------
# Audit trail export
# ---------------------------------------------------------------------------

def generate_audit_trail(
    tenant_id: str,
    date_from,
    date_to,
    format: str = 'csv',
):
    """
    Raw AuditLog records as a list of row dicts (for CSV) or NDJSON string (format='ndjson').
    """
    import json as _json
    from zentinelle.models import AuditLog

    qs = AuditLog.objects.filter(
        tenant_id=tenant_id,
        timestamp__gte=date_from,
        timestamp__lte=date_to,
    ).order_by('timestamp')

    rows = [
        {
            'id': str(entry.id),
            'tenant_id': entry.tenant_id,
            'action': entry.action,
            'resource_type': entry.resource_type,
            'resource_id': entry.resource_id,
            'resource_name': entry.resource_name,
            'ext_user_id': entry.ext_user_id,
            'ip_address': str(entry.ip_address) if entry.ip_address else '',
            'timestamp': entry.timestamp.isoformat() if entry.timestamp else '',
            'chain_sequence': entry.chain_sequence,
        }
        for entry in qs
    ]

    if format == 'ndjson':
        return '\n'.join(_json.dumps(r) for r in rows)

    return rows
