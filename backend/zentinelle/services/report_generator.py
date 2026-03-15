"""
Compliance report generation service.

Provides generators for three report types:
- control_coverage: policy coverage against a compliance pack
- violation_summary: daily violation/warn counts from AuditLog
- audit_trail: raw AuditLog export

Each generator returns a list of row dicts for CSV output (or a dict for HTML/PDF).
"""
import csv
import io
import logging

logger = logging.getLogger(__name__)


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

    Returns a list of row dicts:
        [control_name, policy_type, required_enforcement, actual_enforcement, status]

    status = 'active' | 'inactive' | 'audit-only'
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

        # Look for a matching active policy for this tenant
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
        return _control_coverage_html(pack, rows)

    return rows


def _control_coverage_html(pack: dict, rows: list) -> str:
    """
    Return an HTML string representing the control coverage report.
    # TODO: pipe through weasyprint for real PDF
    """
    pack_name = pack.get('display_name', pack.get('name', ''))
    rows_html = ''.join(
        f"<tr><td>{r['control_name']}</td><td>{r['policy_type']}</td>"
        f"<td>{r['required_enforcement']}</td><td>{r['actual_enforcement']}</td>"
        f"<td>{r['status']}</td></tr>"
        for r in rows
    )
    return (
        f"<html><body>"
        f"<h1>Control Coverage Report: {pack_name}</h1>"
        f"<table border='1'>"
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
    Query AuditLog records for the tenant in the given date range where the action
    indicates a violation (action in: 'create', 'update', 'delete', 'suspend').

    Groups by (date, resource_type) and returns daily counts.
    Rows: [date, policy_type, violation_count, warn_count]

    date_from / date_to: datetime-like objects (timezone-aware or naive).
    """
    from zentinelle.models import AuditLog

    # Actions considered violations vs warnings
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

    # Aggregate in Python (avoids DB-specific date truncation functions)
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
        return _violation_summary_html(rows, date_from, date_to)

    return rows


def _violation_summary_html(rows: list, date_from, date_to) -> str:
    """
    Return an HTML string representing the violation summary report.
    # TODO: pipe through weasyprint for real PDF
    """
    rows_html = ''.join(
        f"<tr><td>{r['date']}</td><td>{r['policy_type']}</td>"
        f"<td>{r['violation_count']}</td><td>{r['warn_count']}</td></tr>"
        for r in rows
    )
    return (
        f"<html><body>"
        f"<h1>Violation Summary Report</h1>"
        f"<p>Period: {date_from} to {date_to}</p>"
        f"<table border='1'>"
        f"<tr><th>Date</th><th>Policy Type</th><th>Violation Count</th><th>Warn Count</th></tr>"
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
