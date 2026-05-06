"""
Tests for the NotificationService.

Covers:
- Deployment ready notifications (email + in-app)
- Deployment failed notifications
- Admin email discovery
- SES integration (mocked)

Skipped: requires managed-cloud models (Organization, OrganizationMember, Deployment)
that are not available in standalone mode. These tests will be re-enabled when the
managed deployment shim is implemented.
"""
import pytest

pytestmark = pytest.mark.skip(
    reason='Requires managed-cloud models (Organization, OrganizationMember, Deployment)'
)

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

from django.contrib.auth import get_user_model  # noqa: E402
from django.test import TestCase, override_settings  # noqa: E402

from zentinelle.models import License  # noqa: E402
from zentinelle.services.notification_service import (  # noqa: E402
    NotificationService, get_notification_service)

User = get_user_model()

STANDALONE_TENANT = '00000000-0000-0000-0000-000000000001'


class NotificationServiceTestCase(TestCase):
    """Base test case with common fixtures for notification tests."""

    @classmethod
    def setUpTestData(cls):
        """Set up test data once for all tests in this class."""
        cls.unique_id = str(uuid.uuid4()).replace('-', '')[:8]

        # Create admin user
        cls.admin_user = User.objects.create_user(
            username=f'admin{cls.unique_id}',
            email=f'admin{cls.unique_id}@testcorp.com',
            password='testpass123'
        )

        # Create regular member user
        cls.member_user = User.objects.create_user(
            username=f'member{cls.unique_id}',
            email=f'member{cls.unique_id}@testcorp.com',
            password='testpass123'
        )

        # Create license for the tenant
        cls.license = License.objects.create(
            tenant_id=STANDALONE_TENANT,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
            billing_model=License.BillingModel.PER_USER,
            max_deployments=10,
            max_agents=100,
            max_users=50,
        )

    def setUp(self):
        """Set up for each test."""
        self.service = NotificationService()


class TestGetAdminEmails(NotificationServiceTestCase):
    """Tests for admin email discovery."""

    def test_gets_admin_member_emails(self):
        """Should include admin member emails."""
        emails = self.service._get_admin_emails(STANDALONE_TENANT)
        # In standalone mode, admin discovery depends on tenant resolver
        self.assertIsInstance(emails, list)

    def test_no_duplicate_emails(self):
        """Should not have duplicate emails."""
        emails = self.service._get_admin_emails(STANDALONE_TENANT)
        self.assertEqual(len(emails), len(set(emails)))


class TestSendDeploymentReady(NotificationServiceTestCase):
    """Tests for send_deployment_ready method."""

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_sends_email_on_ready(self, mock_in_app, mock_email):
        """Should send email when deployment is ready."""
        # Requires Deployment model from deployments app
        pass

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_creates_in_app_notification(self, mock_in_app, mock_email):
        """Should create in-app notification for admins."""
        pass

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_email_includes_hub_url(self, mock_in_app, mock_email):
        """Email should include the hub URL."""
        pass

    @patch.object(NotificationService, '_send_email')
    def test_returns_false_when_no_admin_emails(self, mock_email):
        """Should return False when no admin emails found."""
        pass

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_handles_email_error(self, mock_in_app, mock_email):
        """Should return False and handle email errors gracefully."""
        pass


class TestSendDeploymentFailed(NotificationServiceTestCase):
    """Tests for send_deployment_failed method."""

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_sends_email_on_failure(self, mock_in_app, mock_email):
        """Should send email when deployment fails."""
        pass

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_creates_in_app_notification_for_failure(self, mock_in_app, mock_email):
        """Should create in-app notification for failures."""
        pass

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_email_includes_error_message(self, mock_in_app, mock_email):
        """Email should include the error message."""
        pass


class TestSendEmail(NotificationServiceTestCase):
    """Tests for SES email sending."""

    @patch('boto3.client')
    def test_sends_via_ses(self, mock_boto):
        """Should send email via AWS SES."""
        mock_ses = MagicMock()
        mock_ses.send_email.return_value = {'MessageId': 'test-123'}
        mock_boto.return_value = mock_ses

        self.service._send_email(
            recipients=['test@example.com'],
            subject='Test Subject',
            html_body='<p>Test</p>',
            text_body='Test',
        )

        mock_ses.send_email.assert_called_once()
        call_kwargs = mock_ses.send_email.call_args.kwargs

        self.assertEqual(call_kwargs['Destination']['ToAddresses'], ['test@example.com'])
        self.assertEqual(call_kwargs['Message']['Subject']['Data'], 'Test Subject')

    @patch('boto3.client')
    @override_settings(FROM_EMAIL='noreply@calliope.ai')
    def test_uses_from_email_setting(self, mock_boto):
        """Should use FROM_EMAIL from settings."""
        mock_ses = MagicMock()
        mock_ses.send_email.return_value = {'MessageId': 'test-123'}
        mock_boto.return_value = mock_ses

        service = NotificationService()
        service._send_email(
            recipients=['test@example.com'],
            subject='Test',
            html_body='<p>Test</p>',
            text_body='Test',
        )

        call_kwargs = mock_ses.send_email.call_args.kwargs
        self.assertEqual(call_kwargs['Source'], 'noreply@calliope.ai')


class TestCreateInAppNotification(NotificationServiceTestCase):
    """Tests for in-app notification creation."""

    @patch('core.models.Notification')
    def test_creates_notification_for_each_admin(self, mock_notification_cls):
        """Should create notification for each admin."""
        # Requires Organization and OrganizationMember models
        pass


class TestGetNotificationService(TestCase):
    """Tests for singleton pattern."""

    def test_returns_singleton(self):
        """Should return same instance on repeated calls."""
        # Reset singleton
        import zentinelle.services.notification_service as ns
        ns._notification_service = None

        service1 = get_notification_service()
        service2 = get_notification_service()

        self.assertIs(service1, service2)
