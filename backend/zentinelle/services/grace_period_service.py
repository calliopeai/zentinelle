"""
Grace Period Service - Handles license validation grace periods.

When license validation fails (payment issues, subscription expiration),
we provide a grace period before hard-blocking access, allowing users
time to resolve licensing issues.

Grace Period Durations:
- Payment failed: 7 days
- Subscription expired: 3 days
- Subscription canceled: 3 days
- Usage limit exceeded: 7 days
- Manual override: configurable
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Tuple, TYPE_CHECKING

from django.utils import timezone

if TYPE_CHECKING:
    from zentinelle.models import License

logger = logging.getLogger(__name__)


# Default grace period durations (in days)
GRACE_PERIOD_DURATIONS = {
    'payment_failed': 7,
    'subscription_expired': 3,
    'subscription_canceled': 3,
    'usage_limit_exceeded': 7,
    'manual': 7,  # Default for manual overrides
}


@dataclass
class GracePeriodStatus:
    """Status of a license's grace period."""
    in_grace_period: bool
    days_remaining: int
    grace_period_ends: Optional[datetime] = None
    reason: Optional[str] = None
    warnings_sent: int = 0
    should_hard_block: bool = False

    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            'in_grace_period': self.in_grace_period,
            'days_remaining': self.days_remaining,
            'grace_period_ends': self.grace_period_ends.isoformat() if self.grace_period_ends else None,
            'reason': self.reason,
            'warnings_sent': self.warnings_sent,
            'should_hard_block': self.should_hard_block,
        }


