"""
Tests for License Compliance features (Issue #55 - Phase 5).

Tests cover:
- LicenseComplianceReport model
- LicenseComplianceViolation model
- LicenseComplianceService
- Celery tasks for violation detection
"""
import pytest
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone

from organization.models import Organization
from zentinelle.models import (
    License,
    LicensedUser,
    LicenseComplianceReport,
    LicenseComplianceViolation,
    AgentEndpoint,
)
from zentinelle.services.license_compliance_service import (
    LicenseComplianceService,
    license_compliance_service,
)

User = get_user_model()


class LicenseComplianceReportModelTest(TestCase):
    """Tests for LicenseComplianceReport model."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )

    def test_create_usage_report(self):
        """Test creating a usage report."""
        now = timezone.now()
        report = LicenseComplianceReport.objects.create(
            organization=self.org,
            report_type=LicenseComplianceReport.ReportType.USAGE,
            period_start=now - timedelta(days=30),
            period_end=now,
            generated_by=self.user,
        )

        self.assertEqual(report.report_type, 'usage')
        self.assertEqual(report.status, LicenseComplianceReport.Status.PENDING)
        self.assertIsNone(report.generated_at)

    def test_create_violations_report(self):
        """Test creating a violations report."""
        now = timezone.now()
        report = LicenseComplianceReport.objects.create(
            organization=self.org,
            report_type=LicenseComplianceReport.ReportType.VIOLATIONS,
            period_start=now - timedelta(days=30),
            period_end=now,
            total_violations=5,
            compliance_score=85.0,
        )

        self.assertEqual(report.report_type, 'violations')
        self.assertEqual(report.total_violations, 5)
        self.assertEqual(report.compliance_score, 85.0)

    def test_report_str_representation(self):
        """Test string representation of report."""
        now = timezone.now()
        report = LicenseComplianceReport.objects.create(
            organization=self.org,
            report_type=LicenseComplianceReport.ReportType.USAGE,
            period_start=now - timedelta(days=30),
            period_end=now,
        )

        self.assertIn('Test Org', str(report))
        self.assertIn('Usage', str(report))


class LicenseComplianceViolationModelTest(TestCase):
    """Tests for LicenseComplianceViolation model."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.license = License.objects.create(
            organization=self.org,
            license_type=License.LicenseType.MANAGED,
            max_users=10,
            max_deployments=5,
            max_agents=50,
        )

    def test_create_over_seat_limit_violation(self):
        """Test creating an over seat limit violation."""
        violation = LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            description='User count (15) exceeds license limit (10)',
            limit_value=10,
            actual_value=15,
            detected_at=timezone.now(),
        )

        self.assertEqual(violation.violation_type, 'over_seat_limit')
        self.assertEqual(violation.severity, 'warning')
        self.assertEqual(violation.status, LicenseComplianceViolation.Status.OPEN)
        self.assertTrue(violation.is_open)
        self.assertFalse(violation.is_resolved)

    def test_create_expired_license_violation(self):
        """Test creating an expired license violation."""
        violation = LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.EXPIRED_LICENSE,
            severity=LicenseComplianceViolation.Severity.CRITICAL,
            description='License expired',
            detected_at=timezone.now(),
        )

        self.assertEqual(violation.violation_type, 'expired_license')
        self.assertEqual(violation.severity, 'critical')

    def test_resolve_violation(self):
        """Test resolving a violation."""
        user = User.objects.create_user(
            username='resolver',
            email='resolver@example.com',
            password='testpass123'
        )

        violation = LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            detected_at=timezone.now(),
        )

        # Resolve the violation
        violation.status = LicenseComplianceViolation.Status.RESOLVED
        violation.resolved_at = timezone.now()
        violation.resolved_by = user
        violation.resolution_notes = 'Removed inactive users'
        violation.save()

        self.assertEqual(violation.status, 'resolved')
        self.assertTrue(violation.is_resolved)
        self.assertFalse(violation.is_open)
        self.assertEqual(violation.resolved_by, user)

    def test_violation_str_representation(self):
        """Test string representation of violation."""
        violation = LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            detected_at=timezone.now(),
        )

        self.assertIn('Test Org', str(violation))
        self.assertIn('Over Seat Limit', str(violation))


