"""
Behavioral baseline store — Redis-backed per-agent rolling statistics.

Baselines are updated asynchronously by the Celery beat task
`update_agent_baselines` (zentinelle/tasks/scheduled.py).
Evaluators read from the store on the hot evaluation path (read-only).

Key schema:
    baseline:{tenant_id}:{agent_id}  →  JSON hash
    TTL: 48 hours (refreshed on each update)

Stats stored:
    token_usage_p95           — 95th percentile tokens per call
    tool_calls_per_session_p95 — 95th percentile tool calls per session
    unique_domains_per_day_p95 — 95th percentile unique external domains/day
    requests_per_hour_p95     — 95th percentile requests per hour
    bytes_read_per_session_p95 — 95th percentile bytes read per session
    sample_count              — number of observations used to compute baseline
    last_updated              — ISO8601 timestamp of last recompute
    baseline_window_days      — window used for this baseline
"""
import json
import logging
import math
from typing import Dict, Any, Optional

from django.core.cache import cache

logger = logging.getLogger(__name__)

BASELINE_KEY_PREFIX = 'baseline'
BASELINE_TTL = 60 * 60 * 48          # 48 hours
MIN_SAMPLES_DEFAULT = 50              # don't enforce until enough data


def _key(tenant_id: str, agent_id: str) -> str:
    return f"{BASELINE_KEY_PREFIX}:{tenant_id}:{agent_id}"


def get_baseline(tenant_id: str, agent_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve the current behavioral baseline for an agent.
    Returns None if no baseline exists yet.
    """
    raw = cache.get(_key(tenant_id, agent_id))
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def set_baseline(tenant_id: str, agent_id: str, stats: Dict[str, Any]) -> None:
    """
    Write or replace a baseline for an agent.
    Called by the Celery beat task after recomputing from the events table.
    """
    cache.set(_key(tenant_id, agent_id), stats, timeout=BASELINE_TTL)


def compute_percentile(values: list, percentile: float) -> float:
    """
    Compute the Nth percentile of a list of numeric values.
    Uses linear interpolation (same as numpy.percentile).
    """
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    idx = (percentile / 100) * (n - 1)
    lower = int(math.floor(idx))
    upper = int(math.ceil(idx))
    if lower == upper:
        return float(sorted_vals[lower])
    frac = idx - lower
    return float(sorted_vals[lower] * (1 - frac) + sorted_vals[upper] * frac)


def recompute_baseline(
    tenant_id: str,
    agent_id: str,
    window_days: int = 14,
) -> Optional[Dict[str, Any]]:
    """
    Recompute and store the baseline for a specific agent from the events table.
    Called by the Celery beat task. Returns the computed stats dict or None if
    insufficient data.
    """
    from django.utils import timezone
    from datetime import timedelta
    from zentinelle.models import Event

    since = timezone.now() - timedelta(days=window_days)

    events = list(
        Event.objects.filter(
            tenant_id=tenant_id,
            agent_id=agent_id,
            created_at__gte=since,
        ).values(
            'created_at',
            'event_type',
            'metadata',
            'tokens_used',
            'cost_usd',
        ).order_by('created_at')
    )

    if len(events) < MIN_SAMPLES_DEFAULT:
        logger.debug(
            "Insufficient samples for baseline: tenant=%s agent=%s samples=%d",
            tenant_id, agent_id, len(events),
        )
        return None

    # Collect per-call token usage
    token_usages = [
        e['tokens_used'] for e in events
        if e.get('tokens_used') is not None
    ]

    # Collect tool call counts per session
    from collections import defaultdict
    session_tool_counts: Dict[str, int] = defaultdict(int)
    for e in events:
        meta = e.get('metadata') or {}
        session_id = meta.get('session_id', 'unknown')
        if e.get('event_type', '').startswith('tool.'):
            session_tool_counts[session_id] += 1

    # Collect unique domains per calendar day
    from datetime import date
    day_domains: Dict[date, set] = defaultdict(set)
    for e in events:
        meta = e.get('metadata') or {}
        domain = meta.get('domain') or meta.get('url_domain')
        if domain:
            day = e['created_at'].date()
            day_domains[day].add(domain)

    # Requests per hour
    from collections import Counter
    hour_counts = Counter()
    for e in events:
        hour_key = e['created_at'].replace(minute=0, second=0, microsecond=0)
        hour_counts[hour_key] += 1

    stats = {
        'tenant_id': tenant_id,
        'agent_id': agent_id,
        'sample_count': len(events),
        'baseline_window_days': window_days,
        'last_updated': timezone.now().isoformat(),
        'token_usage_p95': compute_percentile(token_usages, 95) if token_usages else 0,
        'tool_calls_per_session_p95': compute_percentile(list(session_tool_counts.values()), 95),
        'unique_domains_per_day_p95': compute_percentile([len(v) for v in day_domains.values()], 95),
        'requests_per_hour_p95': compute_percentile(list(hour_counts.values()), 95),
    }

    set_baseline(tenant_id, agent_id, stats)
    return stats
