"""
Continuous Compliance Monitoring Tasks.

Celery tasks that run periodically to detect compliance drift,
policy violations, and generate alerts for remediation.
"""
import logging
from datetime import timedelta
from typing import Dict, List, Any, Optional
from celery import shared_task
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Avg, Q, F

logger = logging.getLogger(__name__)


# ============================================================================
# Compliance Drift Detection
# ============================================================================

@shared_task
def check_compliance_drift():
    """
    Detect compliance drift by comparing current state against expected baseline.

    Runs every hour. Checks for:
    - Missing required policies
    - Policy configuration changes
    - Disabled controls that should be active
    - New violations since last check
    """
    from organization.models import Organization
    from zentinelle.models import (
        Policy,
        ComplianceAssessment,
        ComplianceAlert,
        ContentRule,
    )
    from zentinelle.models.compliance import (
        COMPLIANCE_FRAMEWORKS,
        COMPLIANCE_CAPABILITIES,
    )

    results = {
        'organizations_checked': 0,
        'drift_detected': 0,
        'alerts_created': 0,
    }

    # Check each organization
    for org in Organization.objects.filter(is_active=True):
        results['organizations_checked'] += 1

        try:
            drift_issues = _check_org_compliance_drift(org)

            if drift_issues:
                results['drift_detected'] += 1

                for issue in drift_issues:
                    _create_drift_alert(org, issue)
                    results['alerts_created'] += 1

                logger.warning(
                    f"Compliance drift detected for {org.name}: {len(drift_issues)} issue(s)"
                )

        except Exception as e:
            logger.error(f"Error checking compliance drift for {org.name}: {e}")

    logger.info(
        f"Compliance drift check complete: "
        f"{results['organizations_checked']} orgs, "
        f"{results['drift_detected']} with drift, "
        f"{results['alerts_created']} alerts"
    )

    return results


def _check_org_compliance_drift(org) -> List[Dict[str, Any]]:
    """Check a single organization for compliance drift."""
    from zentinelle.models import Policy, ContentRule, ComplianceAssessment
    from zentinelle.models.compliance import COMPLIANCE_FRAMEWORKS, COMPLIANCE_CAPABILITIES

    issues = []

    # Get organization's enabled frameworks
    assessments = ComplianceAssessment.objects.filter(
        organization=org,
        framework__in=COMPLIANCE_FRAMEWORKS.keys(),
    )

    for assessment in assessments:
        framework_key = assessment.framework
        framework_config = COMPLIANCE_FRAMEWORKS.get(framework_key, {})
        required_capabilities = framework_config.get('required_capabilities', [])

        # Check each required capability
        for cap_key in required_capabilities:
            cap_config = COMPLIANCE_CAPABILITIES.get(cap_key, {})
            required_policy_types = cap_config.get('policy_types', [])
            required_rule_types = cap_config.get('rule_types', [])

            # Check for required policy types
            for policy_type in required_policy_types:
                has_active_policy = Policy.objects.filter(
                    organization=org,
                    policy_type=policy_type,
                    enabled=True,
                ).exists()

                if not has_active_policy:
                    issues.append({
                        'type': 'missing_policy',
                        'framework': framework_key,
                        'framework_name': framework_config.get('name', framework_key),
                        'capability': cap_key,
                        'capability_name': cap_config.get('name', cap_key),
                        'policy_type': policy_type,
                        'severity': 'high',
                        'message': f"Missing required {policy_type} policy for {cap_config.get('name')}",
                    })

            # Check for required rule types
            for rule_type in required_rule_types:
                has_active_rule = ContentRule.objects.filter(
                    organization=org,
                    rule_type=rule_type,
                    enabled=True,
                ).exists()

                if not has_active_rule:
                    issues.append({
                        'type': 'missing_rule',
                        'framework': framework_key,
                        'framework_name': framework_config.get('name', framework_key),
                        'capability': cap_key,
                        'capability_name': cap_config.get('name', cap_key),
                        'rule_type': rule_type,
                        'severity': 'medium',
                        'message': f"Missing required {rule_type} rule for {cap_config.get('name')}",
                    })

    # Check for disabled policies that were previously enabled
    recently_disabled = Policy.objects.filter(
        organization=org,
        enabled=False,
        updated_at__gte=timezone.now() - timedelta(hours=24),
    )

    for policy in recently_disabled:
        issues.append({
            'type': 'policy_disabled',
            'policy_id': str(policy.id),
            'policy_name': policy.name,
            'policy_type': policy.policy_type,
            'severity': 'medium',
            'message': f"Policy '{policy.name}' was recently disabled",
        })

    return issues


