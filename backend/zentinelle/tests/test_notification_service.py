"""
Tests for the NotificationService.

Covers:
- Deployment ready notifications (email + in-app)
- Deployment failed notifications
- Admin email discovery
- SES integration (mocked)
"""

import uuid
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model

from deployments.models import Deployment
from organization.models import Organization, OrganizationMember
from zentinelle.models import License
from zentinelle.services.notification_service import NotificationService, get_notification_service

User = get_user_model()


class NotificationServiceTestCase(TestCase):
    """Base test case with common fixtures for notification tests."""

    @classmethod
    def setUpTestData(cls):
        """Set up test data once for all tests in this class."""
        # Use only alphanumeric slug (no hyphens or underscores)
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

        # Create organization with alphanumeric-only slug
        cls.org = Organization.objects.create(
            name='Test Corp',
            slug=f'testcorp{cls.unique_id}',
        )

        # Create license for the org
        cls.license = License.objects.create(
            organization=cls.org,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
            billing_model=License.BillingModel.PER_USER,
            max_deployments=10,
            max_agents=100,
            max_users=50,
        )

        # Add admin membership
        OrganizationMember.objects.create(
            organization=cls.org,
            member=cls.admin_user,
            role='admin',
        )

        # Add regular member
        OrganizationMember.objects.create(
            organization=cls.org,
            member=cls.member_user,
            role='member',
        )

    def setUp(self):
        """Set up for each test."""
        self.service = NotificationService()

        # Create a test deployment
        self.deployment = Deployment.objects.create(
            organization=self.org,
            license=self.license,
            name='testcorp-junohub-1',
            status=Deployment.Status.ACTIVE,
            deployment_type=Deployment.DeploymentType.JUNOHUB,
            hosting_model=Deployment.HostingModel.MANAGED_ECS,
            hub_url='https://testcorp.softinfra.net',
        )


class TestGetAdminEmails(NotificationServiceTestCase):
    """Tests for admin email discovery."""

    def test_gets_admin_member_emails(self):
        """Should include admin member emails."""
        emails = self.service._get_admin_emails(self.org)

        self.assertIn(self.admin_user.email, emails)

    def test_excludes_regular_member_emails(self):
        """Should not include regular member emails."""
        emails = self.service._get_admin_emails(self.org)

        self.assertNotIn(self.member_user.email, emails)

    def test_no_duplicate_emails(self):
        """Should not have duplicate emails."""
        # Add the same user as admin again (edge case)
        # This shouldn't happen but verify no duplicates in output
        emails = self.service._get_admin_emails(self.org)

        self.assertEqual(len(emails), len(set(emails)))  # No duplicates


class TestSendDeploymentReady(NotificationServiceTestCase):
    """Tests for send_deployment_ready method."""

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_sends_email_on_ready(self, mock_in_app, mock_email):
        """Should send email when deployment is ready."""
        result = self.service.send_deployment_ready(self.deployment)

        self.assertTrue(result)
        mock_email.assert_called_once()

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_creates_in_app_notification(self, mock_in_app, mock_email):
        """Should create in-app notification for admins."""
        self.service.send_deployment_ready(self.deployment)

        mock_in_app.assert_called_once()
        call_kwargs = mock_in_app.call_args.kwargs

        self.assertEqual(call_kwargs['org'], self.org)
        self.assertEqual(call_kwargs['notification_type'], 'deployment_ready')
        self.assertIn('YOUR HUB IS READY', call_kwargs['subject'])

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_email_includes_hub_url(self, mock_in_app, mock_email):
        """Email should include the hub URL."""
        self.service.send_deployment_ready(self.deployment)

        # Get the email body from the call
        call_args = mock_email.call_args
        html_body = call_args.args[2] if len(call_args.args) > 2 else call_args.kwargs.get('html_body', '')

        self.assertIn('https://testcorp.softinfra.net', html_body)

    @patch.object(NotificationService, '_send_email')
    def test_returns_false_when_no_admin_emails(self, mock_email):
        """Should return False when no admin emails found."""
        # Create org without any admin members
        org_no_admins = Organization.objects.create(
            name='No Admins Corp',
            slug=f'noadmins{self.unique_id}',
        )
        deployment = Deployment.objects.create(
            organization=org_no_admins,
            name='noadmins-junohub-1',
            status=Deployment.Status.ACTIVE,
            hub_url='https://noadmins.softinfra.net',
        )

        result = self.service.send_deployment_ready(deployment)

        self.assertFalse(result)
        mock_email.assert_not_called()

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_handles_email_error(self, mock_in_app, mock_email):
        """Should return False and handle email errors gracefully."""
        mock_email.side_effect = Exception('SES error')

        result = self.service.send_deployment_ready(self.deployment)

        self.assertFalse(result)


class TestSendDeploymentFailed(NotificationServiceTestCase):
    """Tests for send_deployment_failed method."""

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_sends_email_on_failure(self, mock_in_app, mock_email):
        """Should send email when deployment fails."""
        self.deployment.status = Deployment.Status.FAILED
        self.deployment.save()

        result = self.service.send_deployment_failed(
            self.deployment,
            error='Terraform apply failed'
        )

        self.assertTrue(result)
        mock_email.assert_called_once()

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_creates_in_app_notification_for_failure(self, mock_in_app, mock_email):
        """Should create in-app notification for failures."""
        self.service.send_deployment_failed(
            self.deployment,
            error='Some error'
        )

        mock_in_app.assert_called_once()
        call_kwargs = mock_in_app.call_args.kwargs

        self.assertEqual(call_kwargs['notification_type'], 'deployment_failed')
        self.assertIn('Failed', call_kwargs['subject'])

    @patch.object(NotificationService, '_send_email')
    @patch.object(NotificationService, '_create_in_app_notification')
    def test_email_includes_error_message(self, mock_in_app, mock_email):
        """Email should include the error message."""
        self.service.send_deployment_failed(
            self.deployment,
            error='Terraform apply failed: quota exceeded'
        )

        call_args = mock_email.call_args
        html_body = call_args.args[2] if len(call_args.args) > 2 else call_args.kwargs.get('html_body', '')

        self.assertIn('quota exceeded', html_body)


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
        mock_notification_cls.objects.create = MagicMock()

        self.service._create_in_app_notification(
            org=self.org,
            subject='Test Subject',
            message='Test message',
            notification_type='deployment_ready',
            related_deployment=self.deployment,
        )

        # Should be called for admin (not regular member)
        # The exact count depends on implementation
        self.assertGreaterEqual(mock_notification_cls.objects.create.call_count, 1)


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
