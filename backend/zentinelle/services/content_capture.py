"""Content capture is an operator setting, applied before durable writes."""
import re

from django.conf import settings

CONTENT_KEYS = {'input', 'output', 'input_text', 'output_text', 'input_content', 'output_content',
                'request_body', 'response_body', 'messages', 'prompt', 'system_prompt', 'tool_args',
                'tool_input', 'tool_calls', 'tool_outputs', 'rag_context', 'extracted_text', 'content'}
SECRET_KEYS = {'api_key', 'apikey', 'authorization', 'password', 'secret', 'token', 'approval_token'}


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
    for pattern, _ in ContentScanner.PII_PATTERNS.values():
        text = re.sub(pattern, '[REDACTED]', text, flags=re.IGNORECASE)
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
            result[key] = capture_payload(item, tenant_id, mode)
        return result
    if isinstance(value, list):
        return [capture_payload(item, tenant_id, mode) for item in value]
    if isinstance(value, str):
        return value if mode == 'full' else redact_text(value)
    return value


def record_interaction(**kwargs):
    """Inspect raw content in memory, then persist according to the capture profile."""
    from zentinelle.models.compliance import ContentScan, InteractionLog
    from zentinelle.services.content_scanner import ContentScanner
    scanner = ContentScanner(kwargs['tenant_id'])
    for field, kind in (('input_content', ContentScan.ContentType.USER_INPUT),
                        ('output_content', ContentScan.ContentType.AI_OUTPUT)):
        content = kwargs.get(field)
        if content:
            _, scan = scanner.scan(content=content, endpoint=kwargs.get('endpoint'),
                                   user_id=kwargs.get('user_identifier') or '', content_type=kind,
                                   request_id=kwargs.get('request_id', ''))
            kwargs['scan'] = scan
    tenant_id = kwargs.get('tenant_id')
    for field in ('input_content', 'output_content'):
        if kwargs.get(field) is not None:
            kwargs[field] = capture_text(kwargs[field], tenant_id)
    return InteractionLog.objects.create(**kwargs)
