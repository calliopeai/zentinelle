"""
Celery tasks for Infrastructure Cost Tracking.

NOTE: This module is DISABLED - do not import.
The CloudAccountConfig, InfrastructureCost, and InfrastructureCostSummary models
referenced by this module exist only in migrations, not as Python model classes.

To enable:
1. Create model classes in zentinelle/models/infrastructure_cost.py
2. Export from zentinelle/models/__init__.py
3. Add imports to zentinelle/tasks/__init__.py

Tasks for:
- Hourly cost sync from cloud providers
- Daily cost aggregation
- Sending costs to Stripe for billing
"""
import logging
from datetime import datetime, timedelta

from celery import shared_task
from django.utils import timezone
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def sync_cloud_account_costs_task(
    self,
    account_id: str,
    hours_back: int = 2,
):
    """
    Sync costs for a single cloud account.

    Args:
        account_id: UUID of CloudAccountConfig
        hours_back: How many hours back to sync (default 2 for overlap)
    """
    from zentinelle.models import CloudAccountConfig
    from zentinelle.services import CloudCostService

    try:
        account = CloudAccountConfig.objects.get(id=account_id)

        if not account.is_active:
            logger.info(f"Skipping inactive account {account_id}")
            return {'status': 'skipped', 'reason': 'inactive'}

        service = CloudCostService()
        result = service.sync_costs(
            account=account,
            start_date=timezone.now() - timedelta(hours=hours_back),
            end_date=timezone.now(),
            granularity='HOURLY',
        )

        logger.info(f"Synced costs for account {account_id}: {result}")
        return result

    except CloudAccountConfig.DoesNotExist:
        logger.error(f"CloudAccountConfig {account_id} not found")
        return {'status': 'error', 'message': 'Account not found'}
    except Exception as e:
        logger.error(f"Failed to sync costs for account {account_id}: {e}")
        self.retry(exc=e)


@shared_task
def sync_all_cloud_costs():
    """
    Sync costs for all active cloud accounts.

    Should be scheduled to run hourly via Celery Beat.
    """
    from zentinelle.models import CloudAccountConfig

    accounts = CloudAccountConfig.objects.filter(is_active=True)
    queued = 0

    for account in accounts:
        sync_cloud_account_costs_task.delay(str(account.id))
        queued += 1

    logger.info(f"Queued cost sync for {queued} cloud accounts")
    return {'queued': queued}


@shared_task
def aggregate_daily_infrastructure_costs():
    """
    Aggregate hourly costs into daily summaries.

    Should be scheduled to run at 1 AM daily via Celery Beat.
    """
    from organization.models import Organization
    from zentinelle.models import CloudAccountConfig
    from zentinelle.services import CloudCostService

    yesterday = (timezone.now() - timedelta(days=1)).date()

    # Get all orgs with cloud accounts
    org_ids = CloudAccountConfig.objects.filter(
        is_active=True
    ).values_list('organization_id', flat=True).distinct()

    service = CloudCostService()
    aggregated = 0

    for org_id in org_ids:
        try:
            org = Organization.objects.get(id=org_id)
            summaries = service.aggregate_daily_costs(org, yesterday)
            aggregated += len(summaries)
        except Exception as e:
            logger.error(f"Failed to aggregate costs for org {org_id}: {e}")

    logger.info(f"Aggregated {aggregated} daily cost summaries for {len(org_ids)} orgs")
    return {'aggregated': aggregated, 'organizations': len(org_ids)}


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_infrastructure_costs_to_stripe_task(self, summary_id: str):
    """
    Send a daily cost summary to Stripe for billing.

    Args:
        summary_id: UUID of InfrastructureCostSummary
    """
    import stripe
    from zentinelle.models import InfrastructureCostSummary
    from billing.models import Subscription

    stripe.api_key = getattr(settings, 'STRIPE_SECRET_KEY', '')
    if not stripe.api_key:
        logger.warning("STRIPE_SECRET_KEY not configured")
        return {'status': 'skipped', 'reason': 'no_api_key'}

    try:
        summary = InfrastructureCostSummary.objects.get(id=summary_id)

        if summary.synced_to_billing:
            logger.debug(f"Summary {summary_id} already synced to billing")
            return {'status': 'already_synced'}

        # Get subscription for this org to get Stripe customer ID
        subscription = Subscription.objects.filter(
            organization=summary.organization,
            status__in=[Subscription.Status.ACTIVE, Subscription.Status.TRIALING]
        ).first()

        if not subscription or not subscription.stripe_customer_id:
            logger.debug(f"No Stripe customer for org {summary.organization.name}")
            return {'status': 'skipped', 'reason': 'no_stripe_customer'}

        # Send compute hours to Stripe billing meter
        # Infrastructure costs are typically compute-related
        try:
            event = stripe.billing.MeterEvent.create(
                event_name='compute_hours',
                payload={
                    'stripe_customer_id': subscription.stripe_customer_id,
                    'value': str(int(summary.compute_hours or 0)),
                },
                timestamp=int(summary.period_end.timestamp()),
            )

            summary.synced_to_billing = True
            summary.billing_event_id = event.identifier if hasattr(event, 'identifier') else 'sent'
            summary.synced_at = timezone.now()
            summary.save(update_fields=['synced_to_billing', 'billing_event_id', 'synced_at'])

            logger.info(f"Sent infrastructure costs to Stripe: {summary_id}")
            return {'status': 'success'}

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error: {e}")
            raise

    except InfrastructureCostSummary.DoesNotExist:
        logger.error(f"InfrastructureCostSummary {summary_id} not found")
        return {'status': 'error', 'message': 'Summary not found'}
    except Exception as e:
        logger.error(f"Failed to send costs to Stripe: {e}")
        self.retry(exc=e)


