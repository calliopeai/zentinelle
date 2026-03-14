"""
Tests for Grace Period Service.

Tests the license grace period functionality including:
- Starting and ending grace periods
- Status checking
- Notifications
- Integration with license validation
"""
import pytest
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.utils import timezone

from organization.models import Organization
from zentinelle.models import License, Subscription
from zentinelle.services.grace_period_service import (
    GracePeriodService,
    GracePeriodStatus,
    get_grace_period_service,
    GRACE_PERIOD_DURATIONS,
)
from zentinelle.services.license_service import LicenseService


class GracePeriodServiceTest(TestCase):
    """Tests for GracePeriodService."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org", slug="test-org")
        self.subscription = Subscription.objects.create(
            organization=self.org,
            plan_code='byoc',
            status=Subscription.Status.ACTIVE,
        )
        self.license = License.objects.create(
            organization=self.org,
            subscription=self.subscription,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
        )
        self.service = GracePeriodService()

    def test_start_grace_period_payment_failed(self):
        """Test starting a grace period for payment failure."""
        result = self.service.start_grace_period(
            self.license, 'payment_failed'
        )

        self.assertTrue(result)
        self.license.refresh_from_db()

        self.assertIsNotNone(self.license.grace_period_started)
        self.assertIsNotNone(self.license.grace_period_ends)
        self.assertEqual(self.license.grace_period_reason, 'payment_failed')
        self.assertEqual(self.license.grace_period_warnings_sent, 0)

        # Check duration is 7 days for payment issues
        expected_end = self.license.grace_period_started + timedelta(days=7)
        self.assertEqual(
            self.license.grace_period_ends.date(),
            expected_end.date()
        )

    def test_start_grace_period_subscription_expired(self):
        """Test starting a grace period for subscription expiration."""
        result = self.service.start_grace_period(
            self.license, 'subscription_expired'
        )

        self.assertTrue(result)
        self.license.refresh_from_db()

        # Check duration is 3 days for subscription expiration
        expected_end = self.license.grace_period_started + timedelta(days=3)
        self.assertEqual(
            self.license.grace_period_ends.date(),
            expected_end.date()
        )

    def test_start_grace_period_custom_duration(self):
        """Test starting a grace period with custom duration."""
        result = self.service.start_grace_period(
            self.license, 'payment_failed', duration_days=14
        )

        self.assertTrue(result)
        self.license.refresh_from_db()

        # Check custom duration
        expected_end = self.license.grace_period_started + timedelta(days=14)
        self.assertEqual(
            self.license.grace_period_ends.date(),
            expected_end.date()
        )

    def test_start_grace_period_invalid_reason(self):
        """Test starting a grace period with invalid reason fails."""
        result = self.service.start_grace_period(
            self.license, 'invalid_reason'
        )

        self.assertFalse(result)
        self.license.refresh_from_db()
        self.assertIsNone(self.license.grace_period_started)

    def test_start_grace_period_already_in_grace(self):
        """Test starting a grace period when already in one."""
        # Start first grace period
        self.service.start_grace_period(self.license, 'payment_failed')
        self.license.refresh_from_db()
        original_start = self.license.grace_period_started
        original_end = self.license.grace_period_ends

        # Try to start another - should be a no-op
        result = self.service.start_grace_period(
            self.license, 'subscription_expired'
        )

        self.assertTrue(result)  # Returns True because already in grace period
        self.license.refresh_from_db()

        # Original values should be preserved
        self.assertEqual(self.license.grace_period_started, original_start)
        self.assertEqual(self.license.grace_period_ends, original_end)
        self.assertEqual(self.license.grace_period_reason, 'payment_failed')

    def test_check_grace_period_status_not_in_grace(self):
        """Test checking status when not in grace period."""
        status = self.service.check_grace_period_status(self.license)

        self.assertFalse(status.in_grace_period)
        self.assertEqual(status.days_remaining, 0)
        self.assertFalse(status.should_hard_block)
        self.assertIsNone(status.reason)

    def test_check_grace_period_status_in_grace(self):
        """Test checking status when in grace period."""
        self.service.start_grace_period(self.license, 'payment_failed')
        self.license.refresh_from_db()

        status = self.service.check_grace_period_status(self.license)

        self.assertTrue(status.in_grace_period)
        self.assertEqual(status.days_remaining, 7)
        self.assertFalse(status.should_hard_block)
        self.assertEqual(status.reason, 'payment_failed')
        self.assertEqual(status.warnings_sent, 0)

    def test_check_grace_period_status_expired(self):
        """Test checking status when grace period has expired."""
        # Set up expired grace period
        self.license.grace_period_started = timezone.now() - timedelta(days=10)
        self.license.grace_period_ends = timezone.now() - timedelta(days=3)
        self.license.grace_period_reason = 'payment_failed'
        self.license.save()

        status = self.service.check_grace_period_status(self.license)

        self.assertFalse(status.in_grace_period)
        self.assertEqual(status.days_remaining, 0)
        self.assertTrue(status.should_hard_block)
        self.assertEqual(status.reason, 'payment_failed')

    def test_end_grace_period(self):
        """Test ending a grace period."""
        self.service.start_grace_period(self.license, 'payment_failed')
        self.license.refresh_from_db()
        self.assertTrue(self.license.is_in_grace_period)

        result = self.service.end_grace_period(self.license)

        self.assertTrue(result)
        self.license.refresh_from_db()

        self.assertIsNone(self.license.grace_period_started)
        self.assertIsNone(self.license.grace_period_ends)
        self.assertEqual(self.license.grace_period_reason, '')
        self.assertFalse(self.license.is_in_grace_period)

    def test_end_grace_period_not_in_grace(self):
        """Test ending a grace period when not in one."""
        result = self.service.end_grace_period(self.license)

        self.assertTrue(result)  # Should succeed silently

    def test_extend_grace_period(self):
        """Test extending a grace period."""
        self.service.start_grace_period(self.license, 'payment_failed')
        self.license.refresh_from_db()
        original_end = self.license.grace_period_ends

        result = self.service.extend_grace_period(self.license, 5)

        self.assertTrue(result)
        self.license.refresh_from_db()

        expected_end = original_end + timedelta(days=5)
        self.assertEqual(self.license.grace_period_ends, expected_end)

    def test_extend_grace_period_not_in_grace(self):
        """Test extending a grace period when not in one fails."""
        result = self.service.extend_grace_period(self.license, 5)

        self.assertFalse(result)

    def test_get_licenses_in_grace_period(self):
        """Test getting all licenses in grace period."""
        # Create another org and license
        org2 = Organization.objects.create(name="Test Org 2", slug="test-org-2")
        license2 = License.objects.create(
            organization=org2,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
        )

        # Put first license in grace period
        self.service.start_grace_period(self.license, 'payment_failed')

        licenses = self.service.get_licenses_in_grace_period()

        self.assertEqual(licenses.count(), 1)
        self.assertIn(self.license, licenses)
        self.assertNotIn(license2, licenses)

    def test_get_licenses_with_expired_grace_period(self):
        """Test getting licenses with expired grace periods."""
        # Set up expired grace period
        self.license.grace_period_started = timezone.now() - timedelta(days=10)
        self.license.grace_period_ends = timezone.now() - timedelta(days=3)
        self.license.grace_period_reason = 'payment_failed'
        self.license.save()

        expired = self.service.get_licenses_with_expired_grace_period()

        self.assertEqual(expired.count(), 1)
        self.assertIn(self.license, expired)

    @patch('zentinelle.services.grace_period_service.get_notification_service')
    def test_send_grace_period_warning(self, mock_get_notification):
        """Test sending a grace period warning."""
        mock_notification_service = MagicMock()
        mock_notification_service._get_admin_emails.return_value = ['admin@test.com']
        mock_get_notification.return_value = mock_notification_service

        self.service.start_grace_period(self.license, 'payment_failed')
        self.license.refresh_from_db()

        # Reset warnings_sent to 0 for this test
        self.license.grace_period_warnings_sent = 0
        self.license.grace_period_last_warning_at = None
        self.license.save()

        result = self.service.send_grace_period_warning(self.license)

        self.assertTrue(result)
        self.license.refresh_from_db()
        self.assertEqual(self.license.grace_period_warnings_sent, 1)
        self.assertIsNotNone(self.license.grace_period_last_warning_at)

    @patch('zentinelle.services.grace_period_service.get_notification_service')
    def test_send_grace_period_warning_rate_limited(self, mock_get_notification):
        """Test that warnings are rate limited."""
        mock_notification_service = MagicMock()
        mock_notification_service._get_admin_emails.return_value = ['admin@test.com']
        mock_get_notification.return_value = mock_notification_service

        self.service.start_grace_period(self.license, 'payment_failed')
        self.license.refresh_from_db()

        # Send first warning
        self.service.send_grace_period_warning(self.license)

        # Try to send another - should be rate limited
        result = self.service.send_grace_period_warning(self.license)

        self.assertFalse(result)  # Rate limited
        self.license.refresh_from_db()
        self.assertEqual(self.license.grace_period_warnings_sent, 1)  # Still 1


class GracePeriodStatusTest(TestCase):
    """Tests for GracePeriodStatus dataclass."""

    def test_to_dict(self):
        """Test converting status to dictionary."""
        ends = timezone.now() + timedelta(days=5)
        status = GracePeriodStatus(
            in_grace_period=True,
            days_remaining=5,
            grace_period_ends=ends,
            reason='payment_failed',
            warnings_sent=2,
            should_hard_block=False,
        )

        result = status.to_dict()

        self.assertEqual(result['in_grace_period'], True)
        self.assertEqual(result['days_remaining'], 5)
        self.assertEqual(result['reason'], 'payment_failed')
        self.assertEqual(result['warnings_sent'], 2)
        self.assertEqual(result['should_hard_block'], False)
        self.assertIsNotNone(result['grace_period_ends'])


class LicenseModelGracePeriodTest(TestCase):
    """Tests for License model grace period properties."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org", slug="test-org")
        self.license = License.objects.create(
            organization=self.org,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
        )

    def test_is_in_grace_period_true(self):
        """Test is_in_grace_period property when in grace period."""
        now = timezone.now()
        self.license.grace_period_started = now - timedelta(days=2)
        self.license.grace_period_ends = now + timedelta(days=5)
        self.license.save()

        self.assertTrue(self.license.is_in_grace_period)

    def test_is_in_grace_period_false_not_started(self):
        """Test is_in_grace_period when not started."""
        self.assertFalse(self.license.is_in_grace_period)

    def test_is_in_grace_period_false_expired(self):
        """Test is_in_grace_period when expired."""
        now = timezone.now()
        self.license.grace_period_started = now - timedelta(days=10)
        self.license.grace_period_ends = now - timedelta(days=3)
        self.license.save()

        self.assertFalse(self.license.is_in_grace_period)

    def test_grace_period_expired_true(self):
        """Test grace_period_expired property when expired."""
        now = timezone.now()
        self.license.grace_period_started = now - timedelta(days=10)
        self.license.grace_period_ends = now - timedelta(days=3)
        self.license.save()

        self.assertTrue(self.license.grace_period_expired)

    def test_grace_period_expired_false(self):
        """Test grace_period_expired when not expired."""
        now = timezone.now()
        self.license.grace_period_started = now - timedelta(days=2)
        self.license.grace_period_ends = now + timedelta(days=5)
        self.license.save()

        self.assertFalse(self.license.grace_period_expired)

    def test_days_remaining_in_grace_period(self):
        """Test days_remaining_in_grace_period calculation."""
        now = timezone.now()
        self.license.grace_period_started = now - timedelta(days=2)
        self.license.grace_period_ends = now + timedelta(days=5)
        self.license.save()

        self.assertEqual(self.license.days_remaining_in_grace_period, 5)

    def test_days_remaining_zero_when_not_in_grace(self):
        """Test days_remaining is 0 when not in grace period."""
        self.assertEqual(self.license.days_remaining_in_grace_period, 0)

    def test_clear_grace_period(self):
        """Test clearing a grace period."""
        now = timezone.now()
        self.license.grace_period_started = now - timedelta(days=2)
        self.license.grace_period_ends = now + timedelta(days=5)
        self.license.grace_period_reason = 'payment_failed'
        self.license.grace_period_warnings_sent = 3
        self.license.grace_period_last_warning_at = now - timedelta(days=1)
        self.license.save()

        self.license.clear_grace_period()
        self.license.refresh_from_db()

        self.assertIsNone(self.license.grace_period_started)
        self.assertIsNone(self.license.grace_period_ends)
        self.assertEqual(self.license.grace_period_reason, '')
        self.assertEqual(self.license.grace_period_warnings_sent, 0)
        self.assertIsNone(self.license.grace_period_last_warning_at)


