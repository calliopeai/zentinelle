"""Export metered usage to Calliope AI billing (#245).

This is the BYOK / on-prem path. A customer runs Zentinelle over their own keys
and their own infrastructure; we bill them for the governance control plane,
not for their tokens. So what leaves here is counts and identifiers, and the
receiver is told not to mark anything up.

Three decisions were open on the issue. Two are settled here, and the reasoning
is recorded because they are the kind of choice that is expensive to revisit
once a billing ledger has data in it.

**Push, not pull.** Zentinelle in this mode runs inside the customer's
perimeter. Pulling would need inbound reachability into that perimeter, which
for an on-prem customer is frequently the exact thing they bought this to
avoid. Push needs only outbound HTTPS to one host, which is a firewall rule a
customer can read and approve.

**Mirror `billing.AIUsage` rather than invent a shape.** The issue asks for
reconciliation into the same ledger the Managed path feeds, so the rows are
emitted in that shape: organization, provider, model, input_tokens,
output_tokens, total_tokens, cost, timestamp. A Zentinelle-specific schema
would need a translation layer on the far side, and translation layers are
where reconciliation bugs live.

The third — seat vs metered vs tier for the governance fee — is a pricing
decision and is not made here. It belongs in Client Cove's billing config,
where the Managed tiers already live. Nothing in this module assumes an answer:
it reports what was used and marks the mode, and the receiver prices it.

Delivery is at-least-once, and rows carry a deterministic `event_id` so the
receiver can dedupe. Exactly-once across a network is not available; a receiver
that ignores repeats is.
"""
import hashlib
import logging

import httpx
from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

# The metric types that make up one AI call. Infrastructure metrics are not
# exported: this path bills for governance, and CPU hours on a customer's own
# hardware are not ours to meter.
_TOKEN_METRICS = {
    'ai_input_tokens': 'input_tokens',
    'ai_output_tokens': 'output_tokens',
    'ai_cache_read_tokens': 'cache_read_tokens',
    'ai_cache_write_tokens': 'cache_write_tokens',
}

# `ai_total_tokens` is deliberately not read. It is derived, and importing both
# a sum and its parts invites them to disagree after a partial write.

DEFAULT_BATCH_SIZE = 500


class BillingExportError(Exception):
    """The batch was not accepted, and its rows stay unexported."""


def is_enabled() -> bool:
    return bool(
        getattr(settings, 'BILLING_EXPORT_ENABLED', False)
        and getattr(settings, 'BILLING_EXPORT_URL', '')
    )


def billing_mode() -> str:
    """`governance_only` bills the control plane; `resale` marks up tokens.

    Defaults to `governance_only`, which is the safe direction to be wrong in:
    under-billing a customer is recoverable, and billing a BYOK customer for
    tokens they paid their own provider for is not.
    """
    return getattr(settings, 'BILLING_MODE', 'governance_only')


def _event_id(tenant_id: str, request_id: str, provider: str, model: str,
              occurred_at) -> str:
    """A stable id for one exported call.

    Derived rather than random so a retry produces the same id and the receiver
    can drop the duplicate. `ai_request_id` is the provider's own id where we
    have one; where we do not, the tuple below is what identifies the call.
    """
    parts = [
        str(tenant_id or ''),
        str(request_id or ''),
        str(provider or ''),
        str(model or ''),
        occurred_at.isoformat() if occurred_at else '',
    ]
    return hashlib.sha256('|'.join(parts).encode('utf-8')).hexdigest()


def collect_pending(limit: int = DEFAULT_BATCH_SIZE):
    """Group unexported token metrics into `AIUsage`-shaped rows.

    Usage is stored one row per metric type, so a single call appears as
    several `UsageMetric` records sharing an `ai_request_id`. They are grouped
    back into one billing row here.

    Returns `(rows, metric_ids)`. The ids are returned rather than marked
    immediately: rows are only marked exported once the receiver has accepted
    them, so a failed POST leaves them to be retried rather than silently
    dropping a customer's usage.
    """
    from zentinelle.models.usage import UsageMetric

    metrics = list(
        UsageMetric.objects
        .filter(
            metric_type__in=_TOKEN_METRICS.keys(),
            billing_exported_at__isnull=True,
        )
        .order_by('occurred_at')[:limit]
    )

    grouped = {}
    metric_ids = []

    for metric in metrics:
        metric_ids.append(metric.id)
        key = (
            metric.tenant_id,
            metric.ai_request_id,
            metric.ai_provider,
            metric.ai_model,
            metric.occurred_at,
        )
        row = grouped.get(key)
        if row is None:
            row = {
                'event_id': _event_id(*key),
                'organization': metric.tenant_id,
                'provider': metric.ai_provider or 'unknown',
                'model': metric.ai_model or 'unknown',
                'input_tokens': 0,
                'output_tokens': 0,
                'cache_read_tokens': 0,
                'cache_write_tokens': 0,
                'total_tokens': 0,
                # Zero, and that is the point of governance_only mode: the
                # customer paid their own provider. The receiver bills for the
                # control plane, not for these tokens.
                'cost': '0',
                'billing_mode': billing_mode(),
                'source': 'zentinelle',
                'timestamp': (
                    metric.occurred_at.isoformat()
                    if metric.occurred_at else None
                ),
                'user_identifier': metric.user_identifier or '',
            }
            grouped[key] = row

        field = _TOKEN_METRICS[metric.metric_type]
        row[field] += int(metric.value or 0)

    rows = []
    for row in grouped.values():
        row['total_tokens'] = row['input_tokens'] + row['output_tokens']
        rows.append(row)

    return rows, metric_ids


def _post(rows) -> None:
    url = settings.BILLING_EXPORT_URL
    token = getattr(settings, 'BILLING_EXPORT_TOKEN', '')

    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'

    try:
        response = httpx.post(
            url,
            json={'source': 'zentinelle', 'billing_mode': billing_mode(),
                  'events': rows},
            headers=headers,
            timeout=getattr(settings, 'BILLING_EXPORT_TIMEOUT', 30),
        )
    except httpx.HTTPError as exc:
        raise BillingExportError(
            f'Could not reach billing ingest: {exc}') from exc

    if response.status_code >= 400:
        raise BillingExportError(
            f'Billing ingest refused the batch: HTTP {response.status_code}'
        )


def export_pending(limit: int = DEFAULT_BATCH_SIZE,
                   dry_run: bool = False) -> dict:
    """Send one batch of usage to the billing ingest.

    Rows are marked exported only after the receiver accepts them. The window
    between a successful POST and that write is where at-least-once delivery
    comes from: a crash there resends the batch, and the deterministic
    `event_id` is what makes that harmless.
    """
    # A dry run works whether or not the export is switched on. Seeing what
    # would be sent is most useful *before* enabling it, so refusing here would
    # remove the answer at the moment the question is being asked.
    if not dry_run and not is_enabled():
        return {'enabled': False, 'exported': 0}

    rows, metric_ids = collect_pending(limit)

    if dry_run:
        return {'enabled': is_enabled(), 'exported': 0,
                'would_export': len(rows), 'rows': rows}

    if not rows:
        return {'enabled': True, 'exported': 0}

    _post(rows)

    from zentinelle.models.usage import UsageMetric

    now = timezone.now()
    with transaction.atomic():
        UsageMetric.objects.filter(id__in=metric_ids).update(
            billing_exported_at=now
        )

    logger.info('Exported %d usage events to billing (%d metrics)',
                len(rows), len(metric_ids))
    return {'enabled': True, 'exported': len(rows), 'metrics': len(metric_ids)}