class LicenseComplianceServiceTest(TestCase):
    """Tests for LicenseComplianceService."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.license = License.objects.create(
            organization=self.org,
            license_type=License.LicenseType.MANAGED,
            max_users=10,
            max_deployments=5,
            max_agents=50,
            status=License.Status.ACTIVE,
        )
        self.service = LicenseComplianceService()

    def test_detect_no_violations(self):
        """Test detection when no violations exist."""
        violations = self.service.detect_violations(self.org)
        self.assertEqual(len(violations), 0)

    def test_detect_over_seat_limit(self):
        """Test detection of over seat limit."""
        # Create more users than the limit
        for i in range(15):
            LicensedUser.objects.create(
                license=self.license,
                organization=self.org,
                user_identifier=f'user{i}@example.com',
                status=LicensedUser.Status.ACTIVE,
                is_billable=True,
            )

        violations = self.service.detect_violations(self.org)

        # Should detect over seat limit
        seat_violations = [v for v in violations if v.violation_type == 'over_seat_limit']
        self.assertEqual(len(seat_violations), 1)
        self.assertEqual(seat_violations[0].limit_value, 10)
        self.assertEqual(seat_violations[0].actual_value, 15)

    def test_detect_expired_license(self):
        """Test detection of expired license."""
        # Set license as expired
        self.license.valid_until = timezone.now() - timedelta(days=1)
        self.license.save()

        violations = self.service.detect_violations(self.org)

        expired_violations = [v for v in violations if v.violation_type == 'expired_license']
        self.assertEqual(len(expired_violations), 1)

    def test_detect_no_license(self):
        """Test detection when no license exists."""
        self.license.delete()

        violations = self.service.detect_violations(self.org)

        # Should detect no active license
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0].violation_type, 'expired_license')

    def test_no_duplicate_violations(self):
        """Test that duplicate violations are not created."""
        # Create initial violation
        LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            detected_at=timezone.now(),
        )

        # Create users to trigger violation
        for i in range(15):
            LicensedUser.objects.create(
                license=self.license,
                organization=self.org,
                user_identifier=f'user{i}@example.com',
                status=LicensedUser.Status.ACTIVE,
                is_billable=True,
            )

        # Run detection again
        violations = self.service.detect_violations(self.org)

        # Should not create duplicate
        self.assertEqual(len(violations), 0)

        # Total violations should still be 1
        total = LicenseComplianceViolation.objects.filter(
            organization=self.org,
            violation_type='over_seat_limit'
        ).count()
        self.assertEqual(total, 1)

    def test_resolve_violation(self):
        """Test resolving a violation through service."""
        violation = LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            detected_at=timezone.now(),
        )

        success, message = self.service.resolve_violation(
            violation_id=str(violation.id),
            resolution_notes='Issue resolved',
        )

        self.assertTrue(success)
        violation.refresh_from_db()
        self.assertEqual(violation.status, LicenseComplianceViolation.Status.RESOLVED)

    def test_resolve_already_resolved_violation(self):
        """Test resolving an already resolved violation."""
        violation = LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            status=LicenseComplianceViolation.Status.RESOLVED,
            detected_at=timezone.now(),
        )

        success, message = self.service.resolve_violation(
            violation_id=str(violation.id),
            resolution_notes='Trying again',
        )

        self.assertFalse(success)
        self.assertIn('already resolved', message)

    def test_acknowledge_violation(self):
        """Test acknowledging a violation."""
        violation = LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            detected_at=timezone.now(),
        )

        success, message = self.service.acknowledge_violation(str(violation.id))

        self.assertTrue(success)
        violation.refresh_from_db()
        self.assertEqual(violation.status, LicenseComplianceViolation.Status.ACKNOWLEDGED)

    def test_get_compliance_summary_compliant(self):
        """Test getting compliance summary when compliant."""
        summary = self.service.get_compliance_summary(self.org)

        self.assertEqual(summary['status'], 'compliant')
        self.assertFalse(summary['has_violations'])
        self.assertEqual(summary['compliance_score'], 100.0)

    def test_get_compliance_summary_non_compliant(self):
        """Test getting compliance summary when non-compliant."""
        LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            detected_at=timezone.now(),
        )

        summary = self.service.get_compliance_summary(self.org)

        self.assertEqual(summary['status'], 'non_compliant')
        self.assertTrue(summary['has_violations'])
        self.assertEqual(summary['open_violations'], 1)

    def test_compliance_score_calculation(self):
        """Test compliance score calculation."""
        # Create multiple violations with different severities
        LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.CRITICAL,
            detected_at=timezone.now(),
        )
        LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.DEPLOYMENT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            detected_at=timezone.now(),
        )

        summary = self.service.get_compliance_summary(self.org)

        # Score should be reduced based on severity weights
        # Critical=20, Warning=5, plus open penalty
        # 100 - 20 - 5 - 2*2 = 71
        self.assertLess(summary['compliance_score'], 100.0)
        self.assertGreater(summary['compliance_score'], 0.0)


class ReportGenerationTest(TestCase):
    """Tests for report generation."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.license = License.objects.create(
            organization=self.org,
            license_type=License.LicenseType.MANAGED,
            max_users=10,
            max_deployments=5,
            max_agents=50,
            status=License.Status.ACTIVE,
        )
        self.service = LicenseComplianceService()

    def test_generate_usage_report(self):
        """Test generating a usage report."""
        now = timezone.now()
        report = self.service.generate_usage_report(
            organization=self.org,
            period_start=now - timedelta(days=30),
            period_end=now,
        )

        self.assertEqual(report.report_type, 'usage')
        self.assertEqual(report.status, LicenseComplianceReport.Status.COMPLETED)
        self.assertIn('license', report.report_data)
        self.assertIn('users', report.report_data)

    def test_generate_violations_report(self):
        """Test generating a violations report."""
        # Create some violations
        LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            detected_at=timezone.now() - timedelta(days=5),
        )

        now = timezone.now()
        report = self.service.generate_violations_report(
            organization=self.org,
            period_start=now - timedelta(days=30),
            period_end=now,
        )

        self.assertEqual(report.report_type, 'violations')
        self.assertEqual(report.status, LicenseComplianceReport.Status.COMPLETED)
        self.assertEqual(report.total_violations, 1)
        self.assertIn('summary', report.report_data)
        self.assertIn('violations', report.report_data)

    def test_generate_usage_report_no_license(self):
        """Test generating a usage report when no license exists."""
        self.license.delete()

        now = timezone.now()
        report = self.service.generate_usage_report(
            organization=self.org,
            period_start=now - timedelta(days=30),
            period_end=now,
        )

        self.assertEqual(report.status, LicenseComplianceReport.Status.FAILED)
        self.assertIn('No active license', report.error_message)