@shared_task
def send_pending_costs_to_stripe():
    """
    Send all pending infrastructure cost summaries to Stripe.

    Should be scheduled to run at 2 AM daily (after aggregation).
    """
    from zentinelle.models import InfrastructureCostSummary

    pending = InfrastructureCostSummary.objects.filter(
        synced_to_billing=False,
        period_type='daily',
    )

    queued = 0
    for summary in pending:
        send_infrastructure_costs_to_stripe_task.delay(str(summary.id))
        queued += 1

    logger.info(f"Queued {queued} cost summaries to send to Stripe")
    return {'queued': queued}


@shared_task
def check_infrastructure_cost_alerts():
    """
    Check for unusual infrastructure cost spikes and create alerts.

    Should be scheduled to run every 4 hours.
    """
    from decimal import Decimal
    from django.db.models import Avg, Sum
    from zentinelle.models import (
        InfrastructureCost,
        CloudAccountConfig,
        UsageAlert,
    )
    from zentinelle.services import AlertService

    service = AlertService()
    alerts_created = 0

    # Get recent hourly costs
    now = timezone.now()
    hour_ago = now - timedelta(hours=1)
    week_ago = now - timedelta(days=7)

    # Check each active account
    for account in CloudAccountConfig.objects.filter(is_active=True):
        try:
            # Get last hour's total cost
            recent_cost = InfrastructureCost.objects.filter(
                organization=account.organization,
                cloud_provider=account.cloud_provider,
                period_start__gte=hour_ago,
            ).aggregate(total=Sum('cost_amount'))['total'] or Decimal('0')

            # Get average hourly cost over past week
            avg_cost = InfrastructureCost.objects.filter(
                organization=account.organization,
                cloud_provider=account.cloud_provider,
                period_start__gte=week_ago,
                period_start__lt=hour_ago,
            ).aggregate(avg=Avg('cost_amount'))['avg'] or Decimal('0')

            # Alert if cost is 3x the average
            if avg_cost > 0 and recent_cost > avg_cost * 3:
                # Check if we already have an active alert
                existing = UsageAlert.objects.filter(
                    organization=account.organization,
                    alert_type='infrastructure_spike',
                    created_at__gte=now - timedelta(hours=4),
                    resolved=False,
                ).exists()

                if not existing:
                    UsageAlert.objects.create(
                        organization=account.organization,
                        alert_type='infrastructure_spike',
                        severity=UsageAlert.Severity.WARNING,
                        title=f"Infrastructure cost spike detected ({account.cloud_provider})",
                        message=(
                            f"Hourly infrastructure cost (${recent_cost:.2f}) is "
                            f"{(recent_cost/avg_cost):.1f}x higher than the weekly average "
                            f"(${avg_cost:.2f}/hr)"
                        ),
                        details={
                            'cloud_provider': account.cloud_provider,
                            'recent_cost': float(recent_cost),
                            'average_cost': float(avg_cost),
                            'multiplier': float(recent_cost / avg_cost) if avg_cost else 0,
                        },
                    )
                    alerts_created += 1

        except Exception as e:
            logger.error(f"Failed to check cost alerts for {account}: {e}")

    logger.info(f"Infrastructure cost check complete, created {alerts_created} alerts")
    return {'alerts_created': alerts_created}
