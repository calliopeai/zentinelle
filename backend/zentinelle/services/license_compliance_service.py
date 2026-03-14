"""
License Compliance Service.

Provides compliance reporting and violation detection for enterprise license management.

Features:
- Usage report generation (seats, deployments, agents)
- Violations report generation (license violations over time)
- Audit trail report generation (admin actions on licenses)
- Real-time violation detection
- Violation resolution workflow
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Count, Sum, Avg, Q, F
from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass
class ViolationSummary:
    """Summary of violations for a period."""
    total_count: int
    open_count: int
    resolved_count: int
    by_type: Dict[str, int]
    by_severity: Dict[str, int]
    first_violation: Optional[datetime]
    last_violation: Optional[datetime]


@dataclass
class UsageSummary:
    """Summary of license usage."""
    current_users: int
    max_users: int
    users_percent: float
    current_deployments: int
    max_deployments: int
    deployments_percent: float
    current_agents: int
    max_agents: int
    agents_percent: float
    is_over_limit: bool
    over_limit_details: List[str]


class LicenseComplianceService:
    """
    Service for license compliance management.

    Provides methods for:
    - Generating compliance reports (usage, violations, audit trail)
    - Detecting license violations
    - Resolving violations
    - Calculating compliance scores
    """

    # Severity weights for compliance scoring
    SEVERITY_WEIGHTS = {
        'info': 1,
        'warning': 5,
        'critical': 20,
    }

    def __init__(self):
        pass

    # =========================================================================
    # Report Generation
    # =========================================================================

    def generate_usage_report(
        self,
        organization,
        period_start: datetime,
        period_end: datetime,
        user=None
    ) -> 'LicenseComplianceReport':
        """
        Generate a license usage summary report.

        Tracks:
        - Active users over the period
        - Peak user count
        - Deployment usage
        - Agent registration count
        - Feature usage breakdown
        """
        from zentinelle.models import (
            License, LicensedUser, LicenseComplianceReport,
            MonthlyUserCount
        )
        from deployments.models import Deployment

        report = LicenseComplianceReport.objects.create(
            organization=organization,
            report_type=LicenseComplianceReport.ReportType.USAGE,
            status=LicenseComplianceReport.Status.GENERATING,
            period_start=period_start,
            period_end=period_end,
            generated_by=user,
        )

        try:
            # Get active license
            license_obj = License.objects.filter(
                organization=organization,
                status=License.Status.ACTIVE
            ).first()

            if not license_obj:
                report.status = LicenseComplianceReport.Status.FAILED
                report.error_message = "No active license found"
                report.save()
                return report

            # Get user metrics
            users_in_period = LicensedUser.objects.filter(
                organization=organization,
                last_active_at__gte=period_start,
                last_active_at__lt=period_end
            )
            current_users = users_in_period.filter(is_billable=True).count()
            peak_users = MonthlyUserCount.objects.filter(
                organization=organization,
                period_start__gte=period_start,
                period_end__lte=period_end
            ).order_by('-billable_users').first()

            # Get deployment metrics
            deployments = Deployment.objects.filter(
                organization=organization,
                status__in=[Deployment.Status.ACTIVE, Deployment.Status.PENDING]
            )
            deployment_count = deployments.count()

            # Get agent metrics
            from zentinelle.models import AgentEndpoint
            agents = AgentEndpoint.objects.filter(
                organization=organization,
                is_active=True
            )
            agent_count = agents.count()

            # Calculate usage percentages
            max_users = license_obj.max_users if license_obj.max_users != -1 else 0
            max_deployments = license_obj.max_deployments if license_obj.max_deployments != -1 else 0
            max_agents = license_obj.max_agents if license_obj.max_agents != -1 else 0

            usage_data = {
                'license': {
                    'id': str(license_obj.id),
                    'type': license_obj.license_type,
                    'status': license_obj.status,
                    'valid_until': license_obj.valid_until.isoformat() if license_obj.valid_until else None,
                },
                'users': {
                    'current': current_users,
                    'peak': peak_users.billable_users if peak_users else current_users,
                    'max': max_users,
                    'percent_used': (current_users / max_users * 100) if max_users > 0 else 0,
                    'over_limit': current_users > max_users if max_users > 0 else False,
                },
                'deployments': {
                    'current': deployment_count,
                    'max': max_deployments,
                    'percent_used': (deployment_count / max_deployments * 100) if max_deployments > 0 else 0,
                    'over_limit': deployment_count > max_deployments if max_deployments > 0 else False,
                },
                'agents': {
                    'current': agent_count,
                    'max': max_agents,
                    'percent_used': (agent_count / max_agents * 100) if max_agents > 0 else 0,
                    'over_limit': agent_count > max_agents if max_agents > 0 else False,
                },
                'features': {
                    'enabled': list(license_obj.features.keys()) if isinstance(license_obj.features, dict) else license_obj.features,
                },
                'period': {
                    'start': period_start.isoformat(),
                    'end': period_end.isoformat(),
                },
            }

            report.report_data = usage_data
            report.total_users = current_users
            report.status = LicenseComplianceReport.Status.COMPLETED
            report.generated_at = timezone.now()
            report.save()

            logger.info(f"Generated usage report for {organization.name}: {current_users} users")

        except Exception as e:
            logger.error(f"Error generating usage report: {e}")
            report.status = LicenseComplianceReport.Status.FAILED
            report.error_message = str(e)
            report.save()

        return report

    def generate_violations_report(
        self,
        organization,
        period_start: datetime,
        period_end: datetime,
        user=None
    ) -> 'LicenseComplianceReport':
        """
        Generate a report of license violations for the period.

        Includes:
        - All violations detected
        - Violations by type and severity
        - Resolution status
        - Compliance trend over time
        """
        from zentinelle.models import (
            LicenseComplianceReport, LicenseComplianceViolation
        )

        report = LicenseComplianceReport.objects.create(
            organization=organization,
            report_type=LicenseComplianceReport.ReportType.VIOLATIONS,
            status=LicenseComplianceReport.Status.GENERATING,
            period_start=period_start,
            period_end=period_end,
            generated_by=user,
        )

        try:
            # Get violations in period
            violations = LicenseComplianceViolation.objects.filter(
                organization=organization,
                detected_at__gte=period_start,
                detected_at__lt=period_end
            )

            # Group by type
            by_type = {}
            for vt in LicenseComplianceViolation.ViolationType.choices:
                count = violations.filter(violation_type=vt[0]).count()
                if count > 0:
                    by_type[vt[0]] = {
                        'count': count,
                        'label': vt[1],
                    }

            # Group by severity
            by_severity = {}
            for sev in LicenseComplianceViolation.Severity.choices:
                count = violations.filter(severity=sev[0]).count()
                if count > 0:
                    by_severity[sev[0]] = {
                        'count': count,
                        'label': sev[1],
                    }

            # Group by status
            by_status = {}
            for st in LicenseComplianceViolation.Status.choices:
                count = violations.filter(status=st[0]).count()
                if count > 0:
                    by_status[st[0]] = {
                        'count': count,
                        'label': st[1],
                    }

            # Get violation details
            violation_list = []
            for v in violations.order_by('-detected_at')[:100]:  # Limit to recent 100
                violation_list.append({
                    'id': str(v.id),
                    'type': v.violation_type,
                    'type_display': v.get_violation_type_display(),
                    'severity': v.severity,
                    'status': v.status,
                    'description': v.description,
                    'detected_at': v.detected_at.isoformat(),
                    'resolved_at': v.resolved_at.isoformat() if v.resolved_at else None,
                    'limit_value': v.limit_value,
                    'actual_value': v.actual_value,
                })

            # Calculate compliance score
            compliance_score = self._calculate_compliance_score(violations)

            violations_data = {
                'summary': {
                    'total': violations.count(),
                    'open': violations.filter(status=LicenseComplianceViolation.Status.OPEN).count(),
                    'resolved': violations.filter(status__in=[
                        LicenseComplianceViolation.Status.RESOLVED,
                        LicenseComplianceViolation.Status.WAIVED
                    ]).count(),
                },
                'by_type': by_type,
                'by_severity': by_severity,
                'by_status': by_status,
                'violations': violation_list,
                'compliance_score': compliance_score,
                'period': {
                    'start': period_start.isoformat(),
                    'end': period_end.isoformat(),
                },
            }

            report.report_data = violations_data
            report.total_violations = violations.count()
            report.compliance_score = compliance_score
            report.status = LicenseComplianceReport.Status.COMPLETED
            report.generated_at = timezone.now()
            report.save()

            logger.info(f"Generated violations report for {organization.name}: {violations.count()} violations")

        except Exception as e:
            logger.error(f"Error generating violations report: {e}")
            report.status = LicenseComplianceReport.Status.FAILED
            report.error_message = str(e)
            report.save()

        return report

    def generate_audit_report(
        self,
        organization,
        period_start: datetime,
        period_end: datetime,
        user=None
    ) -> 'LicenseComplianceReport':
        """
        Generate a full audit trail report.

        Includes:
        - All license-related admin actions
        - Feature access audit logs
        - Violation resolution history
        """
        from zentinelle.models import LicenseComplianceReport, AuditLog
        from billing.audit import FeatureAccessAuditLog

        report = LicenseComplianceReport.objects.create(
            organization=organization,
            report_type=LicenseComplianceReport.ReportType.AUDIT_TRAIL,
            status=LicenseComplianceReport.Status.GENERATING,
            period_start=period_start,
            period_end=period_end,
            generated_by=user,
        )

        try:
            # Get admin audit logs
            admin_logs = AuditLog.objects.filter(
                organization=organization,
                timestamp__gte=period_start,
                timestamp__lt=period_end,
                resource_type__in=['license', 'subscription', 'deployment', 'endpoint']
            ).order_by('-timestamp')

            admin_log_list = []
            for log in admin_logs[:200]:
                admin_log_list.append({
                    'id': str(log.id),
                    'action': log.action,
                    'resource_type': log.resource_type,
                    'resource_id': log.resource_id,
                    'resource_name': log.resource_name,
                    'user': log.user.username if log.user else None,
                    'timestamp': log.timestamp.isoformat(),
                    'changes': log.changes,
                    'ip_address': log.ip_address,
                })

            # Get feature access logs
            feature_logs = FeatureAccessAuditLog.objects.filter(
                organization=organization,
                timestamp__gte=period_start,
                timestamp__lt=period_end
            ).order_by('-timestamp')

            feature_log_list = []
            for log in feature_logs[:200]:
                feature_log_list.append({
                    'id': str(log.id),
                    'feature': log.feature_name,
                    'action': log.action,
                    'granted': log.decision_granted,
                    'reason': log.decision_reason,
                    'user': log.user.username if log.user else None,
                    'timestamp': log.timestamp.isoformat(),
                })

            # Summary stats
            total_actions = admin_logs.count()
            actions_by_type = admin_logs.values('action').annotate(
                count=Count('id')
            )

            audit_data = {
                'summary': {
                    'total_admin_actions': total_actions,
                    'total_feature_checks': feature_logs.count(),
                    'feature_denials': feature_logs.filter(decision_granted=False).count(),
                },
                'actions_by_type': {
                    item['action']: item['count'] for item in actions_by_type
                },
                'admin_logs': admin_log_list,
                'feature_access_logs': feature_log_list,
                'period': {
                    'start': period_start.isoformat(),
                    'end': period_end.isoformat(),
                },
            }

            report.report_data = audit_data
            report.status = LicenseComplianceReport.Status.COMPLETED
            report.generated_at = timezone.now()
            report.save()

            logger.info(f"Generated audit report for {organization.name}")

        except Exception as e:
            logger.error(f"Error generating audit report: {e}")
            report.status = LicenseComplianceReport.Status.FAILED
            report.error_message = str(e)
            report.save()

        return report

    # =========================================================================
    # Violation Detection
    # =========================================================================

    def detect_violations(self, organization) -> List['LicenseComplianceViolation']:
        """
        Scan for current license violations.

        Checks:
        - Seat limits (users vs max_users)
        - Deployment limits
        - Agent limits
        - License expiration
        - Feature usage authorization
        """
        from zentinelle.models import (
            License, LicensedUser, LicenseComplianceViolation, AgentEndpoint
        )
        from deployments.models import Deployment

        violations_found = []

        # Get active license
        license_obj = License.objects.filter(
            organization=organization,
            status=License.Status.ACTIVE
        ).first()

        if not license_obj:
            # No license - critical violation
            violation = self._create_violation(
                organization=organization,
                license_obj=None,
                violation_type=LicenseComplianceViolation.ViolationType.EXPIRED_LICENSE,
                severity=LicenseComplianceViolation.Severity.CRITICAL,
                description="No active license found for organization",
                details={'reason': 'no_active_license'}
            )
            if violation:
                violations_found.append(violation)
            return violations_found

        # Check license expiration
        if license_obj.is_expired:
            violation = self._create_violation(
                organization=organization,
                license_obj=license_obj,
                violation_type=LicenseComplianceViolation.ViolationType.EXPIRED_LICENSE,
                severity=LicenseComplianceViolation.Severity.CRITICAL,
                description=f"License expired on {license_obj.valid_until}",
                details={
                    'valid_until': license_obj.valid_until.isoformat() if license_obj.valid_until else None
                }
            )
            if violation:
                violations_found.append(violation)

        # Check seat limits
        if license_obj.max_users > 0:
            current_users = LicensedUser.count_active_for_license(license_obj)
            if current_users > license_obj.max_users:
                violation = self._create_violation(
                    organization=organization,
                    license_obj=license_obj,
                    violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
                    severity=LicenseComplianceViolation.Severity.WARNING,
                    description=f"User count ({current_users}) exceeds license limit ({license_obj.max_users})",
                    limit_value=license_obj.max_users,
                    actual_value=current_users,
                    details={'excess': current_users - license_obj.max_users}
                )
                if violation:
                    violations_found.append(violation)

        # Check deployment limits
        if license_obj.max_deployments > 0:
            current_deployments = Deployment.objects.filter(
                organization=organization,
                status__in=[Deployment.Status.ACTIVE, Deployment.Status.PENDING]
            ).count()
            if current_deployments > license_obj.max_deployments:
                violation = self._create_violation(
                    organization=organization,
                    license_obj=license_obj,
                    violation_type=LicenseComplianceViolation.ViolationType.DEPLOYMENT_LIMIT,
                    severity=LicenseComplianceViolation.Severity.WARNING,
                    description=f"Deployment count ({current_deployments}) exceeds limit ({license_obj.max_deployments})",
                    limit_value=license_obj.max_deployments,
                    actual_value=current_deployments,
                    details={'excess': current_deployments - license_obj.max_deployments}
                )
                if violation:
                    violations_found.append(violation)

        # Check agent limits
        if license_obj.max_agents > 0:
            current_agents = AgentEndpoint.objects.filter(
                organization=organization,
                is_active=True
            ).count()
            if current_agents > license_obj.max_agents:
                violation = self._create_violation(
                    organization=organization,
                    license_obj=license_obj,
                    violation_type=LicenseComplianceViolation.ViolationType.AGENT_LIMIT,
                    severity=LicenseComplianceViolation.Severity.WARNING,
                    description=f"Agent count ({current_agents}) exceeds limit ({license_obj.max_agents})",
                    limit_value=license_obj.max_agents,
                    actual_value=current_agents,
                    details={'excess': current_agents - license_obj.max_agents}
                )
                if violation:
                    violations_found.append(violation)

        logger.info(f"Violation detection for {organization.name}: {len(violations_found)} violations found")
        return violations_found

    def _create_violation(
        self,
        organization,
        license_obj,
        violation_type: str,
        severity: str,
        description: str,
        limit_value: int = None,
        actual_value: int = None,
        details: dict = None
    ) -> Optional['LicenseComplianceViolation']:
        """
        Create a violation record if one doesn't already exist for this type.

        Returns the created violation or None if a duplicate exists.
        """
        from zentinelle.models import LicenseComplianceViolation

        # Check for existing open violation of same type
        existing = LicenseComplianceViolation.objects.filter(
            organization=organization,
            violation_type=violation_type,
            status=LicenseComplianceViolation.Status.OPEN
        ).first()

        if existing:
            # Update the existing violation with latest values
            existing.actual_value = actual_value
            existing.details = details or {}
            existing.updated_at = timezone.now()
            existing.save()
            return None

        # Create new violation
        return LicenseComplianceViolation.objects.create(
            organization=organization,
            license=license_obj,
            violation_type=violation_type,
            severity=severity,
            description=description,
            limit_value=limit_value,
            actual_value=actual_value,
            details=details or {},
            detected_at=timezone.now(),
        )

    # =========================================================================
    # Violation Resolution
    # =========================================================================

    def resolve_violation(
        self,
        violation_id: str,
        resolution_notes: str,
        resolved_by=None,
        status: str = None
    ) -> Tuple[bool, str]:
        """
        Resolve a compliance violation.

        Args:
            violation_id: UUID of the violation
            resolution_notes: Notes describing the resolution
            resolved_by: User who resolved the violation
            status: Optional status override ('resolved' or 'waived')

        Returns:
            (success, message) tuple
        """
        from zentinelle.models import LicenseComplianceViolation

        try:
            violation = LicenseComplianceViolation.objects.get(id=violation_id)
        except LicenseComplianceViolation.DoesNotExist:
            return False, "Violation not found"

        if violation.is_resolved:
            return False, "Violation is already resolved"

        resolve_status = status or LicenseComplianceViolation.Status.RESOLVED

        with transaction.atomic():
            violation.status = resolve_status
            violation.resolved_at = timezone.now()
            violation.resolved_by = resolved_by
            violation.resolution_notes = resolution_notes
            violation.save()

        logger.info(
            f"Resolved violation {violation_id} for {violation.organization.name} "
            f"as {resolve_status}"
        )
        return True, f"Violation resolved as {resolve_status}"

    def acknowledge_violation(
        self,
        violation_id: str,
        user=None
    ) -> Tuple[bool, str]:
        """
        Acknowledge a violation without fully resolving it.

        Transitions from 'open' to 'acknowledged'.
        """
        from zentinelle.models import LicenseComplianceViolation

        try:
            violation = LicenseComplianceViolation.objects.get(id=violation_id)
        except LicenseComplianceViolation.DoesNotExist:
            return False, "Violation not found"

        if violation.status != LicenseComplianceViolation.Status.OPEN:
            return False, "Can only acknowledge open violations"

        violation.status = LicenseComplianceViolation.Status.ACKNOWLEDGED
        violation.save()

        logger.info(f"Acknowledged violation {violation_id}")
        return True, "Violation acknowledged"

    # =========================================================================
    # Compliance Scoring
    # =========================================================================

    def _calculate_compliance_score(self, violations) -> float:
        """
        Calculate a compliance score based on violations.

        Score starts at 100 and decreases based on:
        - Number of violations
        - Severity of violations
        - How long violations remain open

        Returns a score between 0-100.
        """
        if not violations.exists():
            return 100.0

        score = 100.0

        # Deduct points based on severity
        for sev, weight in self.SEVERITY_WEIGHTS.items():
            count = violations.filter(severity=sev).count()
            score -= count * weight

        # Additional deduction for open violations
        open_count = violations.filter(
            status=violations.model.Status.OPEN
        ).count()
        score -= open_count * 2  # Extra penalty for unresolved

        return max(0.0, min(100.0, score))

    def get_compliance_summary(self, organization) -> Dict[str, Any]:
        """
        Get a quick compliance summary for an organization.

        Returns current status without generating a full report.
        """
        from zentinelle.models import License, LicensedUser, LicenseComplianceViolation
        from deployments.models import Deployment

        license_obj = License.objects.filter(
            organization=organization,
            status=License.Status.ACTIVE
        ).first()

        if not license_obj:
            return {
                'status': 'no_license',
                'compliance_score': 0,
                'has_violations': True,
                'message': 'No active license found',
            }

        # Get current violations
        open_violations = LicenseComplianceViolation.objects.filter(
            organization=organization,
            status=LicenseComplianceViolation.Status.OPEN
        )

        # Get usage
        current_users = LicensedUser.count_active_for_org(organization)
        current_deployments = Deployment.objects.filter(
            organization=organization,
            status__in=[Deployment.Status.ACTIVE, Deployment.Status.PENDING]
        ).count()

        # Calculate score
        all_recent_violations = LicenseComplianceViolation.objects.filter(
            organization=organization,
            detected_at__gte=timezone.now() - timedelta(days=30)
        )
        compliance_score = self._calculate_compliance_score(all_recent_violations)

        return {
            'status': 'compliant' if not open_violations.exists() else 'non_compliant',
            'compliance_score': compliance_score,
            'has_violations': open_violations.exists(),
            'open_violations': open_violations.count(),
            'license': {
                'type': license_obj.license_type,
                'valid_until': license_obj.valid_until.isoformat() if license_obj.valid_until else None,
                'is_expired': license_obj.is_expired,
            },
            'usage': {
                'users': current_users,
                'max_users': license_obj.max_users,
                'deployments': current_deployments,
                'max_deployments': license_obj.max_deployments,
            },
        }


# Singleton instance
license_compliance_service = LicenseComplianceService()
