"""
Scheduled Celery tasks for Zentinelle.
"""
import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def check_endpoint_health():
    """
    Check endpoint health based on heartbeat timestamps.
    Run every minute via Celery Beat.

    Marks endpoints as unhealthy if no heartbeat received
    within the threshold period.
    """
    from zentinelle.models import AgentEndpoint, Event

    threshold_minutes = 5
    threshold = timezone.now() - timedelta(minutes=threshold_minutes)

    # Find endpoints that should be healthy but haven't sent heartbeat
    unhealthy_endpoints = AgentEndpoint.objects.filter(
        status=AgentEndpoint.Status.ACTIVE,
        health__in=[AgentEndpoint.Health.HEALTHY, AgentEndpoint.Health.DEGRADED],
        last_heartbeat__lt=threshold,
    )

    for endpoint in unhealthy_endpoints:
        logger.warning(f"Endpoint {endpoint.agent_id} is unhealthy - no heartbeat since {endpoint.last_heartbeat}")

        # Update health status
        endpoint.health = AgentEndpoint.Health.UNHEALTHY
        endpoint.save(update_fields=['health', 'updated_at'])

        # Create alert event
        Event.objects.create(
            tenant_id=endpoint.tenant_id,
            endpoint=endpoint,
            deployment=endpoint.deployment,
            event_type=Event.EventType.ENDPOINT_UNHEALTHY,
            event_category=Event.Category.ALERT,
            payload={
                'reason': 'No heartbeat received',
                'last_heartbeat': endpoint.last_heartbeat.isoformat() if endpoint.last_heartbeat else None,
                'threshold_minutes': threshold_minutes,
            },
            occurred_at=timezone.now(),
            status=Event.Status.PENDING,
        )

    # Also check for endpoints that were unhealthy but are now healthy
    recovered_endpoints = AgentEndpoint.objects.filter(
        status=AgentEndpoint.Status.ACTIVE,
        health=AgentEndpoint.Health.UNHEALTHY,
        last_heartbeat__gte=threshold,
    )

    for endpoint in recovered_endpoints:
        logger.info(f"Endpoint {endpoint.agent_id} has recovered")
        endpoint.health = AgentEndpoint.Health.HEALTHY
        endpoint.save(update_fields=['health', 'updated_at'])

    return {
        'unhealthy_count': unhealthy_endpoints.count(),
        'recovered_count': recovered_endpoints.count(),
    }


@shared_task
def cleanup_old_events():
    """
    Delete events older than retention period.
    Run daily via Celery Beat.
    """
    from zentinelle.models import Event, Policy

    default_retention_days = 90

    # Get retention settings from policies (simplified - in production would be per-org)
    # For now, use default

    cutoff = timezone.now() - timedelta(days=default_retention_days)

    # Delete old processed telemetry events
    deleted_count, _ = Event.objects.filter(
        event_category=Event.Category.TELEMETRY,
        status=Event.Status.PROCESSED,
        occurred_at__lt=cutoff,
    ).delete()

    logger.info(f"Deleted {deleted_count} old telemetry events")

    # Audit events have longer retention (365 days default)
    audit_cutoff = timezone.now() - timedelta(days=365)
    audit_deleted, _ = Event.objects.filter(
        event_category=Event.Category.AUDIT,
        status=Event.Status.PROCESSED,
        occurred_at__lt=audit_cutoff,
    ).delete()

    logger.info(f"Deleted {audit_deleted} old audit events")

    return {
        'telemetry_deleted': deleted_count,
        'audit_deleted': audit_deleted,
    }


