"""
Celery tasks for incident notification dispatch.
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='zentinelle.send_incident_notification')
def send_incident_notification(incident_id: int) -> None:
    """
    Dispatch notifications for a newly created (or updated) incident.

    Loads all enabled NotificationConfig records for the incident's tenant
    where the incident severity appears in trigger_severities, then dispatches
    to each configured channel.  Errors are logged but never re-raised so that
    a notification failure cannot roll back the incident creation.
    """
    from zentinelle.models import Incident, NotificationConfig

    try:
        incident = Incident.objects.get(pk=incident_id)
    except Incident.DoesNotExist:
        logger.error("send_incident_notification: Incident %s not found", incident_id)
        return

    configs = NotificationConfig.objects.filter(
        tenant_id=incident.tenant_id,
        enabled=True,
    )

    dispatched = 0
    for cfg in configs:
        if incident.severity not in (cfg.trigger_severities or []):
            continue

        try:
            _dispatch(incident, cfg)
            dispatched += 1
        except Exception as exc:
            logger.error(
                "Notification dispatch failed for config %s (channel=%s): %s",
                cfg.id,
                cfg.channel,
                exc,
            )

    logger.info(
        "Dispatched %d notifications for incident %s (tenant=%s, severity=%s)",
        dispatched,
        incident_id,
        incident.tenant_id,
        incident.severity,
    )


def _dispatch(incident, cfg) -> None:
    """Route a single notification to the appropriate channel handler."""
    if cfg.channel == 'webhook':
        _dispatch_webhook(incident, cfg)
    elif cfg.channel == 'email':
        _dispatch_email(incident, cfg)
    elif cfg.channel == 'slack':
        _dispatch_slack(incident, cfg)
    else:
        logger.warning("Unknown notification channel: %s", cfg.channel)


def _build_payload(incident) -> dict:
    """Build a JSON-serialisable payload describing the incident."""
    return {
        'incident_id': str(incident.id),
        'tenant_id': incident.tenant_id,
        'title': incident.title,
        'severity': incident.severity,
        'status': incident.status,
        'source': incident.source,
        'created_at': incident.created_at.isoformat() if incident.created_at else None,
    }


def _dispatch_webhook(incident, cfg) -> None:
    """POST a signed JSON payload to the configured webhook URL."""
    import httpx
    from django.core.signing import Signer

    url = cfg.config.get('url', '')
    if not url:
        logger.warning("Webhook notification config %s has no url", cfg.id)
        return

    payload = _build_payload(incident)
    signer = Signer(salt='incident-notification-v1')
    signature = signer.sign(str(incident.id))

    headers = {
        'Content-Type': 'application/json',
        'X-Zentinelle-Signature': signature,
    }

    resp = httpx.post(url, json=payload, headers=headers, timeout=10.0)
    resp.raise_for_status()
    logger.debug("Webhook delivered for incident %s → %s (%s)", incident.id, url, resp.status_code)


def _dispatch_email(incident, cfg) -> None:
    """Send an email notification via Django's email backend."""
    from django.core.mail import send_mail

    recipient = cfg.config.get('email', '')
    if not recipient:
        logger.warning("Email notification config %s has no email address", cfg.id)
        return

    subject = f"[Zentinelle] Incident: {incident.title} [{incident.severity.upper()}]"
    message = (
        f"A new incident has been raised in Zentinelle.\n\n"
        f"Title:    {incident.title}\n"
        f"Severity: {incident.severity}\n"
        f"Status:   {incident.status}\n"
        f"Source:   {incident.source}\n"
        f"Tenant:   {incident.tenant_id}\n"
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=None,  # uses DEFAULT_FROM_EMAIL
        recipient_list=[recipient],
        fail_silently=False,
    )
    logger.debug("Email sent for incident %s → %s", incident.id, recipient)


def _dispatch_slack(incident, cfg) -> None:
    """Post a message to a Slack webhook URL."""
    import httpx

    url = cfg.config.get('url', '')
    if not url:
        logger.warning("Slack notification config %s has no webhook url", cfg.id)
        return

    payload = {
        'text': (
            f":rotating_light: *Incident: {incident.title}*\n"
            f"*Severity:* {incident.severity.upper()}  |  "
            f"*Status:* {incident.status}  |  "
            f"*Tenant:* `{incident.tenant_id}`"
        )
    }

    resp = httpx.post(url, json=payload, timeout=10.0)
    resp.raise_for_status()
    logger.debug("Slack message delivered for incident %s", incident.id)
