"""
License Compliance Celery Tasks.

Scheduled tasks for:
- Daily violation detection across all organizations
- Weekly compliance summaries for enterprise organizations
- Monthly compliance report generation
"""
import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger(__name__)


# =============================================================================
# Daily Violation Detection
# =============================================================================

@shared_task
def detect_license_violations_all_orgs():
    """
    Daily task to scan all organizations for license violations.

    Runs every day at 2:00 AM UTC.
    Detects:
    - Over seat limit violations
    - Expired license violations
    - Deployment/agent limit violations
    """
    from organization.models import Organization
    from zentinelle.services.license_compliance_service import license_compliance_service

    results = {
        'organizations_checked': 0,
        'violations_found': 0,
        'errors': [],
    }

    # Get all active organizations
    organizations = Organization.objects.filter(is_active=True)

    for org in organizations:
        results['organizations_checked'] += 1

        try:
            violations = license_compliance_service.detect_violations(org)
            results['violations_found'] += len(violations)

            if violations:
                logger.warning(
                    f"License violations detected for {org.name}: "
                    f"{len(violations)} violation(s)"
                )

        except Exception as e:
            logger.error(f"Error detecting violations for {org.name}: {e}")
            results['errors'].append({
                'org': org.name,
                'error': str(e),
            })

    logger.info(
        f"Daily violation detection complete: "
        f"{results['organizations_checked']} orgs checked, "
        f"{results['violations_found']} violations found, "
        f"{len(results['errors'])} errors"
    )

    return results


# =============================================================================
# Weekly Compliance Summary
# =============================================================================

@shared_task
def generate_weekly_compliance_summaries():
    """
    Weekly task to generate compliance summaries for enterprise organizations.

    Runs every Monday at 6:00 AM UTC.
    Generates a usage report for the past week.
    """
    from organization.models import Organization
    from zentinelle.models import License
    from zentinelle.services.license_compliance_service import license_compliance_service

    results = {
        'reports_generated': 0,
        'organizations_skipped': 0,
        'errors': [],
    }

    now = timezone.now()
    period_end = now
    period_start = now - timedelta(days=7)

    # Get organizations with enterprise licenses
    enterprise_orgs = Organization.objects.filter(
        is_active=True,
        licenses__license_type=License.LicenseType.BYOC,
        licenses__status=License.Status.ACTIVE,
    ).distinct()

    # Also include managed licenses with high user counts (enterprise tier)
    managed_enterprise = Organization.objects.filter(
        is_active=True,
        licenses__license_type=License.LicenseType.MANAGED,
        licenses__status=License.Status.ACTIVE,
        licenses__max_users__gte=100,  # Enterprise threshold
    ).distinct()

    all_enterprise = enterprise_orgs.union(managed_enterprise)

    for org in all_enterprise:
        try:
            # Generate usage report
            report = license_compliance_service.generate_usage_report(
                organization=org,
                period_start=period_start,
                period_end=period_end,
            )

            if report.status == 'completed':
                results['reports_generated'] += 1
                logger.info(f"Generated weekly compliance report for {org.name}")
            else:
                results['errors'].append({
                    'org': org.name,
                    'error': report.error_message,
                })

        except Exception as e:
            logger.error(f"Error generating weekly report for {org.name}: {e}")
            results['errors'].append({
                'org': org.name,
                'error': str(e),
            })

    logger.info(
        f"Weekly compliance summaries complete: "
        f"{results['reports_generated']} reports generated, "
        f"{len(results['errors'])} errors"
    )

    return results


# =============================================================================
# Auto-Resolution of Violations
# =============================================================================

