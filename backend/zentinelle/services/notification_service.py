"""
Deployment Notification Service.

Sends notifications for deployment lifecycle events via email (AWS SES)
and in-app notifications.
"""

import json
import logging
from typing import Optional, TYPE_CHECKING

import boto3
from botocore.exceptions import ClientError
from django.conf import settings

if TYPE_CHECKING:
    from deployments.models import Deployment

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Service for sending deployment lifecycle notifications.

    Supports:
    - Email notifications via AWS SES
    - In-app notifications (stored in database)
    """

    def __init__(self):
        self.ses_client = None
        self.from_email = getattr(settings, 'FROM_EMAIL', 'noreply@calliope.ai')
        self.region = getattr(settings, 'AWS_SES_REGION_NAME', 'us-west-2')

    def _get_ses_client(self):
        """Lazy-load SES client."""
        if self.ses_client is None:
            self.ses_client = boto3.client('ses', region_name=self.region)
        return self.ses_client

    def send_deployment_ready(self, deployment: 'Deployment') -> bool:
        """
        Send notification that a deployment is ready.

        Args:
            deployment: The completed deployment

        Returns:
            True if notification sent successfully
        """
        org = deployment.organization

        # Get admin emails
        admin_emails = self._get_admin_emails(org)

        if not admin_emails:
            logger.warning(f"No admin emails found for org {org.id}")
            return False

        # Get hub instance name
        hub_instance = deployment.name or org.slug

        # Create in-app notifications
        self._create_in_app_notification(
            org=org,
            subject=f"YOUR HUB IS READY! {hub_instance} is Live",
            message=(
                f"Your hub environment is now live and ready to use!\n\n"
                f"Access your hub: {deployment.hub_url}\n\n"
                f"Get started by logging in and configuring your AI provider keys."
            ),
            notification_type='deployment_ready',
            related_deployment=deployment,
        )

        # Send email
        try:
            self._send_deployment_ready_email(deployment, admin_emails)
            return True
        except Exception as e:
            logger.error(f"Failed to send deployment ready email: {e}")
            return False

    def send_deployment_failed(
        self,
        deployment: 'Deployment',
        error: str = None,
    ) -> bool:
        """
        Send notification that a deployment failed.

        Args:
            deployment: The failed deployment
            error: Error message

        Returns:
            True if notification sent successfully
        """
        org = deployment.organization

        # Get admin emails
        admin_emails = self._get_admin_emails(org)

        if not admin_emails:
            logger.warning(f"No admin emails found for org {org.id}")
            return False

        # Create in-app notifications
        self._create_in_app_notification(
            org=org,
            subject=f"Deployment Failed",
            message=(
                f"Your JunoHub deployment '{deployment.name}' failed to provision.\n\n"
                f"Error: {error or 'Unknown error'}\n\n"
                f"Please contact support for assistance."
            ),
            notification_type='deployment_failed',
            related_deployment=deployment,
        )

        # Send email
        try:
            self._send_deployment_failed_email(deployment, admin_emails, error)
            return True
        except Exception as e:
            logger.error(f"Failed to send deployment failed email: {e}")
            return False

    def _get_admin_emails(self, org) -> list:
        """Get email addresses for org admins."""
        from organization.models import OrganizationMember

        emails = []

        # Get admin member emails (role 'admin' in OrganizationMember)
        admin_members = OrganizationMember.objects.filter(
            organization=org,
            role='admin'
        ).select_related('member')

        for membership in admin_members:
            if membership.member and membership.member.email:
                if membership.member.email not in emails:
                    emails.append(membership.member.email)

        return emails

    def _create_in_app_notification(
        self,
        org,
        subject: str,
        message: str,
        notification_type: str,
        related_deployment: 'Deployment' = None,
    ):
        """Create in-app notifications for org admins."""
        from core.models import Notification
        from organization.models import OrganizationMember

        admin_members = OrganizationMember.objects.filter(
            organization=org,
            role='admin'
        ).select_related('member')

        for membership in admin_members:
            if membership.member:
                try:
                    Notification.objects.create(
                        user=membership.member,
                        subject=subject,
                        message=message,
                        notification_type=notification_type,
                    )
                except Exception as e:
                    logger.error(f"Failed to create notification for {membership.member.email}: {e}")

    def _send_deployment_ready_email(
        self,
        deployment: 'Deployment',
        recipients: list,
    ):
        """Send deployment ready email via SES."""
        org = deployment.organization

        # Get hub instance name (e.g., "acme" from "acme.softinfra.net")
        hub_instance = deployment.name or org.slug

        subject = f"YOUR HUB IS READY! {hub_instance} is Live"

        html_body = f"""
        <html>
        <head>
            <style>
                .hero {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; text-align: center; border-radius: 8px; }}
                .hero h1 {{ margin: 0; font-size: 32px; }}
                .hero .hub-name {{ font-size: 24px; opacity: 0.95; margin-top: 8px; font-weight: 500; }}
                .hero p {{ margin: 10px 0 0; opacity: 0.85; }}
                .content {{ padding: 30px; }}
                .url-box {{ background: #f8f9fa; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }}
                .url-box a {{ color: #667eea; font-size: 18px; font-weight: bold; text-decoration: none; }}
                .steps {{ background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }}
                .step {{ display: flex; margin: 10px 0; }}
                .step-num {{ background: #667eea; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: bold; }}
            </style>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div class="hero">
                    <h1>YOUR HUB IS READY!</h1>
                    <div class="hub-name">{hub_instance}</div>
                    <p>Your environment is now live and ready to use</p>
                </div>

                <div class="content">
                    <div class="url-box">
                        <p style="margin: 0 0 10px; color: #666;">Access Your Hub:</p>
                        <a href="{deployment.hub_url}">{deployment.hub_url}</a>
                    </div>

                    <h3 style="color: #333;">Hub Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px 0; color: #666;">Hub Instance:</td><td style="padding: 8px 0; font-weight: bold;">{hub_instance}</td></tr>
                        <tr><td style="padding: 8px 0; color: #666;">Organization:</td><td style="padding: 8px 0; font-weight: bold;">{org.name}</td></tr>
                    </table>

                    <div class="steps">
                        <h3 style="margin-top: 0; color: #333;">Get Started</h3>
                        <div class="step">
                            <div class="step-num">1</div>
                            <div>Log in to your hub at <a href="{deployment.hub_url}" style="color: #667eea;">{deployment.hub_url}</a></div>
                        </div>
                        <div class="step">
                            <div class="step-num">2</div>
                            <div>Configure your AI provider API keys in Settings</div>
                        </div>
                        <div class="step">
                            <div class="step-num">3</div>
                            <div>Create your first notebook and start coding!</div>
                        </div>
                    </div>

                    <p style="color: #666; font-size: 14px;">
                        Need help? Check out our <a href="https://docs.calliope.ai" style="color: #667eea;">documentation</a>
                        or reach out to <a href="mailto:support@calliope.ai" style="color: #667eea;">support@calliope.ai</a>
                    </p>

                    <p style="margin-top: 30px; color: #333;">
                        Welcome aboard!<br>
                        <strong>The Calliope Team</strong>
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

        text_body = f"""
=====================================
   YOUR HUB IS READY!
   {hub_instance}
=====================================

Great news! Your hub environment is now live and ready to use.

ACCESS YOUR HUB:
{deployment.hub_url}

HUB DETAILS:
- Hub Instance: {hub_instance}
- Organization: {org.name}

GET STARTED:
1. Log in to your hub at {deployment.hub_url}
2. Configure your AI provider API keys in Settings
3. Create your first notebook and start coding!

Need help? Check out our documentation at https://docs.calliope.ai
or reach out to support@calliope.ai

Welcome aboard!
The Calliope Team
        """

        self._send_email(recipients, subject, html_body, text_body)

    def _send_deployment_failed_email(
        self,
        deployment: 'Deployment',
        recipients: list,
        error: str = None,
    ):
        """Send deployment failed email via SES."""
        org = deployment.organization

        subject = f"Deployment Failed - {deployment.name}"

        html_body = f"""
        <html>
        <head></head>
        <body>
            <h2>Deployment Failed</h2>
            <p>Unfortunately, your JunoHub deployment encountered an error during provisioning.</p>

            <h3>Deployment Details</h3>
            <ul>
                <li><strong>Name:</strong> {deployment.name}</li>
                <li><strong>Organization:</strong> {org.name}</li>
                <li><strong>Error:</strong> {error or 'Unknown error'}</li>
            </ul>

            <h3>What to do next</h3>
            <p>Our team has been notified of this issue. You can:</p>
            <ol>
                <li>Try again in a few minutes</li>
                <li>Contact support at support@calliope.ai</li>
            </ol>

            <p>We apologize for the inconvenience.</p>

            <p>Best regards,<br>The Calliope Team</p>
        </body>
        </html>
        """

        text_body = f"""
Deployment Failed

Unfortunately, your JunoHub deployment encountered an error during provisioning.

Deployment Details:
- Name: {deployment.name}
- Organization: {org.name}
- Error: {error or 'Unknown error'}

What to do next:
Our team has been notified of this issue. You can:
1. Try again in a few minutes
2. Contact support at support@calliope.ai

We apologize for the inconvenience.

Best regards,
The Calliope Team
        """

        self._send_email(recipients, subject, html_body, text_body)

    def _send_email(
        self,
        recipients: list,
        subject: str,
        html_body: str,
        text_body: str,
    ):
        """Send email via AWS SES."""
        try:
            client = self._get_ses_client()
            response = client.send_email(
                Source=self.from_email,
                Destination={
                    'ToAddresses': recipients,
                },
                Message={
                    'Subject': {
                        'Data': subject,
                        'Charset': 'UTF-8',
                    },
                    'Body': {
                        'Text': {
                            'Data': text_body,
                            'Charset': 'UTF-8',
                        },
                        'Html': {
                            'Data': html_body,
                            'Charset': 'UTF-8',
                        },
                    },
                },
            )
            logger.info(f"Sent email to {recipients}: MessageId={response['MessageId']}")
        except ClientError as e:
            logger.error(f"SES error: {e.response['Error']['Message']}")
            raise
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            raise


# Singleton instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Get or create the singleton notification service instance."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
