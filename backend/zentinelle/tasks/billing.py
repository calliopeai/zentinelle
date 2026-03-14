"""
Celery tasks for billing, usage aggregation, and licensing.

Tasks:
- aggregate_hourly_usage: Roll up raw metrics per org per hour
- aggregate_daily_usage: Roll up hourly to daily
- generate_monthly_user_counts: Snapshot user counts at end of month
- send_usage_to_stripe: Push aggregated usage to Stripe billing meters
- check_license_limits: Verify orgs are within license limits

Note: Stripe billing integration is handled in billing/tasks.py for real-time
tracking. These tasks handle aggregation and reconciliation.
"""
import logging
from datetime import datetime, timedelta
from celery import shared_task
from django.utils import timezone
from django.db.models import Sum, Count
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def aggregate_hourly_usage(self, hour: str = None):
    """
    Aggregate raw usage metrics into hourly rollups.

    Called every hour by Celery Beat.
    Aggregates the previous hour's data for all organizations.

    Args:
        hour: ISO format hour to aggregate (default: previous hour)
    """
    from zentinelle.models import UsageMetric, UsageAggregate
    from organization.models import Organization

    # Default to previous hour
    if hour:
        hour_start = datetime.fromisoformat(hour)
    else:
        now = timezone.now()
        hour_start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)

    hour_end = hour_start + timedelta(hours=1)

    logger.info(f"Aggregating usage for hour: {hour_start}")

    # Get all orgs with usage in this hour
    org_ids = UsageMetric.objects.filter(
        occurred_at__gte=hour_start,
        occurred_at__lt=hour_end,
        aggregated=False
    ).values_list('organization_id', flat=True).distinct()

    aggregated_count = 0
    for org_id in org_ids:
        try:
            org = Organization.objects.get(id=org_id)
            aggregates = UsageAggregate.aggregate_hourly(org, hour_start, hour_end)
            aggregated_count += len(aggregates)
            logger.debug(f"Aggregated {len(aggregates)} metrics for org {org.name}")
        except Exception as e:
            logger.error(f"Failed to aggregate for org {org_id}: {e}")

    logger.info(f"Created {aggregated_count} hourly aggregates")
    return aggregated_count


@shared_task(bind=True)
def aggregate_daily_usage(self, date: str = None):
    """
    Aggregate hourly usage into daily rollups.

    Called daily by Celery Beat.

    Args:
        date: ISO format date to aggregate (default: yesterday)
    """
    from zentinelle.models import UsageAggregate
    from organization.models import Organization

    # Default to yesterday
    if date:
        day_start = datetime.fromisoformat(date)
    else:
        now = timezone.now()
        day_start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    day_end = day_start + timedelta(days=1)

    logger.info(f"Aggregating daily usage for: {day_start.date()}")

    # Get hourly aggregates for this day
    hourly_aggregates = UsageAggregate.objects.filter(
        period_type=UsageAggregate.Period.HOURLY,
        period_start__gte=day_start,
        period_start__lt=day_end
    )

    # Group by org, deployment, metric_type, tool_type
    grouped = hourly_aggregates.values(
        'organization_id', 'deployment_id', 'metric_type', 'tool_type'
    ).annotate(
        total=Sum('total_value'),
        count=Sum('count'),
        unique_users=Sum('unique_users')
    )

    created_count = 0
    for group in grouped:
        try:
            UsageAggregate.objects.update_or_create(
                organization_id=group['organization_id'],
                deployment_id=group['deployment_id'],
                metric_type=group['metric_type'],
                tool_type=group['tool_type'] or '',
                period_type=UsageAggregate.Period.DAILY,
                period_start=day_start,
                defaults={
                    'period_end': day_end,
                    'total_value': group['total'] or 0,
                    'count': group['count'] or 0,
                    'unique_users': group['unique_users'] or 0,
                    'status': UsageAggregate.Status.PENDING,
                }
            )
            created_count += 1
        except Exception as e:
            logger.error(f"Failed to create daily aggregate: {e}")

    logger.info(f"Created {created_count} daily aggregates")
    return created_count


@shared_task(bind=True)
def generate_monthly_user_counts(self, year: int = None, month: int = None):
    """
    Generate monthly user count snapshots for billing.

    Called at the start of each month for the previous month.

    Args:
        year: Year to generate for (default: previous month's year)
        month: Month to generate for (default: previous month)
    """
    from zentinelle.models import License, MonthlyUserCount
    from organization.models import Organization

    # Default to previous month
    if year is None or month is None:
        now = timezone.now()
        if now.month == 1:
            year = now.year - 1
            month = 12
        else:
            year = now.year
            month = now.month - 1

    logger.info(f"Generating monthly user counts for {year}/{month:02d}")

    # Get all organizations with active licenses
    active_licenses = License.objects.filter(status=License.Status.ACTIVE)

    generated_count = 0
    for license_obj in active_licenses:
        try:
            record = MonthlyUserCount.generate_for_month(
                license_obj.organization, year, month
            )
            if record:
                generated_count += 1
                logger.debug(
                    f"Generated monthly count for {license_obj.organization.name}: "
                    f"{record.billable_users} billable users"
                )
        except Exception as e:
            logger.error(
                f"Failed to generate monthly count for {license_obj.organization.name}: {e}"
            )

    logger.info(f"Generated {generated_count} monthly user count records")
    return generated_count