class GracePeriodService:
    """
    Service for managing license grace periods.

    Usage:
        service = GracePeriodService()

        # Start a grace period
        service.start_grace_period(license, 'payment_failed')

        # Check grace period status
        status = service.check_grace_period_status(license)
        if status.should_hard_block:
            # Block access
            pass
        elif status.in_grace_period:
            # Allow access but warn user
            pass

        # End grace period when issue is resolved
        service.end_grace_period(license)
    """

    def __init__(self):
        self.durations = GRACE_PERIOD_DURATIONS.copy()

    def start_grace_period(
        self,
        license_obj: 'License',
        reason: str,
        duration_days: Optional[int] = None,
    ) -> bool:
        """
        Start a grace period for a license.

        Args:
            license_obj: The License instance
            reason: One of the GracePeriodReason values
            duration_days: Override the default duration (optional)

        Returns:
            True if grace period was started successfully
        """
        from zentinelle.models import License

        # Validate reason
        valid_reasons = [choice[0] for choice in License.GracePeriodReason.choices]
        if reason not in valid_reasons:
            logger.error(f"Invalid grace period reason: {reason}")
            return False

        # Don't start a new grace period if already in one
        if license_obj.is_in_grace_period:
            logger.info(f"License {license_obj.id} already in grace period")
            return True

        # Determine duration
        days = duration_days or self.durations.get(reason, 7)

        now = timezone.now()
        license_obj.grace_period_started = now
        license_obj.grace_period_ends = now + timedelta(days=days)
        license_obj.grace_period_reason = reason
        license_obj.grace_period_warnings_sent = 0
        license_obj.grace_period_last_warning_at = None

        license_obj.save(update_fields=[
            'grace_period_started',
            'grace_period_ends',
            'grace_period_reason',
            'grace_period_warnings_sent',
            'grace_period_last_warning_at',
            'updated_at',
        ])

        logger.info(
            f"Started grace period for license {license_obj.id}: "
            f"reason={reason}, ends={license_obj.grace_period_ends}"
        )

        # Send initial notification
        self._send_grace_period_started_notification(license_obj)

        return True

    def check_grace_period_status(self, license_obj: 'License') -> GracePeriodStatus:
        """
        Check the grace period status of a license.

        Args:
            license_obj: The License instance

        Returns:
            GracePeriodStatus with current state
        """
        # No grace period configured
        if not license_obj.grace_period_started:
            return GracePeriodStatus(
                in_grace_period=False,
                days_remaining=0,
                should_hard_block=False,
            )

        now = timezone.now()

        # Grace period has expired - should hard block
        if license_obj.grace_period_expired:
            return GracePeriodStatus(
                in_grace_period=False,
                days_remaining=0,
                grace_period_ends=license_obj.grace_period_ends,
                reason=license_obj.grace_period_reason,
                warnings_sent=license_obj.grace_period_warnings_sent,
                should_hard_block=True,
            )

        # Currently in grace period
        if license_obj.is_in_grace_period:
            return GracePeriodStatus(
                in_grace_period=True,
                days_remaining=license_obj.days_remaining_in_grace_period,
                grace_period_ends=license_obj.grace_period_ends,
                reason=license_obj.grace_period_reason,
                warnings_sent=license_obj.grace_period_warnings_sent,
                should_hard_block=False,
            )

        # Edge case: grace period hasn't started yet (shouldn't happen)
        return GracePeriodStatus(
            in_grace_period=False,
            days_remaining=0,
            should_hard_block=False,
        )

    def end_grace_period(self, license_obj: 'License') -> bool:
        """
        End a grace period (when the underlying issue is resolved).

        Args:
            license_obj: The License instance

        Returns:
            True if grace period was ended successfully
        """
        if not license_obj.grace_period_started:
            logger.info(f"License {license_obj.id} not in grace period")
            return True

        reason = license_obj.grace_period_reason
        license_obj.clear_grace_period()

        logger.info(f"Ended grace period for license {license_obj.id} (was: {reason})")

        # Send resolution notification
        self._send_grace_period_resolved_notification(license_obj, reason)

        return True

    def send_grace_period_warning(self, license_obj: 'License') -> bool:
        """
        Send a warning notification during the grace period.

        Should be called by a scheduled task to send daily reminders.

        Args:
            license_obj: The License instance

        Returns:
            True if warning was sent successfully
        """
        if not license_obj.is_in_grace_period:
            return False

        # Check if we should send a warning today
        now = timezone.now()
        if license_obj.grace_period_last_warning_at:
            hours_since_last = (now - license_obj.grace_period_last_warning_at).total_seconds() / 3600
            if hours_since_last < 23:  # Less than 23 hours since last warning
                return False

        # Send warning
        success = self._send_grace_period_warning_notification(license_obj)

        if success:
            license_obj.grace_period_warnings_sent += 1
            license_obj.grace_period_last_warning_at = now
            license_obj.save(update_fields=[
                'grace_period_warnings_sent',
                'grace_period_last_warning_at',
                'updated_at',
            ])

        return success

    def get_licenses_in_grace_period(self):
        """
        Get all licenses currently in a grace period.

        Returns:
            QuerySet of License objects in grace period
        """
        from zentinelle.models import License

        now = timezone.now()
        return License.objects.filter(
            grace_period_started__isnull=False,
            grace_period_ends__gt=now,
        )

    def get_licenses_with_expired_grace_period(self):
        """
        Get all licenses with expired grace periods (should be hard-blocked).

        Returns:
            QuerySet of License objects with expired grace periods
        """
        from zentinelle.models import License

        now = timezone.now()
        return License.objects.filter(
            grace_period_started__isnull=False,
            grace_period_ends__lte=now,
        )

    def extend_grace_period(
        self,
        license_obj: 'License',
        additional_days: int,
    ) -> bool:
        """
        Extend an existing grace period.

        Args:
            license_obj: The License instance
            additional_days: Number of days to add

        Returns:
            True if extension was successful
        """
        if not license_obj.grace_period_ends:
            logger.warning(f"License {license_obj.id} not in grace period, cannot extend")
            return False

        license_obj.grace_period_ends += timedelta(days=additional_days)
        license_obj.save(update_fields=['grace_period_ends', 'updated_at'])

        logger.info(
            f"Extended grace period for license {license_obj.id} "
            f"by {additional_days} days, new end: {license_obj.grace_period_ends}"
        )

        return True

    # =========================================================================
    # Notification Methods
    # =========================================================================

    def _send_grace_period_started_notification(self, license_obj: 'License') -> bool:
        """Send notification that grace period has started."""
        from zentinelle.services.notification_service import get_notification_service

        try:
            notification_service = get_notification_service()
            org = license_obj.organization

            # Get reason display
            reason_display = self._get_reason_display(license_obj.grace_period_reason)
            days_remaining = license_obj.days_remaining_in_grace_period

            # Create in-app notification
            admin_emails = notification_service._get_admin_emails(org)

            notification_service._create_in_app_notification(
                org=org,
                subject=f"License Grace Period Started - {days_remaining} days remaining",
                message=(
                    f"Your license has entered a grace period due to: {reason_display}.\n\n"
                    f"You have {days_remaining} days to resolve this issue.\n\n"
                    f"After the grace period expires, access to your JunoHub deployments "
                    f"will be suspended.\n\n"
                    f"Please resolve the issue to continue uninterrupted service."
                ),
                notification_type='grace_period_started',
                related_deployment=None,
            )

            # Send email
            if admin_emails:
                notification_service._send_email(
                    recipients=admin_emails,
                    subject=f"Action Required: License Grace Period - {days_remaining} days remaining",
                    html_body=self._get_grace_period_started_html(license_obj, reason_display),
                    text_body=self._get_grace_period_started_text(license_obj, reason_display),
                )

            logger.info(f"Sent grace period started notification for license {license_obj.id}")
            return True

        except Exception as e:
            logger.error(f"Failed to send grace period started notification: {e}")
            return False

    def _send_grace_period_warning_notification(self, license_obj: 'License') -> bool:
        """Send a daily warning during grace period."""
        from zentinelle.services.notification_service import get_notification_service

        try:
            notification_service = get_notification_service()
            org = license_obj.organization

            reason_display = self._get_reason_display(license_obj.grace_period_reason)
            days_remaining = license_obj.days_remaining_in_grace_period

            admin_emails = notification_service._get_admin_emails(org)

            # Determine urgency
            if days_remaining <= 1:
                subject = f"URGENT: License Expires Tomorrow - Immediate Action Required"
                urgency = "urgent"
            elif days_remaining <= 3:
                subject = f"Warning: License Expires in {days_remaining} Days"
                urgency = "warning"
            else:
                subject = f"Reminder: License Grace Period - {days_remaining} Days Remaining"
                urgency = "reminder"

            notification_service._create_in_app_notification(
                org=org,
                subject=subject,
                message=(
                    f"Your license grace period has {days_remaining} day(s) remaining.\n\n"
                    f"Reason: {reason_display}\n\n"
                    f"Please resolve this issue to avoid service interruption."
                ),
                notification_type='grace_period_warning',
                related_deployment=None,
            )

            if admin_emails:
                notification_service._send_email(
                    recipients=admin_emails,
                    subject=subject,
                    html_body=self._get_grace_period_warning_html(license_obj, reason_display, urgency),
                    text_body=self._get_grace_period_warning_text(license_obj, reason_display),
                )

            return True

        except Exception as e:
            logger.error(f"Failed to send grace period warning notification: {e}")
            return False

    def _send_grace_period_resolved_notification(
        self,
        license_obj: 'License',
        previous_reason: str,
    ) -> bool:
        """Send notification that grace period has been resolved."""
        from zentinelle.services.notification_service import get_notification_service

        try:
            notification_service = get_notification_service()
            org = license_obj.organization

            reason_display = self._get_reason_display(previous_reason)
            admin_emails = notification_service._get_admin_emails(org)

            notification_service._create_in_app_notification(
                org=org,
                subject="License Issue Resolved - Full Access Restored",
                message=(
                    f"The license issue ({reason_display}) has been resolved.\n\n"
                    f"Your license is now fully active and all services are available."
                ),
                notification_type='grace_period_resolved',
                related_deployment=None,
            )

            if admin_emails:
                notification_service._send_email(
                    recipients=admin_emails,
                    subject="License Issue Resolved - Full Access Restored",
                    html_body=self._get_grace_period_resolved_html(license_obj, reason_display),
                    text_body=self._get_grace_period_resolved_text(license_obj, reason_display),
                )

            logger.info(f"Sent grace period resolved notification for license {license_obj.id}")
            return True

        except Exception as e:
            logger.error(f"Failed to send grace period resolved notification: {e}")
            return False

    def _get_reason_display(self, reason: str) -> str:
        """Get human-readable display for grace period reason."""
        from zentinelle.models import License

        reason_labels = {
            License.GracePeriodReason.PAYMENT_FAILED: 'Payment Failed',
            License.GracePeriodReason.SUBSCRIPTION_EXPIRED: 'Subscription Expired',
            License.GracePeriodReason.SUBSCRIPTION_CANCELED: 'Subscription Canceled',
            License.GracePeriodReason.USAGE_LIMIT_EXCEEDED: 'Usage Limit Exceeded',
            License.GracePeriodReason.MANUAL: 'Administrative Hold',
        }
        return reason_labels.get(reason, reason)

    # =========================================================================
    # Email Templates
    # =========================================================================

    def _get_grace_period_started_html(self, license_obj: 'License', reason_display: str) -> str:
        """Generate HTML email for grace period started."""
        days_remaining = license_obj.days_remaining_in_grace_period
        org = license_obj.organization

        return f"""
        <html>
        <head>
            <style>
                .warning-banner {{ background: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .warning-banner h1 {{ margin: 0; font-size: 24px; }}
                .content {{ padding: 30px; background: white; }}
                .days-box {{ background: #fff3e0; border: 2px solid #ff9800; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }}
                .days-box .number {{ font-size: 48px; font-weight: bold; color: #e65100; }}
                .days-box .label {{ font-size: 14px; color: #666; }}
                .action-btn {{ display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }}
            </style>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div class="warning-banner">
                    <h1>License Grace Period Started</h1>
                </div>

                <div class="content">
                    <p>Hello,</p>
                    <p>Your license for <strong>{org.name}</strong> has entered a grace period due to:</p>
                    <p style="background: #f5f5f5; padding: 15px; border-radius: 6px; font-weight: bold;">{reason_display}</p>

                    <div class="days-box">
                        <div class="number">{days_remaining}</div>
                        <div class="label">days remaining</div>
                    </div>

                    <h3>What happens next?</h3>
                    <ul>
                        <li>Your JunoHub deployments will continue to function during this period</li>
                        <li>After {days_remaining} days, access will be suspended</li>
                        <li>You can resolve this issue at any time to restore full access</li>
                    </ul>

                    <h3>How to resolve</h3>
                    <p>Please visit your billing settings to update your payment method or contact support for assistance.</p>

                    <p style="text-align: center; margin-top: 30px;">
                        <a href="https://app.calliope.ai/admin/billing" class="action-btn">Manage Billing</a>
                    </p>

                    <p style="color: #666; font-size: 14px; margin-top: 30px;">
                        Questions? Contact us at <a href="mailto:support@calliope.ai">support@calliope.ai</a>
                    </p>

                    <p style="margin-top: 30px;">
                        Best regards,<br>
                        <strong>The Calliope Team</strong>
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

    def _get_grace_period_started_text(self, license_obj: 'License', reason_display: str) -> str:
        """Generate text email for grace period started."""
        days_remaining = license_obj.days_remaining_in_grace_period
        org = license_obj.organization

        return f"""
