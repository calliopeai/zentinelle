"""
ClickHouse client wrapper for audit event analytics.

Provides:
- Connection management with pooling
- Batch insert for audit events
- Analytics query methods (event counts, timelines, top agents, compliance)

All operations are no-ops when CLICKHOUSE_URL is not configured,
so the rest of the application works normally without ClickHouse.
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Sentinel for "not initialized"
_client_instance = None
_client_checked = False


def _get_clickhouse_url() -> Optional[str]:
    """Get ClickHouse URL from settings/env."""
    return getattr(settings, 'CLICKHOUSE_URL', None) or __import__('os').environ.get('CLICKHOUSE_URL')


def _get_client():
    """
    Lazy-initialize and return a clickhouse-connect Client.

    Returns None if CLICKHOUSE_URL is not set or clickhouse-connect
    is not installed. All callers must handle None gracefully.
    """
    global _client_instance, _client_checked

    if _client_checked:
        return _client_instance

    _client_checked = True
    url = _get_clickhouse_url()
    if not url:
        logger.info("CLICKHOUSE_URL not configured; ClickHouse integration disabled.")
        return None

    try:
        import clickhouse_connect
        _client_instance = clickhouse_connect.get_client(dsn=url)
        logger.info("ClickHouse client initialized successfully.")
        return _client_instance
    except ImportError:
        logger.warning(
            "clickhouse-connect not installed; ClickHouse integration disabled. "
            "Add 'clickhouse-connect' to Pipfile to enable."
        )
        return None
    except Exception as e:
        logger.error(f"Failed to create ClickHouse client: {e}")
        return None


def is_enabled() -> bool:
    """Check whether ClickHouse integration is available."""
    return _get_client() is not None


# ---------------------------------------------------------------------------
# Write operations
# ---------------------------------------------------------------------------

def insert_audit_events(rows: List[Dict[str, Any]]) -> int:
    """
    Batch-insert audit event rows into ClickHouse.

    Each row dict should contain the column names as keys matching
    the audit_events table schema. Missing optional columns use defaults.

    Returns the number of rows inserted, or 0 if disabled/failed.
    """
    client = _get_client()
    if client is None or not rows:
        return 0

    columns = [
        'event_id',
        'event_type',
        'event_category',
        'organization_id',
        'user_id',
        'agent_id',
        'action',
        'resource_type',
        'resource_id',
        'resource_name',
        'metadata',
        'ip_address',
        'user_agent',
        'correlation_id',
        'occurred_at',
        'created_at',
    ]

    data = []
    for row in rows:
        data.append([
            str(row.get('event_id', '')),
            row.get('event_type', ''),
            row.get('event_category', ''),
            str(row.get('organization_id', '')),
            str(row['user_id']) if row.get('user_id') else None,
            row.get('agent_id') or None,
            row.get('action', ''),
            row.get('resource_type', ''),
            str(row.get('resource_id', '')),
            row.get('resource_name', ''),
            json.dumps(row.get('metadata', {})) if isinstance(row.get('metadata'), dict) else str(row.get('metadata', '{}')),
            row.get('ip_address') or None,
            row.get('user_agent', ''),
            row.get('correlation_id', ''),
            row.get('occurred_at', datetime.utcnow()),
            row.get('created_at', datetime.utcnow()),
        ])

    try:
        client.insert(
            table='audit_events',
            data=data,
            column_names=columns,
        )
        logger.debug(f"Inserted {len(data)} rows into ClickHouse audit_events.")
        return len(data)
    except Exception as e:
        logger.error(f"ClickHouse insert failed ({len(data)} rows): {e}")
        return 0


# ---------------------------------------------------------------------------
# Read / analytics operations
# ---------------------------------------------------------------------------

def event_counts_by_type(
    days: int = 30,
    organization_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Audit event counts grouped by event_type for the last N days.

    Returns list of dicts: [{"event_type": str, "count": int}, ...]
    """
    client = _get_client()
    if client is None:
        return []

    params: Dict[str, Any] = {'days': days}
    org_filter = ""
    if organization_id:
        org_filter = "AND organization_id = {org_id:UUID}"
        params['org_id'] = organization_id

    query = f"""
        SELECT
            event_type,
            count() AS cnt
        FROM audit_events
        WHERE occurred_at >= now() - INTERVAL {{days:UInt32}} DAY
        {org_filter}
        GROUP BY event_type
        ORDER BY cnt DESC
    """

    try:
        result = client.query(query, parameters=params)
        return [
            {'event_type': row[0], 'count': row[1]}
            for row in result.result_rows
        ]
    except Exception as e:
        logger.error(f"ClickHouse query event_counts_by_type failed: {e}")
        return []