@shared_task(bind=True)
def send_usage_to_stripe(self, aggregate_ids: list = None):
    """
    Send pending usage aggregates to Stripe billing meters.

    Can be called with specific IDs or will process all pending.

    Args:
        aggregate_ids: Optional list of specific aggregate IDs to send
    """
    import stripe
    from zentinelle.models import UsageAggregate, License
    from billing.models import Subscription

    stripe.api_key = getattr(settings, 'STRIPE_SECRET_KEY', '')
    if not stripe.api_key:
        logger.warning("STRIPE_SECRET_KEY not configured, skipping usage sync")
        return {'sent': 0, 'failed': 0, 'skipped': 'no_api_key'}

    logger.info("Sending usage aggregates to Stripe")

    # Get pending aggregates
    if aggregate_ids:
        aggregates = UsageAggregate.objects.filter(id__in=aggregate_ids)
    else:
        aggregates = UsageAggregate.objects.filter(
            status=UsageAggregate.Status.PENDING
        ).select_related('organization', 'deployment')

    sent_count = 0
    failed_count = 0

    # Map metric types to Stripe meter event names
    meter_event_map = {
        'api_calls': 'api_calls',
        'ai_tokens': 'tokens_used',
        'compute_hours': 'compute_hours',
        'storage_gb': 'storage_gb',
        'active_users': 'active_seats',
    }

    for aggregate in aggregates:
        try:
            # Get subscription for this org to get Stripe customer ID
            subscription = Subscription.objects.filter(
                organization=aggregate.organization,
                status__in=[Subscription.Status.ACTIVE, Subscription.Status.TRIALING]
            ).first()

            if not subscription or not subscription.stripe_customer_id:
                logger.debug(f"No Stripe customer for org {aggregate.organization.name}")
                aggregate.mark_failed("No Stripe customer")
                failed_count += 1
                continue

            # Check if this org should be billed for this type
            license_obj = License.objects.filter(
                organization=aggregate.organization,
                status=License.Status.ACTIVE
            ).first()

            if not license_obj:
                logger.warning(f"No active license for org {aggregate.organization.name}")
                aggregate.mark_failed("No active license")
                failed_count += 1
                continue

            # Skip infrastructure billing for BYOC
            if (aggregate.metric_type.startswith('compute_') or
                aggregate.metric_type.startswith('storage_') or
                aggregate.metric_type.startswith('data_transfer_')):
                if not license_obj.bill_infrastructure:
                    aggregate.mark_sent('skipped_byoc', '')
                    continue

            # Skip API billing if disabled
            if aggregate.metric_type.startswith('ai_'):
                if not license_obj.bill_api_tokens:
                    aggregate.mark_sent('skipped_no_api_billing', '')
                    continue

            # Get the Stripe meter event name
            meter_event = meter_event_map.get(aggregate.metric_type)
            if not meter_event:
                # Try to match partial names
                for key, event in meter_event_map.items():
                    if key in aggregate.metric_type:
                        meter_event = event
                        break

            if not meter_event:
                logger.warning(f"No Stripe meter for metric type: {aggregate.metric_type}")
                aggregate.mark_failed(f"No meter mapping for {aggregate.metric_type}")
                failed_count += 1
                continue

            # Send to Stripe billing meter
            try:
                event = stripe.billing.MeterEvent.create(
                    event_name=meter_event,
                    payload={
                        'stripe_customer_id': subscription.stripe_customer_id,
                        'value': str(int(aggregate.total_value)),
                    },
                    timestamp=int(aggregate.period_start.timestamp()),
                )

                aggregate.mark_sent(event.identifier if hasattr(event, 'identifier') else 'sent')
                sent_count += 1

            except stripe.error.StripeError as e:
                logger.error(f"Stripe error for aggregate {aggregate.id}: {e}")
                aggregate.mark_failed(str(e))
                failed_count += 1

        except Exception as e:
            logger.error(f"Failed to send aggregate {aggregate.id} to Stripe: {e}")
            aggregate.mark_failed(str(e))
            failed_count += 1

    logger.info(f"Sent {sent_count} usage events to Stripe, {failed_count} failed")
    return {'sent': sent_count, 'failed': failed_count}


