"""Content capture is an operator setting, applied before durable writes."""
import re
import uuid

from django.conf import settings

CONTENT_KEYS = {'input', 'output', 'input_text', 'output_text', 'input_content', 'output_content',
                'request_body', 'response_body', 'messages', 'prompt', 'system_prompt', 'tool_args',
                'tool_input', 'tool_calls', 'tool_outputs', 'rag_context', 'extracted_text', 'content'}
UUID_REFERENCE_KEYS = {'approval_request_id', 'trace_id', 'evidence_id', 'event_id', 'action_id'}
SECRET_KEYS = {'api_key', 'apikey', 'authorization', 'password', 'secret', 'token', 'approval_token'}
# A UUID is an identifier, never PII, but the passport and drivers_license
# patterns match its first segment under IGNORECASE (#404). Only a standalone
# UUID is spared: one that is part of a longer token, such as an email
# address's local part, is scanned as before. The capture group keeps the
# UUIDs in re.split's output.
UUID_TOKEN = re.compile(r'(?<![\w.%+@-])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![\w@-])',
                        re.IGNORECASE)


def capture_mode(tenant_id=None):
    if tenant_id:
        try:
            from zentinelle.models import TenantConfig
            stored = TenantConfig.objects.filter(tenant_id=str(tenant_id)).values_list('settings', flat=True).first() or {}
            configured = stored.get('content_capture_mode')
            if configured in ('metadata', 'redacted', 'full'):
                return configured
        except Exception:
            pass
    mode = getattr(settings, 'CONTENT_CAPTURE_MODE', 'metadata')
    return mode if mode in ('metadata', 'redacted', 'full') else 'metadata'


def redact_text(value):
    from zentinelle.services.content_scanner import ContentScanner
    text = str(value or '')
    text = re.sub(r'-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----',
                  '[REDACTED PRIVATE KEY]', text, flags=re.DOTALL | re.IGNORECASE)
    # Odd pieces are UUIDs; PII patterns run on the text between them only.
    pieces = UUID_TOKEN.split(text)
    for index in range(0, len(pieces), 2):
        for pattern, _ in ContentScanner.PII_PATTERNS.values():
            pieces[index] = re.sub(pattern, '[REDACTED]', pieces[index], flags=re.IGNORECASE)
    text = ''.join(pieces)
    # Secret patterns are scanner-owned; inspect the same literals before persistence.
    for definition in ContentScanner.SECRET_PATTERNS.values():
        pattern = definition[0] if isinstance(definition, tuple) else definition
        text = re.sub(pattern, '[REDACTED]', text, flags=re.IGNORECASE)
    return text


def capture_text(value, tenant_id=None):
    mode = capture_mode(tenant_id)
    if mode == 'metadata':
        return ''
    return str(value or '') if mode == 'full' else redact_text(value)


def capture_payload(value, tenant_id=None, _mode=None):
    mode = _mode or capture_mode(tenant_id)
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if key.lower() in SECRET_KEYS or key.startswith('_'):
                continue
            if key.lower() in CONTENT_KEYS and mode == 'metadata':
                continue
            if key in UUID_REFERENCE_KEYS and isinstance(item, str):
                try:
                    if str(uuid.UUID(item)) == item.lower():
                        result[key] = item
                        continue
                except ValueError:
                    pass
            result[key] = capture_payload(item, tenant_id, mode)
        return result
    if isinstance(value, list):
        return [capture_payload(item, tenant_id, mode) for item in value]
    if isinstance(value, str):
        return value if mode == 'full' else redact_text(value)
    return value


def _empty(value):
    return value is None or value == '' or value == [] or value == {}


def _unfilled(row, field):
    """Empty, or the action name /evaluate stores until the call's content arrives."""
    value = getattr(row, field)
    return _empty(value) or (field == 'input_content' and bool(row.topics) and value == row.topics[0])


def record_interaction(merge=False, record=True, **kwargs):
    """Inspect raw content in memory, then persist according to the capture profile.

    With `merge`, a row the same endpoint already logged under the same
    request_id is completed instead of duplicated: one provider call is one
    row. Only unfilled fields are written, so a later post can never rewrite
    content or lower token counts and cost already recorded.

    Without `record` the scan is a record of content another check decides
    on: it counts no repeats and raises no alerts (#413).
    """
    from zentinelle.models.compliance import ContentScan, InteractionLog
    from zentinelle.services.content_scanner import ContentScanner
    scanner = ContentScanner(kwargs['tenant_id'])
    for field, kind in (('input_content', ContentScan.ContentType.USER_INPUT),
                        ('output_content', ContentScan.ContentType.AI_OUTPUT)):
        content = kwargs.get(field)
        if content:
            _, scan = scanner.scan(content=content, endpoint=kwargs.get('endpoint'),
                                   user_id=kwargs.get('user_identifier') or '', content_type=kind,
                                   session_id=kwargs.get('session_id') or '',
                                   request_id=kwargs.get('request_id', ''), record=record)
            kwargs['scan'] = scan
    tenant_id = kwargs.get('tenant_id')
    for field in ('input_content', 'output_content'):
        if kwargs.get(field) is not None:
            kwargs[field] = capture_text(kwargs[field], tenant_id)
    existing = None
    if merge and kwargs.get('request_id') and kwargs.get('endpoint') is not None:
        existing = InteractionLog.objects.filter(
            tenant_id=tenant_id, endpoint=kwargs['endpoint'], request_id=kwargs['request_id'],
        ).order_by('created_at').first()
    if existing is None:
        return InteractionLog.objects.create(**kwargs)
    filled = [field for field, value in kwargs.items()
              if not _empty(value) and _unfilled(existing, field)]
    for field in filled:
        setattr(existing, field, kwargs[field])
    if filled:
        existing.save(update_fields=filled + ['version', 'updated_at'])
    return existing
