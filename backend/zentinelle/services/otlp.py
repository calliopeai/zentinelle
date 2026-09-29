"""Translate OTLP/HTTP JSON traces onto the existing event ingest contract (#378).

The API key owns identity; resource attributes never name a tenant or agent.
Keep correlated span metadata, and place arbitrary OTLP attributes under the
content-capture key so the tenant's existing capture policy applies to them.
"""
import re
from datetime import datetime, timezone

from rest_framework.exceptions import ValidationError

_ID = re.compile(r"[0-9a-fA-F]+\Z")
SESSION_ATTRIBUTE = "vscode.agent_host.session.uri"
MAX_SPANS = 1000


def _object(value, label):
    if not isinstance(value, dict):
        raise ValidationError(f"{label} must be an object")
    return value


def _list(value, label):
    if not isinstance(value, list) or len(value) > MAX_SPANS:
        raise ValidationError(f"{label} must be a list of at most {MAX_SPANS} entries")
    return value


def _attributes(value):
    attrs = {}
    for item in _list(value or [], "attributes"):
        item = _object(item, "attribute")
        key = item.get("key")
        if not isinstance(key, str) or len(key) > 255:
            raise ValidationError("attribute keys must be strings of at most 255 characters")
        data = _object(item.get("value"), "attribute value")
        # Store arbitrary attributes only under content, never as authority.
        attrs[key] = data.get("stringValue", data.get("intValue", data.get("boolValue", data.get("doubleValue"))))
    return attrs


def _id(value, size, label):
    if not isinstance(value, str) or len(value) != size or not _ID.fullmatch(value) or int(value, 16) == 0:
        raise ValidationError(f"{label} must be a nonzero {size}-digit hex string")
    return value.lower()


def _time(value):
    try:
        if isinstance(value, bool) or not isinstance(value, (str, int)):
            raise ValueError()
        nanos = int(value)
        if nanos < 0:
            raise ValueError()
        seconds, remainder = divmod(nanos, 1_000_000_000)
        return datetime.fromtimestamp(seconds, timezone.utc).replace(microsecond=remainder // 1000)
    except (ValueError, TypeError, OverflowError, OSError):
        raise ValidationError("span timestamps must be valid Unix nanoseconds") from None


def trace_events(payload):
    """Validate a whole batch before writing, then translate its spans into events."""
    payload = _object(payload, "OTLP request")
    events = []
    for resource in _list(payload.get("resourceSpans", []), "resourceSpans"):
        resource = _object(resource, "resourceSpans entry")
        resource_attrs = _attributes(_object(resource.get("resource", {}), "resource").get("attributes", []))
        for scope in _list(resource.get("scopeSpans", []), "scopeSpans"):
            scope = _object(scope, "scopeSpans entry")
            for span in _list(scope.get("spans", []), "spans"):
                if len(events) >= MAX_SPANS:
                    raise ValidationError(f"at most {MAX_SPANS} spans per request")
                span = _object(span, "span")
                trace_id = _id(span.get("traceId"), 32, "traceId")
                span_id = _id(span.get("spanId"), 16, "spanId")
                attrs = {**resource_attrs, **_attributes(span.get("attributes", []))}
                session = attrs.get(SESSION_ATTRIBUTE, attrs.get("session_id", ""))
                if not isinstance(session, str) or len(session) > 255:
                    raise ValidationError("session id must be a string of at most 255 characters")
                name = span.get("name", "")
                if not isinstance(name, str) or len(name) > 1000:
                    raise ValidationError("span name must be a string of at most 1000 characters")
                start, end = _time(span.get("startTimeUnixNano")), _time(span.get("endTimeUnixNano"))
                if end < start:
                    raise ValidationError("span end precedes its start")
                events.append({
                    "type": "agent_host.span", "category": "telemetry",
                    "event_id": f"otlp:{trace_id}:{span_id}", "timestamp": start,
                    "payload": {"context": {"session_id": session},
                                "trace_id": trace_id, "span_id": span_id,
                                "parent_span_id": span.get("parentSpanId", ""),
                                "duration_ms": (end - start).total_seconds() * 1000,
                                "status": _object(span.get("status", {}), "span status").get("code", 0),
                                "content": {"name": name, "attributes": attrs}},
                })
    return events
