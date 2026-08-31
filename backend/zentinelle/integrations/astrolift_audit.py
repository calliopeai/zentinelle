"""
Receiver for Astrolift's audit webhook.

Astrolift's `astrolift_operations.zentinelle_integration` ships a pre-canned
webhook subscription pointing at this route. The contract is fixed on that
side, so this mirrors it exactly rather than inventing one:

  POST /integrations/astrolift/v1/audit
  X-Astrolift-Signature: sha256=<hex of HMAC-SHA256(secret, "<ts>.<raw body>")>
  X-Astrolift-Timestamp: <unix seconds>
  X-Astrolift-Event-Type / -Event-Id / -Delivery-Id / -Schema

Signature verification is not optional. Astrolift sets
`signing_secret_required = True` with the note that the receiver must verify
"or the audit chain is meaningless" — an unverified receiver launders
unauthenticated events into compliance evidence, which is worse than having no
receiver at all.
"""
import hashlib
import hmac
import json
import logging
import time

from django.db import IntegrityError
from django.db.models import F
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from zentinelle.models import (
    AstroliftAuditDelivery,
    AstroliftIntegration,
    AuditLog,
)

logger = logging.getLogger(__name__)

# Matches Astrolift's verify_signature default. A wider window weakens replay
# protection; a narrower one starts rejecting deliveries over normal clock skew.
FRESHNESS_WINDOW_SECONDS = 300

# Astrolift's PAYLOAD_VERSION. Bumped there when the envelope changes
# incompatibly; reject anything we were not written against rather than
# silently half-parsing it.
SUPPORTED_PAYLOAD_VERSION = 1

ENVELOPE_FIELDS = (
    "payload_version",
    "event_type",
    "event_id",
    "org_id",
    "occurred_at_unix",
    "payload",
    "idempotency_key",
)

# Astrolift's locked vocabulary (ZentinelleEventType). Anything outside it is
# refused: the evidence chain is only meaningful if every row is a known type.
KNOWN_EVENT_TYPES = frozenset({
    "AUDIT.role_binding.grant",
    "AUDIT.role_binding.revoke",
    "AUDIT.user.invited",
    "AUDIT.user.accepted",
    "AUDIT.user.deactivated",
    "AUDIT.app.deploy",
    "AUDIT.app.registered",
    "AUDIT.app.deregistered",
    "AUDIT.secret.rotated",
    "AUDIT.secret.viewed",
    "AUDIT.org.update",
    "AUDIT.observability.update",
    "AUDIT.residency.update",
    "AUDIT.compliance.report_generated",
})

# Astrolift's event vocabulary is finer-grained than AuditLog.Action, so the
# full event_type is always kept in metadata; this is only the coarse bucket.
_ACTION_BY_EVENT = {
    "AUDIT.role_binding.grant": AuditLog.Action.CREATE,
    "AUDIT.role_binding.revoke": AuditLog.Action.DELETE,
    "AUDIT.user.invited": AuditLog.Action.CREATE,
    "AUDIT.user.accepted": AuditLog.Action.UPDATE,
    "AUDIT.user.deactivated": AuditLog.Action.SUSPEND,
    "AUDIT.app.deploy": AuditLog.Action.UPDATE,
    "AUDIT.app.registered": AuditLog.Action.CREATE,
    "AUDIT.app.deregistered": AuditLog.Action.DELETE,
    "AUDIT.secret.rotated": AuditLog.Action.ROTATE_KEY,
    "AUDIT.secret.viewed": AuditLog.Action.ACCESS,
    "AUDIT.org.update": AuditLog.Action.UPDATE,
    "AUDIT.observability.update": AuditLog.Action.UPDATE,
    "AUDIT.residency.update": AuditLog.Action.UPDATE,
    "AUDIT.compliance.report_generated": AuditLog.Action.CREATE,
}

_RESOURCE_BY_EVENT_PREFIX = {
    "AUDIT.role_binding": "role_binding",
    "AUDIT.user": "user",
    "AUDIT.app": "application",
    "AUDIT.secret": "secret",
    "AUDIT.org": "organization",
    "AUDIT.observability": "observability_profile",
    "AUDIT.residency": "residency_policy",
    "AUDIT.compliance": "compliance_report",
}


def _error(code: str, detail: str, status: int) -> JsonResponse:
    return JsonResponse({"error": code, "detail": detail}, status=status)