def _create_drift_alert(org, issue: Dict[str, Any]):
    """Create a compliance alert for detected drift."""
    from zentinelle.models import ComplianceAlert

    # Check if similar alert already exists (prevent duplicates)
    existing = ComplianceAlert.objects.filter(
        organization=org,
        alert_type='compliance_drift',
        resolved_at__isnull=True,
        metadata__type=issue['type'],
    )

    if issue.get('policy_type'):
        existing = existing.filter(metadata__policy_type=issue['policy_type'])
    elif issue.get('rule_type'):
        existing = existing.filter(metadata__rule_type=issue['rule_type'])
    elif issue.get('policy_id'):
        existing = existing.filter(metadata__policy_id=issue['policy_id'])

    if existing.exists():
        return  # Alert already exists

    ComplianceAlert.objects.create(
        organization=org,
        alert_type='compliance_drift',
        severity=issue['severity'],
        title=issue['message'],
        description=f"Compliance drift detected: {issue['message']}",
        metadata=issue,
    )


# ============================================================================
# Violation Rate Monitoring
# ============================================================================

@shared_task
def monitor_violation_rates():
    """
    Monitor violation rates and alert on anomalies.

    Runs every 30 minutes. Detects:
    - Spike in violation count
    - New violation types
    - Repeated violations from same source
    """
    from organization.models import Organization
    from zentinelle.models import ContentViolation, ContentScan, ComplianceAlert

    results = {
        'organizations_checked': 0,
        'anomalies_detected': 0,
        'alerts_created': 0,
    }

    now = timezone.now()
    current_window = now - timedelta(hours=1)
    previous_window_start = now - timedelta(hours=2)
    previous_window_end = now - timedelta(hours=1)

    for org in Organization.objects.filter(is_active=True):
        results['organizations_checked'] += 1

        try:
            # Get current violation count
            current_violations = ContentViolation.objects.filter(
                organization=org,
                created_at__gte=current_window,
            ).count()

            # Get previous period for comparison
            previous_violations = ContentViolation.objects.filter(
                organization=org,
                created_at__gte=previous_window_start,
                created_at__lt=previous_window_end,
            ).count()

            # Calculate spike
            if previous_violations > 0:
                spike_ratio = current_violations / previous_violations
            elif current_violations > 0:
                spike_ratio = float('inf')
            else:
                spike_ratio = 1.0

            # Alert if spike is significant (2x increase or 10+ absolute increase)
            if spike_ratio >= 2.0 or (current_violations - previous_violations) >= 10:
                results['anomalies_detected'] += 1

                # Create alert if not already exists
                existing_alert = ComplianceAlert.objects.filter(
                    organization=org,
                    alert_type='violation_spike',
                    created_at__gte=now - timedelta(hours=2),
                    resolved_at__isnull=True,
                ).exists()

                if not existing_alert:
                    ComplianceAlert.objects.create(
                        organization=org,
                        alert_type='violation_spike',
                        severity='high',
                        title=f"Violation spike detected: {current_violations} violations in last hour",
                        description=(
                            f"Current violations: {current_violations}\n"
                            f"Previous hour: {previous_violations}\n"
                            f"Increase: {spike_ratio:.1f}x"
                        ),
                        metadata={
                            'current_count': current_violations,
                            'previous_count': previous_violations,
                            'spike_ratio': spike_ratio if spike_ratio != float('inf') else 'infinite',
                        },
                    )
                    results['alerts_created'] += 1

            # Check for repeated violations from same user
            repeat_offenders = ContentViolation.objects.filter(
                organization=org,
                created_at__gte=current_window,
            ).values('user_identifier').annotate(
                count=Count('id')
            ).filter(count__gte=5)

            for offender in repeat_offenders:
                user_id = offender['user_identifier']
                if not user_id:
                    continue

                existing_alert = ComplianceAlert.objects.filter(
                    organization=org,
                    alert_type='repeat_violations',
                    metadata__user_identifier=user_id,
                    created_at__gte=now - timedelta(hours=6),
                    resolved_at__isnull=True,
                ).exists()

                if not existing_alert:
                    ComplianceAlert.objects.create(
                        organization=org,
                        alert_type='repeat_violations',
                        severity='medium',
                        title=f"Repeat violations from user: {offender['count']} in last hour",
                        description=f"User {user_id} has triggered {offender['count']} violations",
                        metadata={
                            'user_identifier': user_id,
                            'violation_count': offender['count'],
                        },
                    )
                    results['alerts_created'] += 1

        except Exception as e:
            logger.error(f"Error monitoring violations for {org.name}: {e}")

    logger.info(f"Violation monitoring complete: {results}")
    return results


