"""
Webhook notification dispatcher.

Delivers HMAC-signed webhooks to configured endpoints when policy
violations, incidents, or compliance alerts fire.
"""
import hashlib
import hmac
import json
import logging
import time

import httpx

from zentinelle.models.risk import NotificationConfig

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT = 10.0
WEBHOOK_SECRET_HEADER = 'X-Zentinelle-Signature'


def dispatch_webhook(tenant_id: str, event_type: str, severity: str, payload: dict):
    """
    Deliver webhooks to all matching NotificationConfig entries for this tenant.

    Args:
        tenant_id: Tenant that owns the event
        event_type: e.g. 'policy_violation', 'incident_created', 'compliance_alert'
        severity: e.g. 'critical', 'high', 'medium', 'low'
        payload: Event data to include in the webhook body
    """
    configs = NotificationConfig.objects.filter(
        tenant_id=tenant_id,
        enabled=True,
        channel__in=[NotificationConfig.Channel.WEBHOOK, NotificationConfig.Channel.SLACK],
    )

    for config in configs:
        trigger_severities = config.trigger_severities or []
        if trigger_severities and severity not in trigger_severities:
            continue

        if config.channel == NotificationConfig.Channel.WEBHOOK:
            _deliver_webhook(config, event_type, severity, payload)
        elif config.channel == NotificationConfig.Channel.SLACK:
            _deliver_slack(config, event_type, severity, payload)


def _deliver_webhook(config: NotificationConfig, event_type: str, severity: str, payload: dict):
    url = config.config.get('url', '')
    secret = config.config.get('secret', '')

    if not url:
        return

    body = json.dumps({
        'event_type': event_type,
        'severity': severity,
        'tenant_id': config.tenant_id,
        'timestamp': time.time(),
        'data': payload,
    }, default=str)

    headers = {'Content-Type': 'application/json'}
    if secret:
        sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        headers[WEBHOOK_SECRET_HEADER] = f'sha256={sig}'

    try:
        resp = httpx.post(url, content=body, headers=headers, timeout=WEBHOOK_TIMEOUT)
        logger.info('Webhook delivered to %s: %d', url, resp.status_code)
    except Exception as e:
        logger.warning('Webhook delivery failed to %s: %s', url, e)


def _deliver_slack(config: NotificationConfig, event_type: str, severity: str, payload: dict):
    url = config.config.get('webhook_url', '')
    if not url:
        return

    color_map = {'critical': '#dc2626', 'high': '#ea580c', 'medium': '#ca8a04', 'low': '#2563eb'}
    color = color_map.get(severity, '#6b7280')

    title = payload.get('title', event_type.replace('_', ' ').title())
    description = payload.get('description', payload.get('reason', ''))

    slack_body = {
        'attachments': [{
            'color': color,
            'title': f'[{severity.upper()}] {title}',
            'text': description[:2000],
            'footer': 'Zentinelle GRC',
            'ts': int(time.time()),
        }]
    }

    try:
        resp = httpx.post(url, json=slack_body, timeout=WEBHOOK_TIMEOUT)
        logger.info('Slack notification delivered: %d', resp.status_code)
    except Exception as e:
        logger.warning('Slack delivery failed: %s', e)