@shared_task
def auto_resolve_violations():
    """
    Auto-resolve violations that are no longer valid.

    Runs every 6 hours.
    Checks if the condition causing the violation has been fixed.
    """
    from organization.models import Organization
    from zentinelle.models import License, LicensedUser, LicenseComplianceViolation, AgentEndpoint
    from deployments.models import Deployment

    results = {
        'violations_checked': 0,
        'violations_resolved': 0,
        'errors': [],
    }

    # Get all open violations
    open_violations = LicenseComplianceViolation.objects.filter(
        status=LicenseComplianceViolation.Status.OPEN
    ).select_related('organization', 'license')

    for violation in open_violations:
        results['violations_checked'] += 1

        try:
            should_resolve = False
            resolution_note = ""

            # Check if violation condition is still valid
            if violation.violation_type == LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT:
                if violation.license:
                    current_users = LicensedUser.count_active_for_license(violation.license)
                    if current_users <= violation.license.max_users:
                        should_resolve = True
                        resolution_note = f"User count reduced to {current_users}"

            elif violation.violation_type == LicenseComplianceViolation.ViolationType.DEPLOYMENT_LIMIT:
                if violation.license:
                    current = Deployment.objects.filter(
                        organization=violation.organization,
                        status__in=[Deployment.Status.ACTIVE, Deployment.Status.PENDING]
                    ).count()
                    if current <= violation.license.max_deployments:
                        should_resolve = True
                        resolution_note = f"Deployment count reduced to {current}"

            elif violation.violation_type == LicenseComplianceViolation.ViolationType.AGENT_LIMIT:
                if violation.license:
                    current = AgentEndpoint.objects.filter(
                        organization=violation.organization,
                        is_active=True
                    ).count()
                    if current <= violation.license.max_agents:
                        should_resolve = True
                        resolution_note = f"Agent count reduced to {current}"

            elif violation.violation_type == LicenseComplianceViolation.ViolationType.EXPIRED_LICENSE:
                # Check if a new valid license exists
                active_license = License.objects.filter(
                    organization=violation.organization,
                    status=License.Status.ACTIVE
                ).exclude(id=violation.license_id if violation.license else None).first()

                if active_license and not active_license.is_expired:
                    should_resolve = True
                    resolution_note = f"New active license found: {active_license.license_key[:12]}..."

            if should_resolve:
                violation.status = LicenseComplianceViolation.Status.RESOLVED
                violation.resolved_at = timezone.now()
                violation.resolution_notes = f"[Auto-resolved] {resolution_note}"
                violation.save()
                results['violations_resolved'] += 1
                logger.info(f"Auto-resolved violation {violation.id}: {resolution_note}")

        except Exception as e:
            logger.error(f"Error checking violation {violation.id}: {e}")
            results['errors'].append({
                'violation_id': str(violation.id),
                'error': str(e),
            })

    logger.info(
        f"Auto-resolution complete: "
        f"{results['violations_checked']} checked, "
        f"{results['violations_resolved']} resolved"
    )

    return results


# =============================================================================
# Monthly Full Compliance Report
# =============================================================================

@shared_task
def generate_monthly_compliance_reports():
    """
    Monthly task to generate full compliance reports.

    Runs on the 1st of each month at 3:00 AM UTC.
    Generates comprehensive reports including:
    - Usage report
    - Violations report
    - Audit trail report
    """
    from organization.models import Organization
    from zentinelle.models import License, LicenseComplianceReport
    from zentinelle.services.license_compliance_service import license_compliance_service
    from dateutil.relativedelta import relativedelta

    results = {
        'usage_reports': 0,
        'violations_reports': 0,
        'audit_reports': 0,
        'errors': [],
    }

    now = timezone.now()
    # Report for previous month
    period_end = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    period_start = period_end - relativedelta(months=1)

    # Get all enterprise organizations
    enterprise_orgs = Organization.objects.filter(
        is_active=True,
        licenses__status=License.Status.ACTIVE,
        licenses__max_users__gte=50,  # At least medium-sized
    ).distinct()

    for org in enterprise_orgs:
        try:
            # Generate all three report types
            usage_report = license_compliance_service.generate_usage_report(
                organization=org,
                period_start=period_start,
                period_end=period_end,
            )
            if usage_report.status == 'completed':
                results['usage_reports'] += 1

            violations_report = license_compliance_service.generate_violations_report(
                organization=org,
                period_start=period_start,
                period_end=period_end,
            )
            if violations_report.status == 'completed':
                results['violations_reports'] += 1

            audit_report = license_compliance_service.generate_audit_report(
                organization=org,
                period_start=period_start,
                period_end=period_end,
            )
            if audit_report.status == 'completed':
                results['audit_reports'] += 1

            logger.info(f"Generated monthly compliance reports for {org.name}")

        except Exception as e:
            logger.error(f"Error generating monthly reports for {org.name}: {e}")
            results['errors'].append({
                'org': org.name,
                'error': str(e),
            })

    logger.info(
        f"Monthly compliance reports complete: "
        f"{results['usage_reports']} usage, "
        f"{results['violations_reports']} violations, "
        f"{results['audit_reports']} audit"
    )

    return results


# =============================================================================
# Celery Beat Schedule Configuration
# =============================================================================

def get_compliance_schedule():
    """
    Return schedule configuration for Celery Beat.

    Add to CELERY_BEAT_SCHEDULE in settings:
    CELERY_BEAT_SCHEDULE.update(get_compliance_schedule())
    """
    from celery.schedules import crontab

    return {
        'detect-license-violations-daily': {
            'task': 'zentinelle.tasks.license_compliance.detect_license_violations_all_orgs',
            'schedule': crontab(hour=2, minute=0),  # 2:00 AM UTC daily
        },
        'weekly-compliance-summaries': {
            'task': 'zentinelle.tasks.license_compliance.generate_weekly_compliance_summaries',
            'schedule': crontab(hour=6, minute=0, day_of_week='monday'),  # Monday 6 AM UTC
        },
        'auto-resolve-violations': {
            'task': 'zentinelle.tasks.license_compliance.auto_resolve_violations',
            'schedule': crontab(minute=0, hour='*/6'),  # Every 6 hours
        },
        'monthly-compliance-reports': {
            'task': 'zentinelle.tasks.license_compliance.generate_monthly_compliance_reports',
            'schedule': crontab(hour=3, minute=0, day_of_month=1),  # 1st of month, 3 AM UTC
        },
    }