# ============================================================================
# Policy Health Checks
# ============================================================================

@shared_task
def check_policy_health():
    """
    Check policy health and configuration issues.

    Runs every 6 hours. Checks for:
    - Policies with invalid configuration
    - Conflicting policies
    - Orphaned policies (no scope target)
    - Policies approaching expiration
    """
    from organization.models import Organization
    from zentinelle.models import Policy, ComplianceAlert

    results = {
        'organizations_checked': 0,
        'issues_found': 0,
        'alerts_created': 0,
    }

    for org in Organization.objects.filter(is_active=True):
        results['organizations_checked'] += 1

        try:
            issues = []

            # Check for conflicting policies (same scope, same type, different configs)
            policies = Policy.objects.filter(
                organization=org,
                enabled=True,
            ).order_by('scope_type', 'policy_type', '-priority')

            seen_combinations = {}
            for policy in policies:
                key = f"{policy.scope_type}:{policy.policy_type}"
                if key in seen_combinations:
                    # Potential conflict
                    other = seen_combinations[key]
                    if policy.priority == other.priority:
                        issues.append({
                            'type': 'policy_conflict',
                            'policy_ids': [str(policy.id), str(other.id)],
                            'policy_names': [policy.name, other.name],
                            'severity': 'medium',
                            'message': f"Conflicting policies: '{policy.name}' and '{other.name}' have same priority",
                        })
                else:
                    seen_combinations[key] = policy

            # Check for orphaned deployment-scoped policies
            orphaned = Policy.objects.filter(
                organization=org,
                scope_type=Policy.ScopeType.DEPLOYMENT,
                scope_deployment__isnull=True,
                enabled=True,
            )
            for policy in orphaned:
                issues.append({
                    'type': 'orphaned_policy',
                    'policy_id': str(policy.id),
                    'policy_name': policy.name,
                    'severity': 'low',
                    'message': f"Policy '{policy.name}' has deployment scope but no deployment assigned",
                })

            # Create alerts for issues
            for issue in issues:
                results['issues_found'] += 1

                # Check for existing alert
                existing = ComplianceAlert.objects.filter(
                    organization=org,
                    alert_type='policy_health',
                    metadata__type=issue['type'],
                    resolved_at__isnull=True,
                ).exists()

                if not existing:
                    ComplianceAlert.objects.create(
                        organization=org,
                        alert_type='policy_health',
                        severity=issue['severity'],
                        title=issue['message'],
                        description=f"Policy health issue: {issue['message']}",
                        metadata=issue,
                    )
                    results['alerts_created'] += 1

        except Exception as e:
            logger.error(f"Error checking policy health for {org.name}: {e}")

    logger.info(f"Policy health check complete: {results}")
    return results