@shared_task
def sync_deployment_health():
    """
    Sync deployment health status.
    Run every 5 minutes via Celery Beat.

    Checks all active deployments:
    - Verifies secrets connectivity
    - Updates last_healthy_at if accessible
    - Marks as degraded if secrets unreachable
    - Links AgentEndpoint health to Deployment status
    """
    from deployments.models import Deployment
    from deployments.services.deployment_manager import get_deployment_manager
    import asyncio

    manager = get_deployment_manager()

    active_deployments = Deployment.objects.filter(
        status__in=[
            Deployment.Status.ACTIVE,
            Deployment.Status.DEGRADED,
        ]
    )

    results = {
        'checked': 0,
        'healthy': 0,
        'degraded': 0,
        'errors': [],
    }

    for deployment in active_deployments:
        results['checked'] += 1

        try:
            # Check secrets connectivity via provisioner
            creds = manager._get_provisioner_credentials(deployment)
            client = manager._get_provisioner_client()
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(client.pull_secrets(
                    customer_name=creds["customer_name"],
                    account_id=creds.get("account_id"),
                    aws_region=creds.get("aws_region", "us-west-2"),
                    role_arn=creds.get("role_arn"),
                    external_id=creds.get("external_id"),
                ))
            finally:
                loop.close()

            if result.get("success"):
                # Secrets accessible - deployment is healthy
                deployment.last_healthy_at = timezone.now()
                if deployment.status == Deployment.Status.DEGRADED:
                    deployment.status = Deployment.Status.ACTIVE
                    logger.info(f"Deployment {deployment.id} recovered from degraded state")
                deployment.save(update_fields=['last_healthy_at', 'status', 'updated_at'])
                results['healthy'] += 1
            else:
                # Empty secrets - mark as degraded
                if deployment.status == Deployment.Status.ACTIVE:
                    deployment.status = Deployment.Status.DEGRADED
                    deployment.save(update_fields=['status', 'updated_at'])
                    logger.warning(f"Deployment {deployment.id} has no secrets")
                results['degraded'] += 1

        except Exception as e:
            # Can't reach secrets - mark as degraded
            if deployment.status == Deployment.Status.ACTIVE:
                deployment.status = Deployment.Status.DEGRADED
                deployment.save(update_fields=['status', 'updated_at'])
            results['degraded'] += 1
            results['errors'].append(f"{deployment.id}: {str(e)}")
            logger.error(f"Failed to check deployment {deployment.id}: {e}")

        # Sync AgentEndpoint health if linked
        try:
            agent = deployment.agent_endpoints.filter(
                status='active'
            ).first()

            if agent:
                # Check if agent has recent heartbeat
                if agent.last_heartbeat:
                    threshold = timezone.now() - timedelta(minutes=5)
                    if agent.last_heartbeat >= threshold:
                        # Agent is reporting - update deployment last_connected
                        if deployment.last_connected_at != agent.last_heartbeat:
                            deployment.last_connected_at = agent.last_heartbeat
                            deployment.save(update_fields=['last_connected_at', 'updated_at'])
        except Exception as e:
            logger.warning(f"Failed to sync agent health for {deployment.id}: {e}")

    logger.info(
        f"Deployment health sync: {results['checked']} checked, "
        f"{results['healthy']} healthy, {results['degraded']} degraded"
    )

    return results


@shared_task
def retry_failed_events():
    """
    Retry failed events that haven't exceeded max retries.
    Run every 15 minutes via Celery Beat.
    """
    from zentinelle.models import Event
    from zentinelle.tasks.events import process_event_batch

    max_retries = 5

    # Find failed events that can be retried
    failed_events = Event.objects.filter(
        status=Event.Status.FAILED,
        retry_count__lt=max_retries,
    ).order_by('received_at')[:100]  # Limit batch size

    if not failed_events:
        return {'retried': 0}

    # Group by category and re-queue
    telemetry_ids = []
    audit_ids = []
    alert_ids = []

    for event in failed_events:
        # Reset status to pending
        event.status = Event.Status.PENDING
        event.save(update_fields=['status'])

        event_id = str(event.id)
        if event.event_category == Event.Category.TELEMETRY:
            telemetry_ids.append(event_id)
        elif event.event_category == Event.Category.AUDIT:
            audit_ids.append(event_id)
        elif event.event_category == Event.Category.ALERT:
            alert_ids.append(event_id)

    # Re-queue
    if telemetry_ids:
        process_event_batch.apply_async(
            args=[telemetry_ids, 'telemetry'],
        )

    if audit_ids:
        process_event_batch.apply_async(
            args=[audit_ids, 'audit'],
        )

    if alert_ids:
        process_event_batch.apply_async(
            args=[alert_ids, 'alert'],
        )

    total = len(telemetry_ids) + len(audit_ids) + len(alert_ids)
    logger.info(f"Retrying {total} failed events")

    return {'retried': total}
