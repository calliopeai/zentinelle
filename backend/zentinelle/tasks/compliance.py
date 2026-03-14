"""
Celery tasks for compliance and content scanning.
"""
import logging
from celery import shared_task

from zentinelle.models import (
    ContentRule,
    ContentScan,
    InteractionLog,
    ComplianceAssessment,
)

logger = logging.getLogger(__name__)


@shared_task(
    name='zentinelle.compliance.run_compliance_check',
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def run_compliance_check_task(
    self,
    organization_id: str,
    framework_id: str = None,
    user_id: str = None,
    assessment_type: str = 'manual'
):
    """
    Run a compliance assessment and store the results.

    Creates a ComplianceAssessment record with current compliance state.
    Generates alerts for critical gaps if any frameworks have <50% coverage.
    """
    from organization.models import Organization
    from zentinelle.models.compliance import (
        get_capability_status,
        get_framework_coverage,
        FRAMEWORK_REQUIREMENTS,
        ComplianceAlert,
    )
    from django.contrib.auth import get_user_model
    from django.utils import timezone

    User = get_user_model()

    try:
        org = Organization.objects.get(id=organization_id)
    except Organization.DoesNotExist:
        logger.error(f"Organization {organization_id} not found")
        return None

    user = None
    if user_id:
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            pass

    try:
        # Get current capability status
        capability_status = get_capability_status(org)
        enabled_count = sum(1 for s in capability_status.values() if s['enabled'])
        total_count = len(capability_status)

        # Get framework coverage
        coverage = get_framework_coverage(org)

        # Filter if specific framework requested
        if framework_id:
            coverage = {k: v for k, v in coverage.items() if k == framework_id}

        # Calculate overall weighted score
        total_weight = 0
        weighted_sum = 0
        framework_scores = {}
        total_gaps = 0
        critical_gaps = 0
        high_gaps = 0

        for fw_id, cov in coverage.items():
            weight = cov['required_total']
            score = cov['required_percentage']
            gap_count = len(cov['missing_required'])

            weighted_sum += score * weight
            total_weight += weight
            total_gaps += gap_count

            # Classify gap severity based on framework importance and gap count
            fw_info = FRAMEWORK_REQUIREMENTS.get(fw_id, {})
            if gap_count > 0:
                # Critical if score < 50% or multiple missing required
                if score < 50 or gap_count >= 3:
                    critical_gaps += 1
                elif score < 70:
                    high_gaps += 1

            framework_scores[fw_id] = {
                'name': cov['name'],
                'score': score,
                'required_covered': cov['required_covered'],
                'required_total': cov['required_total'],
                'gaps': cov['missing_required'],
            }

        overall_score = weighted_sum / total_weight if total_weight > 0 else 0

        # Create assessment record
        assessment = ComplianceAssessment.objects.create(
            organization=org,
            framework_id=framework_id or '',
            triggered_by=user,
            assessment_type=assessment_type,
            overall_score=overall_score,
            capabilities_enabled=enabled_count,
            capabilities_total=total_count,
            framework_scores=framework_scores,
            total_gaps=total_gaps,
            critical_gaps=critical_gaps,
            high_gaps=high_gaps,
            status='completed',
        )

        logger.info(
            f"Compliance assessment for {org.name}: "
            f"score={overall_score:.1f}%, gaps={total_gaps} "
            f"(critical={critical_gaps}, high={high_gaps})"
        )

        # Create alerts for critical gaps (frameworks with <50% coverage)
        for fw_id, fw_data in framework_scores.items():
            if fw_data['score'] < 50 and fw_data['gaps']:
                # Check if similar alert exists recently (last 24 hours)
                existing = ComplianceAlert.objects.filter(
                    organization=org,
                    alert_type=ComplianceAlert.AlertType.THRESHOLD_EXCEEDED,
                    title__contains=fw_id,
                    created_at__gte=timezone.now() - timezone.timedelta(hours=24),
                    status__in=['open', 'acknowledged', 'investigating'],
                ).exists()

                if not existing:
                    ComplianceAlert.objects.create(
                        organization=org,
                        alert_type=ComplianceAlert.AlertType.THRESHOLD_EXCEEDED,
                        severity='high',
                        title=f"Critical compliance gap: {fw_data['name']}",
                        description=(
                            f"Framework {fw_data['name']} has only {fw_data['score']:.1f}% "
                            f"coverage ({fw_data['required_covered']}/{fw_data['required_total']} required controls). "
                            f"Missing: {', '.join(fw_data['gaps'][:5])}"
                            + (f" and {len(fw_data['gaps']) - 5} more" if len(fw_data['gaps']) > 5 else "")
                        ),
                        user_identifier='system',
                        violation_count=len(fw_data['gaps']),
                        first_violation_at=timezone.now(),
                        last_violation_at=timezone.now(),
                    )
                    logger.info(f"Created compliance gap alert for {fw_id}")

        return str(assessment.id)

    except Exception as e:
        logger.error(f"Compliance check failed for {org.name}: {e}")
        # Create failed assessment record
        ComplianceAssessment.objects.create(
            organization=org,
            framework_id=framework_id or '',
            triggered_by=user,
            assessment_type=assessment_type,
            overall_score=0,
            capabilities_enabled=0,
            capabilities_total=0,
            status='failed',
            error_message=str(e),
        )
        raise self.retry(exc=e)


@shared_task(
    name='zentinelle.compliance.process_async_scan',
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def process_async_scan(self, scan_id: str, content: str):
    """
    Process an async content scan.

    This runs the full scan pipeline in the background.
    """
    try:
        scan = ContentScan.objects.get(id=scan_id)
    except ContentScan.DoesNotExist:
        logger.error(f"Scan {scan_id} not found")
        return

    from zentinelle.services.content_scanner import ContentScanner

    try:
        scanner = ContentScanner(scan.organization)

        # Run scan
        result, updated_scan = scanner.scan(
            content=content,
            user_id=scan.user_identifier,
            endpoint=scan.endpoint,
            content_type=scan.content_type,
            scan_mode=ContentRule.ScanMode.ASYNC,
            session_id=scan.session_id,
            request_id=scan.request_id,
            token_count=scan.token_count,
            estimated_cost=float(scan.estimated_cost_usd) if scan.estimated_cost_usd else None,
        )

        logger.info(
            f"Async scan {scan_id} completed: "
            f"violations={result.has_violations}, action={result.action}"
        )

    except Exception as e:
        logger.error(f"Async scan {scan_id} failed: {e}")
        scan.status = ContentScan.ScanStatus.FAILED
        scan.save()
        raise self.retry(exc=e)


@shared_task(
    name='zentinelle.compliance.scan_interaction',
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def scan_interaction(self, interaction_id: str):
    """
    Scan a logged interaction for compliance violations.

    Scans both input and output content.
    """
    try:
        interaction = InteractionLog.objects.select_related(
            'organization', 'endpoint'
        ).get(id=interaction_id)
    except InteractionLog.DoesNotExist:
        logger.error(f"Interaction {interaction_id} not found")
        return

    from zentinelle.services.content_scanner import ContentScanner

    scanner = ContentScanner(interaction.organization)

    # Scan input
    if interaction.input_content:
        try:
            result, scan = scanner.scan(
                content=interaction.input_content,
                user_id=interaction.user_identifier,
                endpoint=interaction.endpoint,
                content_type=ContentScan.ContentType.USER_INPUT,
                scan_mode=ContentRule.ScanMode.ASYNC,
                session_id=interaction.session_id,
                request_id=interaction.request_id,
                token_count=interaction.input_token_count,
            )

            # Link scan to interaction
            interaction.scan = scan
            interaction.save(update_fields=['scan', 'updated_at'])

            logger.info(
                f"Input scan for interaction {interaction_id}: "
                f"violations={result.has_violations}"
            )

        except Exception as e:
            logger.error(f"Failed to scan input for {interaction_id}: {e}")

    # Scan output (if configured)
    if interaction.output_content:
        try:
            # Get rules that scan output
            output_rules = ContentRule.objects.filter(
                organization=interaction.organization,
                scan_output=True,
                enabled=True,
            ).exists()

            if output_rules:
                result, scan = scanner.scan(
                    content=interaction.output_content,
                    user_id=interaction.user_identifier,
                    endpoint=interaction.endpoint,
                    content_type=ContentScan.ContentType.AI_OUTPUT,
                    scan_mode=ContentRule.ScanMode.ASYNC,
                    session_id=interaction.session_id,
                    request_id=interaction.request_id,
                    token_count=interaction.output_token_count,
                )

                logger.info(
                    f"Output scan for interaction {interaction_id}: "
                    f"violations={result.has_violations}"
                )

        except Exception as e:
            logger.error(f"Failed to scan output for {interaction_id}: {e}")


@shared_task(name='zentinelle.compliance.aggregate_usage_summary')
def aggregate_usage_summary(organization_id: str, period: str = 'hourly'):
    """
    Aggregate usage data into summary records for reporting.

    Run periodically to pre-compute dashboard metrics.
    """
    from django.utils import timezone
    from datetime import timedelta
    from django.db.models import Count, Sum, Q
    from organization.models import Organization
    from zentinelle.models import UsageSummary

    try:
        org = Organization.objects.get(id=organization_id)
    except Organization.DoesNotExist:
        logger.error(f"Organization {organization_id} not found")
        return

    now = timezone.now()

    # Determine period boundaries
    if period == 'hourly':
        period_start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
        period_end = now.replace(minute=0, second=0, microsecond=0)
    elif period == 'daily':
        period_start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
        period_end = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        logger.error(f"Unknown period: {period}")
        return

    # Aggregate scans
    scan_stats = ContentScan.objects.filter(
        organization=org,
        created_at__gte=period_start,
        created_at__lt=period_end,
    ).aggregate(
        scan_count=Count('id'),
        violation_count=Count('id', filter=Q(has_violations=True)),
        blocked_count=Count('id', filter=Q(was_blocked=True)),
    )

    # Aggregate interactions
    interaction_stats = InteractionLog.objects.filter(
        organization=org,
        occurred_at__gte=period_start,
        occurred_at__lt=period_end,
    ).aggregate(
        interaction_count=Count('id'),
        input_tokens=Sum('input_token_count'),
        output_tokens=Sum('output_token_count'),
        total_tokens=Sum('total_tokens'),
        total_cost=Sum('estimated_cost_usd'),
        work_related=Count('id', filter=Q(is_work_related=True)),
        personal=Count('id', filter=Q(is_work_related=False)),
        unclassified=Count('id', filter=Q(is_work_related__isnull=True)),
    )

    # Create or update summary
    summary, created = UsageSummary.objects.update_or_create(
        organization=org,
        period=period,
        period_start=period_start,
        user_identifier='',  # Org-wide summary
        endpoint_id=None,
        deployment_id=None,
        ai_provider='',
        ai_model='',
        defaults={
            'period_end': period_end,
            'scan_count': scan_stats['scan_count'] or 0,
            'violation_count': scan_stats['violation_count'] or 0,
            'blocked_count': scan_stats['blocked_count'] or 0,
            'interaction_count': interaction_stats['interaction_count'] or 0,
            'input_tokens': interaction_stats['input_tokens'] or 0,
            'output_tokens': interaction_stats['output_tokens'] or 0,
            'total_tokens': interaction_stats['total_tokens'] or 0,
            'estimated_cost_usd': interaction_stats['total_cost'] or 0,
            'work_related_count': interaction_stats['work_related'] or 0,
            'personal_count': interaction_stats['personal'] or 0,
            'unclassified_count': interaction_stats['unclassified'] or 0,
        }
    )

    logger.info(
        f"Usage summary for {org.name} ({period}): "
        f"scans={scan_stats['scan_count']}, "
        f"violations={scan_stats['violation_count']}, "
        f"interactions={interaction_stats['interaction_count']}"
    )


@shared_task(name='zentinelle.compliance.check_repeated_violations')
def check_repeated_violations():
    """
    Check for users with repeated violations and create alerts.

    Run periodically (e.g., every 15 minutes).
    """
    from django.utils import timezone
    from datetime import timedelta
    from django.db.models import Count
    from zentinelle.models import ContentViolation, ComplianceAlert

    # Look at last hour
    one_hour_ago = timezone.now() - timedelta(hours=1)

    # Find users with multiple violations
    repeated_violators = ContentViolation.objects.filter(
        created_at__gte=one_hour_ago
    ).values(
        'scan__organization',
        'scan__user_identifier'
    ).annotate(
        violation_count=Count('id')
    ).filter(
        violation_count__gte=3  # Threshold for alert
    )

    for violator in repeated_violators:
        org_id = violator['scan__organization']
        user_id = violator['scan__user_identifier']
        count = violator['violation_count']

        # Check if alert already exists for this user recently
        existing_alert = ComplianceAlert.objects.filter(
            organization_id=org_id,
            user_identifier=user_id,
            alert_type=ComplianceAlert.AlertType.REPEATED_VIOLATIONS,
            created_at__gte=one_hour_ago,
        ).exists()

        if not existing_alert:
            # Get violation details
            violations = ContentViolation.objects.filter(
                scan__organization_id=org_id,
                scan__user_identifier=user_id,
                created_at__gte=one_hour_ago,
            ).order_by('-created_at')

            first_violation = violations.last()
            last_violation = violations.first()
            max_severity = max(violations, key=lambda v: ['info', 'low', 'medium', 'high', 'critical'].index(v.severity))

            ComplianceAlert.objects.create(
                organization_id=org_id,
                alert_type=ComplianceAlert.AlertType.REPEATED_VIOLATIONS,
                severity=max_severity.severity,
                title=f"Repeated violations detected for user {user_id}",
                description=f"User has triggered {count} content violations in the last hour.",
                user_identifier=user_id,
                violation_count=count,
                first_violation_at=first_violation.created_at,
                last_violation_at=last_violation.created_at,
            )

            logger.info(f"Created repeated violation alert for {user_id} ({count} violations)")


@shared_task(name='zentinelle.compliance.classify_interaction')
def classify_interaction(interaction_id: str):
    """
    Classify an interaction as work-related or personal.

    Uses heuristics or ML model to classify content.
    """
    try:
        interaction = InteractionLog.objects.get(id=interaction_id)
    except InteractionLog.DoesNotExist:
        return

    # Simple heuristic classification (would use ML in production)
    content = (interaction.input_content + ' ' + interaction.output_content).lower()

    work_keywords = [
        'code', 'bug', 'feature', 'deploy', 'database', 'api', 'server',
        'production', 'staging', 'test', 'pr', 'merge', 'commit', 'branch',
        'meeting', 'project', 'deadline', 'client', 'customer', 'report',
        'analysis', 'data', 'query', 'sql', 'function', 'class', 'method',
    ]

    personal_keywords = [
        'personal', 'private', 'joke', 'funny', 'game', 'movie', 'music',
        'dating', 'relationship', 'vacation', 'holiday', 'weekend', 'party',
        'recipe', 'weather', 'sports', 'news',
    ]

    work_score = sum(1 for kw in work_keywords if kw in content)
    personal_score = sum(1 for kw in personal_keywords if kw in content)

    if work_score > personal_score:
        is_work_related = True
    elif personal_score > work_score:
        is_work_related = False
    else:
        is_work_related = None  # Unknown

    # Extract topics (simple keyword extraction)
    all_keywords = work_keywords + personal_keywords
    topics = [kw for kw in all_keywords if kw in content][:10]

    interaction.is_work_related = is_work_related
    interaction.topics = topics
    interaction.classification = {
        'work_score': work_score,
        'personal_score': personal_score,
        'method': 'keyword_heuristic',
    }
    interaction.save(update_fields=['is_work_related', 'topics', 'classification', 'updated_at'])

    logger.debug(f"Classified interaction {interaction_id}: work_related={is_work_related}")