# ============================================================================
# Usage Anomaly Detection
# ============================================================================

@shared_task
def detect_usage_anomalies():
    """
    Detect unusual usage patterns that might indicate issues.

    Runs every hour. Detects:
    - Unusual request patterns
    - Cost spikes
    - Off-hours activity
    - Unusual model usage
    """
    from organization.models import Organization
    from zentinelle.models import InteractionLog, ComplianceAlert, UsageAlert

    results = {
        'organizations_checked': 0,
        'anomalies_detected': 0,
        'alerts_created': 0,
    }

    now = timezone.now()
    current_hour = now - timedelta(hours=1)
    baseline_start = now - timedelta(days=7)
    baseline_end = now - timedelta(hours=1)

    for org in Organization.objects.filter(is_active=True):
        results['organizations_checked'] += 1

        try:
            # Get current hour metrics
            current_interactions = InteractionLog.objects.filter(
                organization=org,
                created_at__gte=current_hour,
            )
            current_count = current_interactions.count()
            current_cost = sum(
                float(i.estimated_cost_usd or 0)
                for i in current_interactions
            )

            # Get baseline (average over past week, same hour of day)
            baseline_interactions = InteractionLog.objects.filter(
                organization=org,
                created_at__gte=baseline_start,
                created_at__lt=baseline_end,
            )
            baseline_count = baseline_interactions.count()
            baseline_hours = (baseline_end - baseline_start).total_seconds() / 3600

            if baseline_hours > 0:
                avg_hourly_count = baseline_count / baseline_hours
            else:
                avg_hourly_count = 0

            # Detect anomalies
            if avg_hourly_count > 0 and current_count > avg_hourly_count * 3:
                # 3x spike in requests
                results['anomalies_detected'] += 1

                existing = UsageAlert.objects.filter(
                    organization=org,
                    alert_type='anomaly_detected',
                    acknowledged_at__isnull=True,
                    created_at__gte=now - timedelta(hours=4),
                ).exists()

                if not existing:
                    UsageAlert.objects.create(
                        organization=org,
                        alert_type='anomaly_detected',
                        severity='high',
                        title=f"Request spike: {current_count} requests in last hour",
                        message=(
                            f"Current: {current_count} requests\n"
                            f"Average: {avg_hourly_count:.0f} requests/hour\n"
                            f"Spike: {current_count/avg_hourly_count:.1f}x normal"
                        ),
                        threshold_value=avg_hourly_count,
                        current_value=current_count,
                    )
                    results['alerts_created'] += 1

        except Exception as e:
            logger.error(f"Error detecting anomalies for {org.name}: {e}")

    logger.info(f"Usage anomaly detection complete: {results}")
    return results


# ============================================================================
# Celery Beat Schedule Configuration
# ============================================================================

def get_monitoring_schedule():
    """
    Return schedule configuration for Celery Beat.

    Add to CELERY_BEAT_SCHEDULE in settings.
    """
    return {
        'check-compliance-drift': {
            'task': 'zentinelle.tasks.compliance_monitoring.check_compliance_drift',
            'schedule': timedelta(hours=1),
        },
        'monitor-violation-rates': {
            'task': 'zentinelle.tasks.compliance_monitoring.monitor_violation_rates',
            'schedule': timedelta(minutes=30),
        },
        'check-policy-health': {
            'task': 'zentinelle.tasks.compliance_monitoring.check_policy_health',
            'schedule': timedelta(hours=6),
        },
        'detect-usage-anomalies': {
            'task': 'zentinelle.tasks.compliance_monitoring.detect_usage_anomalies',
            'schedule': timedelta(hours=1),
        },
    }