class CeleryTasksTest(TestCase):
    """Tests for Celery tasks."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org", is_active=True)
        self.license = License.objects.create(
            organization=self.org,
            license_type=License.LicenseType.MANAGED,
            max_users=10,
            status=License.Status.ACTIVE,
        )

    def test_detect_license_violations_all_orgs(self):
        """Test daily violation detection task."""
        from zentinelle.tasks.license_compliance import detect_license_violations_all_orgs

        # Create users to trigger violation
        for i in range(15):
            LicensedUser.objects.create(
                license=self.license,
                organization=self.org,
                user_identifier=f'user{i}@example.com',
                status=LicensedUser.Status.ACTIVE,
                is_billable=True,
            )

        results = detect_license_violations_all_orgs()

        self.assertEqual(results['organizations_checked'], 1)
        self.assertGreater(results['violations_found'], 0)

    def test_auto_resolve_violations(self):
        """Test auto-resolution of violations."""
        from zentinelle.tasks.license_compliance import auto_resolve_violations

        # Create a violation for over seat limit
        violation = LicenseComplianceViolation.objects.create(
            organization=self.org,
            license=self.license,
            violation_type=LicenseComplianceViolation.ViolationType.OVER_SEAT_LIMIT,
            severity=LicenseComplianceViolation.Severity.WARNING,
            detected_at=timezone.now(),
            limit_value=10,
            actual_value=15,
        )

        # Now the user count is within limit (0 users)
        results = auto_resolve_violations()

        violation.refresh_from_db()
        self.assertEqual(violation.status, LicenseComplianceViolation.Status.RESOLVED)
        self.assertIn('Auto-resolved', violation.resolution_notes)