@shared_task(bind=True)
def send_monthly_user_counts_to_stripe(self, year: int = None, month: int = None):
    """
    Send monthly user counts to Stripe for per-seat billing.

    Called after generate_monthly_user_counts.
    """
    import stripe
    from zentinelle.models import MonthlyUserCount
    from billing.models import Subscription

    stripe.api_key = getattr(settings, 'STRIPE_SECRET_KEY', '')
    if not stripe.api_key:
        logger.warning("STRIPE_SECRET_KEY not configured")
        return 0

    # Default to previous month
    if year is None or month is None:
        now = timezone.now()
        if now.month == 1:
            year = now.year - 1
            month = 12
        else:
            year = now.year
            month = now.month - 1

    logger.info(f"Sending monthly user counts to Stripe for {year}/{month:02d}")

    # Get unsent monthly counts
    counts = MonthlyUserCount.objects.filter(
        year=year,
        month=month,
        stripe_event_id='',
    ).select_related('organization', 'license')

    sent_count = 0

    for count in counts:
        try:
            # Get subscription for Stripe customer ID
            subscription = Subscription.objects.filter(
                organization=count.organization,
                status__in=[Subscription.Status.ACTIVE, Subscription.Status.TRIALING]
            ).first()

            if not subscription or not subscription.stripe_customer_id:
                logger.debug(f"No Stripe customer for org {count.organization.name}")
                continue

            # Send seat count to Stripe
            event = stripe.billing.MeterEvent.create(
                event_name='active_seats',
                payload={
                    'stripe_customer_id': subscription.stripe_customer_id,
                    'value': str(count.billable_users),
                },
                timestamp=int(count.period_end.timestamp()),
            )

            count.stripe_event_id = event.identifier if hasattr(event, 'identifier') else 'sent'
            count.sent_to_stripe_at = timezone.now()
            count.save(update_fields=['stripe_event_id', 'sent_to_stripe_at'])
            sent_count += 1

        except Exception as e:
            logger.error(f"Failed to send monthly count for {count.organization.name}: {e}")

    logger.info(f"Sent {sent_count} monthly user counts to Stripe")
    return sent_count


@shared_task(bind=True)
def check_license_limits(self):
    """
    Check all organizations against their license limits.

    Called periodically to identify orgs that may be exceeding limits.
    For managed deployments, this is enforced at user creation.
    For BYOC, this is informational for billing purposes.
    """
    from deployments.models import Deployment
    from zentinelle.models import License, LicensedUser, AgentEndpoint

    logger.info("Checking license limits across all organizations")

    alerts = []
    licenses = License.objects.filter(status=License.Status.ACTIVE)

    for license_obj in licenses:
        org = license_obj.organization
        issues = []

        # Check user limit
        active_users = LicensedUser.count_active_for_license(license_obj)
        if license_obj.max_users > 0 and active_users > license_obj.max_users:
            issues.append(f"Users: {active_users}/{license_obj.max_users}")

        # Check deployment limit
        deployments = Deployment.objects.filter(
            organization=org,
            status__in=[Deployment.Status.ACTIVE, Deployment.Status.PENDING]
        ).count()
        if license_obj.max_deployments > 0 and deployments > license_obj.max_deployments:
            issues.append(f"Deployments: {deployments}/{license_obj.max_deployments}")

        # Check agent limit
        agents = AgentEndpoint.objects.filter(
            organization=org,
            is_active=True
        ).count()
        if license_obj.max_agents > 0 and agents > license_obj.max_agents:
            issues.append(f"Agents: {agents}/{license_obj.max_agents}")

        if issues:
            alert = {
                'organization': org.name,
                'license_type': license_obj.license_type,
                'issues': issues,
            }
            alerts.append(alert)
            logger.warning(f"License limit exceeded for {org.name}: {issues}")

    if alerts:
        # Send alerts via AlertService (Slack, email, and create UsageAlert records)
        from zentinelle.services.alert_service import AlertService
        alert_service = AlertService()
        alert_service.send_license_alerts(alerts)
        logger.warning(f"Found {len(alerts)} organizations exceeding license limits")

    return alerts


@shared_task(bind=True)
def record_user_activity(self, organization_id: str, user_identifier: str, email: str = '', display_name: str = ''):
    """
    Record user activity for licensing.

    Called when a user performs an action (login, notebook spawn, etc.).
    Creates or updates LicensedUser record.

    This is queued from heartbeat/event processing to avoid blocking.
    """
    from zentinelle.models import License, LicensedUser
    from organization.models import Organization

    try:
        org = Organization.objects.get(id=organization_id)
    except Organization.DoesNotExist:
        logger.error(f"Organization not found: {organization_id}")
        return

    # Get active license
    license_obj = License.objects.filter(
        organization=org,
        status=License.Status.ACTIVE
    ).first()

    if not license_obj:
        logger.warning(f"No active license for org {org.name}")
        return

    # Get or create user
    user, created = LicensedUser.get_or_create_for_user(
        license_obj,
        user_identifier,
        email=email,
        display_name=display_name
    )

    # Record activity
    user.record_activity()

    if created:
        logger.info(f"New licensed user: {user_identifier} for {org.name}")

        # Check if we're at the limit (for managed deployments)
        if license_obj.license_type == License.LicenseType.MANAGED:
            active_count = LicensedUser.count_active_for_license(license_obj)
            if license_obj.max_users > 0 and active_count >= license_obj.max_users:
                logger.warning(
                    f"Organization {org.name} has reached user limit: "
                    f"{active_count}/{license_obj.max_users}"
                )