class LicenseValidationWithGracePeriodTest(TestCase):
    """Tests for license validation with grace periods."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org", slug="test-org")
        self.license = License.objects.create(
            organization=self.org,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
        )
        self.service = LicenseService()

    def test_validate_valid_license(self):
        """Test validating a valid license."""
        result = self.service.validate_online(self.license.license_key)

        self.assertTrue(result.is_valid)
        self.assertFalse(result.in_grace_period)
        self.assertIsNone(result.grace_period_info)

    def test_validate_expired_license_in_grace_period(self):
        """Test validating an expired license that's in grace period."""
        # Expire the license
        self.license.valid_until = timezone.now() - timedelta(days=1)
        self.license.save()

        # Start grace period
        grace_service = get_grace_period_service()
        grace_service.start_grace_period(self.license, 'subscription_expired')

        result = self.service.validate_online(self.license.license_key)

        # Should still be valid during grace period
        self.assertTrue(result.is_valid)
        self.assertTrue(result.in_grace_period)
        self.assertIsNotNone(result.grace_period_info)
        self.assertTrue(result.grace_period_info['in_grace_period'])
        self.assertFalse(result.grace_period_info['should_hard_block'])

    def test_validate_expired_license_grace_period_expired(self):
        """Test validating a license with expired grace period."""
        # Expire the license
        self.license.valid_until = timezone.now() - timedelta(days=10)
        self.license.status = License.Status.EXPIRED
        self.license.save()

        # Set up expired grace period
        self.license.grace_period_started = timezone.now() - timedelta(days=10)
        self.license.grace_period_ends = timezone.now() - timedelta(days=3)
        self.license.grace_period_reason = 'subscription_expired'
        self.license.save()

        result = self.service.validate_online(self.license.license_key)

        # Should NOT be valid after grace period expires
        self.assertFalse(result.is_valid)
        self.assertFalse(result.in_grace_period)
        self.assertIsNotNone(result.grace_period_info)
        self.assertTrue(result.grace_period_info['should_hard_block'])

    def test_validate_clears_grace_period_when_valid(self):
        """Test that validating a valid license clears any grace period."""
        # Set up a grace period (maybe payment was fixed)
        self.license.grace_period_started = timezone.now() - timedelta(days=2)
        self.license.grace_period_ends = timezone.now() + timedelta(days=5)
        self.license.grace_period_reason = 'payment_failed'
        self.license.save()

        result = self.service.validate_online(self.license.license_key)

        # License is valid, grace period should be cleared
        self.assertTrue(result.is_valid)
        self.assertFalse(result.in_grace_period)

        self.license.refresh_from_db()
        self.assertIsNone(self.license.grace_period_started)


class SingletonTest(TestCase):
    """Tests for singleton pattern."""

    def test_get_grace_period_service_returns_same_instance(self):
        """Test that get_grace_period_service returns the same instance."""
        service1 = get_grace_period_service()
        service2 = get_grace_period_service()

        self.assertIs(service1, service2)