def _signature_matches(secret: str, timestamp: str, raw_body: bytes, presented: str) -> bool:
    """Constant-time compare against Astrolift's `sha256=<hex>` format."""
    if not secret:
        return False
    signing_input = f"{timestamp}.".encode("ascii") + raw_body
    expected = hmac.new(
        secret.encode("utf-8"), signing_input, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", presented)


def _resource_type_for(event_type: str) -> str:
    for prefix, resource in _RESOURCE_BY_EVENT_PREFIX.items():
        if event_type.startswith(prefix):
            return resource
    return "astrolift_event"


@csrf_exempt
@require_POST
def astrolift_audit_webhook(request):
    """POST /integrations/astrolift/v1/audit"""
    raw_body = request.body

    presented = request.headers.get("X-Astrolift-Signature", "")
    timestamp = request.headers.get("X-Astrolift-Timestamp", "")
    if not presented or not timestamp:
        return _error("unsigned", "Signature and timestamp headers are required", 401)

    try:
        ts = int(timestamp)
    except ValueError:
        return _error("bad_timestamp", "X-Astrolift-Timestamp must be unix seconds", 400)

    # Freshness first: a replayed body carries a valid signature forever, so
    # the window is the only thing that stops it.
    if abs(int(time.time()) - ts) > FRESHNESS_WINDOW_SECONDS:
        return _error("stale", "Timestamp outside the freshness window", 401)

    try:
        envelope = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return _error("bad_json", "Body must be JSON", 400)
    if not isinstance(envelope, dict):
        return _error("bad_envelope", "Body must be a JSON object", 400)

    # org_id is read before the signature is verified, because it selects which
    # secret to verify against. Nothing else from the body is trusted until the
    # signature passes.
    org_id = envelope.get("org_id")
    if not isinstance(org_id, int) or org_id <= 0:
        return _error("bad_org", "org_id must be a positive integer", 400)

    integration = AstroliftIntegration.objects.filter(
        astrolift_org_id=org_id, is_active=True
    ).first()
    if integration is None:
        # Deliberately the same shape as a signature failure: whether an org is
        # configured here is not something an unauthenticated caller may probe.
        return _error("unauthorized", "Signature verification failed", 401)

    verified = _signature_matches(
        integration.signing_secret, timestamp, raw_body, presented
    ) or _signature_matches(
        integration.previous_signing_secret, timestamp, raw_body, presented
    )
    if not verified:
        logger.warning("Astrolift audit signature rejected for org %s", org_id)
        return _error("unauthorized", "Signature verification failed", 401)

    # --- verified past this point ---

    missing = [f for f in ENVELOPE_FIELDS if f not in envelope]
    if missing:
        return _error("bad_envelope", f"Missing envelope fields: {sorted(missing)}", 400)

    if envelope["payload_version"] != SUPPORTED_PAYLOAD_VERSION:
        return _error(
            "unsupported_version",
            f"payload_version {envelope['payload_version']} is not supported "
            f"(this collector speaks {SUPPORTED_PAYLOAD_VERSION})",
            400,
        )

    event_type = envelope["event_type"]
    if event_type not in KNOWN_EVENT_TYPES:
        return _error("unknown_event_type", f"Unknown event_type {event_type!r}", 400)

    if not isinstance(envelope.get("payload"), dict):
        return _error("bad_payload", "payload must be an object", 400)

    idempotency_key = envelope["idempotency_key"]
    expected_key = f"zentinelle-{org_id}-{envelope['event_id']}"
    if idempotency_key != expected_key:
        # Astrolift's idempotency_key_for locks this format. A mismatch means
        # the two sides disagree, and dedupe would silently stop working.
        return _error(
            "bad_idempotency_key",
            f"idempotency_key must be {expected_key!r}",
            400,
        )

    tenant_id = integration.tenant_id
    actor = envelope.get("actor_user_id")

    # The delivery marker and the evidence row live on different database
    # aliases (the router sends AuditLog to `analytics`), so no single atomic
    # block covers both. The marker is claimed first to keep concurrent
    # deliveries from both writing evidence, and released again if the evidence
    # write fails -- otherwise a failed write leaves a marker that suppresses
    # every retry of that event, and the evidence is lost permanently.
    try:
        delivery = AstroliftAuditDelivery.objects.create(
            idempotency_key=idempotency_key,
            tenant_id=tenant_id,
            astrolift_event_id=str(envelope["event_id"]),
            event_type=event_type,
        )
    except IntegrityError:
        # Already accepted. Retries must be a no-op, not a second evidence row.
        return JsonResponse({"status": "duplicate", "idempotency_key": idempotency_key}, status=200)

    payload = envelope["payload"]
    try:
        entry = _write_evidence(request, tenant_id, envelope, event_type, org_id, actor)
    except Exception:
        delivery.delete()
        logger.exception(
            "Evidence write failed for %s; released the delivery marker so the "
            "webhook retry can be accepted", idempotency_key,
        )
        raise

    delivery.audit_log_id = entry.id
    delivery.save(update_fields=["audit_log_id"])

    # F() so concurrent deliveries do not clobber each other's count.
    AstroliftIntegration.objects.filter(pk=integration.pk).update(
        last_event_at=timezone.now(),
        events_accepted=F("events_accepted") + 1,
    )

    return JsonResponse(
        {"status": "accepted", "audit_log_id": str(entry.id)}, status=202
    )


def _write_evidence(request, tenant_id, envelope, event_type, org_id, actor):
    payload = envelope["payload"]
    return AuditLog.log(
        tenant_id=tenant_id,
        action=_ACTION_BY_EVENT.get(event_type, AuditLog.Action.UPDATE),
        resource_type=_resource_type_for(event_type),
        resource_id=str(envelope["event_id"]),
        resource_name=str(payload.get("app_slug") or payload.get("subject_email") or ""),
        ext_user_id=str(actor) if actor is not None else "",
        user_agent=request.headers.get("User-Agent", "")[:500],
        changes=payload,
        metadata={
            "source": "astrolift",
            "astrolift_event_type": event_type,
            "astrolift_event_id": envelope["event_id"],
            "astrolift_org_id": org_id,
            "astrolift_delivery_id": request.headers.get("X-Astrolift-Delivery-Id", ""),
            "occurred_at_unix": envelope["occurred_at_unix"],
            "payload_version": envelope["payload_version"],
        },
    )