LICENSE GRACE PERIOD STARTED
=============================

Hello,

Your license for {org.name} has entered a grace period due to:
{reason_display}

DAYS REMAINING: {days_remaining}

WHAT HAPPENS NEXT:
- Your JunoHub deployments will continue to function during this period
- After {days_remaining} days, access will be suspended
- You can resolve this issue at any time to restore full access

HOW TO RESOLVE:
Please visit your billing settings to update your payment method or
contact support for assistance.

Manage Billing: https://app.calliope.ai/admin/billing

Questions? Contact us at support@calliope.ai

Best regards,
The Calliope Team
        """

    def _get_grace_period_warning_html(
        self,
        license_obj: 'License',
        reason_display: str,
        urgency: str,
    ) -> str:
        """Generate HTML email for grace period warning."""
        days_remaining = license_obj.days_remaining_in_grace_period
        org = license_obj.organization

        # Color based on urgency
        colors = {
            'urgent': {'bg': '#f44336', 'border': '#d32f2f'},
            'warning': {'bg': '#ff9800', 'border': '#f57c00'},
            'reminder': {'bg': '#2196f3', 'border': '#1976d2'},
        }
        color = colors.get(urgency, colors['warning'])

        return f"""
        <html>
        <head>
            <style>
                .banner {{ background: {color['bg']}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ padding: 30px; background: white; }}
                .days-box {{ background: #fff; border: 3px solid {color['border']}; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }}
                .days-box .number {{ font-size: 48px; font-weight: bold; color: {color['border']}; }}
                .action-btn {{ display: inline-block; background: {color['bg']}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }}
            </style>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
                <div class="banner">
                    <h1>{'URGENT: ' if urgency == 'urgent' else ''}License Grace Period Reminder</h1>
                </div>
                <div class="content">
                    <div class="days-box">
                        <div class="number">{days_remaining}</div>
                        <div class="label">day{'s' if days_remaining != 1 else ''} remaining</div>
                    </div>
                    <p>Your license for <strong>{org.name}</strong> will expire soon.</p>
                    <p><strong>Reason:</strong> {reason_display}</p>
                    <p style="text-align: center; margin-top: 20px;">
                        <a href="https://app.calliope.ai/admin/billing" class="action-btn">Resolve Now</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

    def _get_grace_period_warning_text(self, license_obj: 'License', reason_display: str) -> str:
        """Generate text email for grace period warning."""
        days_remaining = license_obj.days_remaining_in_grace_period
        org = license_obj.organization

        return f"""
LICENSE GRACE PERIOD REMINDER
=============================

Your license for {org.name} will expire in {days_remaining} day(s).

Reason: {reason_display}

Please resolve this issue to avoid service interruption.

Resolve Now: https://app.calliope.ai/admin/billing

Best regards,
The Calliope Team
        """

    def _get_grace_period_resolved_html(self, license_obj: 'License', reason_display: str) -> str:
        """Generate HTML email for grace period resolved."""
        org = license_obj.organization

        return f"""
        <html>
        <head>
            <style>
                .success-banner {{ background: #4caf50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ padding: 30px; background: white; }}
            </style>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
                <div class="success-banner">
                    <h1>License Issue Resolved</h1>
                </div>
                <div class="content">
                    <p>Great news!</p>
                    <p>The license issue for <strong>{org.name}</strong> has been resolved.</p>
                    <p style="background: #e8f5e9; padding: 15px; border-radius: 6px;">
                        <strong>Previous issue:</strong> {reason_display}<br>
                        <strong>Status:</strong> Resolved
                    </p>
                    <p>Your license is now fully active and all services are available.</p>
                    <p>Thank you for your continued business!</p>
                    <p style="margin-top: 30px;">
                        Best regards,<br>
                        <strong>The Calliope Team</strong>
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

    def _get_grace_period_resolved_text(self, license_obj: 'License', reason_display: str) -> str:
        """Generate text email for grace period resolved."""
        org = license_obj.organization

        return f"""
LICENSE ISSUE RESOLVED
======================

Great news!

The license issue for {org.name} has been resolved.

Previous issue: {reason_display}
Status: Resolved

Your license is now fully active and all services are available.

Thank you for your continued business!

Best regards,
The Calliope Team
        """


# Singleton instance
_grace_period_service: Optional[GracePeriodService] = None


def get_grace_period_service() -> GracePeriodService:
    """Get or create the singleton grace period service instance."""
    global _grace_period_service
    if _grace_period_service is None:
        _grace_period_service = GracePeriodService()
    return _grace_period_service