def top_agents_by_event_count(
    days: int = 30,
    limit: int = 20,
    organization_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Top agents ranked by total event count in the last N days.

    Returns list of dicts: [{"agent_id": str, "event_count": int}, ...]
    """
    client = _get_client()
    if client is None:
        return []

    params: Dict[str, Any] = {'days': days, 'lim': limit}
    org_filter = ""
    if organization_id:
        org_filter = "AND organization_id = {org_id:UUID}"
        params['org_id'] = organization_id

    query = f"""
        SELECT
            agent_id,
            sum(event_count) AS total
        FROM audit_events_agent_daily
        WHERE day >= today() - {{days:UInt32}}
          AND agent_id != ''
          {org_filter}
        GROUP BY agent_id
        ORDER BY total DESC
        LIMIT {{lim:UInt32}}
    """

    try:
        result = client.query(query, parameters=params)
        return [
            {'agent_id': row[0], 'event_count': row[1]}
            for row in result.result_rows
        ]
    except Exception as e:
        logger.error(f"ClickHouse query top_agents failed: {e}")
        return []


def event_timeline(
    days: int = 30,
    granularity: str = 'day',
    organization_id: Optional[str] = None,
    event_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Event counts over time at the given granularity (hour or day).

    Returns list of dicts: [{"timestamp": str, "count": int}, ...]
    """
    client = _get_client()
    if client is None:
        return []

    if granularity == 'hour':
        time_col = 'hour'
        table = 'audit_events_hourly_counts'
        date_filter = f"hour >= now() - INTERVAL {{days:UInt32}} DAY"
    else:
        time_col = 'toDate(hour) AS day'
        table = 'audit_events_hourly_counts'
        date_filter = f"hour >= now() - INTERVAL {{days:UInt32}} DAY"

    params: Dict[str, Any] = {'days': days}
    extra_filters = ""
    if organization_id:
        extra_filters += " AND organization_id = {org_id:UUID}"
        params['org_id'] = organization_id
    if event_type:
        extra_filters += " AND event_type = {etype:String}"
        params['etype'] = event_type

    if granularity == 'hour':
        query = f"""
            SELECT
                hour,
                sum(event_count) AS cnt
            FROM {table}
            WHERE {date_filter}
            {extra_filters}
            GROUP BY hour
            ORDER BY hour
        """
    else:
        query = f"""
            SELECT
                toDate(hour) AS day,
                sum(event_count) AS cnt
            FROM {table}
            WHERE {date_filter}
            {extra_filters}
            GROUP BY day
            ORDER BY day
        """

    try:
        result = client.query(query, parameters=params)
        return [
            {'timestamp': str(row[0]), 'count': row[1]}
            for row in result.result_rows
        ]
    except Exception as e:
        logger.error(f"ClickHouse query event_timeline failed: {e}")
        return []


def compliance_report(
    days: int = 30,
) -> List[Dict[str, Any]]:
    """
    Events per organization for compliance reporting.

    Returns list of dicts:
        [{"organization_id": str, "audit_log_count": int, "agent_event_count": int, "total": int}, ...]
    """
    client = _get_client()
    if client is None:
        return []

    params: Dict[str, Any] = {'days': days}
    query = """
        SELECT
            organization_id,
            sumIf(event_count, event_category = 'audit_log')   AS audit_log_count,
            sumIf(event_count, event_category = 'agent_event') AS agent_event_count,
            sum(event_count)                                    AS total
        FROM audit_events_org_daily
        WHERE day >= today() - {days:UInt32}
        GROUP BY organization_id
        ORDER BY total DESC
    """

    try:
        result = client.query(query, parameters=params)
        return [
            {
                'organization_id': str(row[0]),
                'audit_log_count': row[1],
                'agent_event_count': row[2],
                'total': row[3],
            }
            for row in result.result_rows
        ]
    except Exception as e:
        logger.error(f"ClickHouse query compliance_report failed: {e}")
        return []


def search_events(
    organization_id: Optional[str] = None,
    event_type: Optional[str] = None,
    agent_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Search audit events with filters. Returns paginated results.

    Returns: {"events": [...], "total": int}
    """
    client = _get_client()
    if client is None:
        return {'events': [], 'total': 0}

    conditions = []
    params: Dict[str, Any] = {'lim': limit, 'off': offset}

    if organization_id:
        conditions.append("organization_id = {org_id:UUID}")
        params['org_id'] = organization_id
    if event_type:
        conditions.append("event_type = {etype:String}")
        params['etype'] = event_type
    if agent_id:
        conditions.append("agent_id = {aid:String}")
        params['aid'] = agent_id
    if resource_type:
        conditions.append("resource_type = {rtype:String}")
        params['rtype'] = resource_type
    if from_date:
        conditions.append("occurred_at >= {from_dt:DateTime64(3)}")
        params['from_dt'] = from_date
    if to_date:
        conditions.append("occurred_at <= {to_dt:DateTime64(3)}")
        params['to_dt'] = to_date

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    count_query = f"""
        SELECT count() FROM audit_events WHERE {where_clause}
    """
    data_query = f"""
        SELECT
            event_id,
            event_type,
            event_category,
            organization_id,
            user_id,
            agent_id,
            action,
            resource_type,
            resource_id,
            resource_name,
            metadata,
            ip_address,
            user_agent,
            correlation_id,
            occurred_at,
            created_at
        FROM audit_events
        WHERE {where_clause}
        ORDER BY occurred_at DESC
        LIMIT {{lim:UInt32}}
        OFFSET {{off:UInt32}}
    """

    try:
        total_result = client.query(count_query, parameters=params)
        total = total_result.result_rows[0][0] if total_result.result_rows else 0

        data_result = client.query(data_query, parameters=params)
        events = []
        for row in data_result.result_rows:
            events.append({
                'event_id': str(row[0]),
                'event_type': row[1],
                'event_category': row[2],
                'organization_id': str(row[3]),
                'user_id': str(row[4]) if row[4] else None,
                'agent_id': row[5],
                'action': row[6],
                'resource_type': row[7],
                'resource_id': row[8],
                'resource_name': row[9],
                'metadata': row[10],
                'ip_address': str(row[11]) if row[11] else None,
                'user_agent': row[12],
                'correlation_id': row[13],
                'occurred_at': str(row[14]),
                'created_at': str(row[15]),
            })

        return {'events': events, 'total': total}
    except Exception as e:
        logger.error(f"ClickHouse search_events failed: {e}")
        return {'events': [], 'total': 0}
