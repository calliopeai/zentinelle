"""
Alert Service for billing and subscription events.

Handles notifications for payment failures, refunds, disputes, and other billing events.
Sends alerts via email (SES) and creates in-app notifications.
"""

import logging
from typing import Optional, List, Dict, Any

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


class AlertService:
    """
    Service for sending billing and subscription alerts.

    Creates in-app notifications and sends emails for critical billing events.
    """

    def __init__(self):
        self.from_email = getattr(settings, 'FROM_EMAIL', 'noreply@calliope.ai')

    def _get_admin_emails(self, organization) -> List[str]:
        """Get email addresses of organization admins."""
        from core.models import User
        return list(
            User.objects.filter(
                memberships__organization=organization,
                memberships__role__in=['admin'],
            ).values_list('email', flat=True)
        )

    def _create_notification(
        self,
        organization,
        title: str,
        message: str,
        notification_type: str,
        severity: str = 'warning',
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Create an in-app notification for the organization."""
        from core.models import Notification

        try:
            Notification.objects.create(
                organization=organization,
                title=title,
                message=message,
                notification_type=notification_type,
                severity=severity,
                metadata=metadata or {},
            )
        except Exception as e:
            logger.error(f"Failed to create notification: {e}")

    def create_payment_failed_alert(
        self,
        organization,
        amount: float,
        currency: str = 'usd',
        invoice_id: Optional[str] = None,
        reason: Optional[str] = None,
    ):
        """
        Create alert for failed payment.

        Args:
            organization: The organization with failed payment
            amount: Amount that failed to charge
            currency: Currency code (default: usd)
            invoice_id: Stripe invoice ID
            reason: Failure reason from Stripe
        """
        title = "Payment Failed"
        message = (
            f"We were unable to process your payment of ${amount:.2f} {currency.upper()}. "
            f"Please update your payment method to avoid service interruption."
        )
        if reason:
            message += f"\n\nReason: {reason}"

        self._create_notification(
            organization=organization,
            title=title,
            message=message,
            notification_type='payment_failed',
            severity='error',
            metadata={
                'amount': amount,
                'currency': currency,
                'invoice_id': invoice_id,
                'reason': reason,
            },
        )

        logger.warning(
            f"Payment failed alert created for {organization.name}: "
            f"${amount:.2f} - {reason}"
        )

    def create_refund_alert(
        self,
        organization,
        amount: float,
        is_full_refund: bool,
    ):
        """
        Create alert for refund processed.

        Args:
            organization: The organization receiving refund
            amount: Refund amount
            is_full_refund: Whether this is a full refund
        """
        if is_full_refund:
            title = "Subscription Cancelled - Full Refund Processed"
            message = (
                f"A full refund of ${amount:.2f} has been processed. "
                f"Your deployments have been suspended and will be terminated "
                f"in 7 days unless the subscription is reinstated."
            )
            severity = 'error'
        else:
            title = "Partial Refund Processed"
            message = (
                f"A partial refund of ${amount:.2f} has been processed. "
                f"Your service continues uninterrupted."
            )
            severity = 'info'

        self._create_notification(
            organization=organization,
            title=title,
            message=message,
            notification_type='refund_processed',
            severity=severity,
            metadata={
                'amount': amount,
                'is_full_refund': is_full_refund,
            },
        )

        logger.info(
            f"Refund alert created for {organization.name}: "
            f"${amount:.2f} ({'full' if is_full_refund else 'partial'})"
        )

    def create_dispute_alert(
        self,
        organization,
        amount: float,
        reason: str,
        dispute_id: str,
    ):
        """
        Create alert for dispute/chargeback opened.

        Args:
            organization: The organization with the dispute
            amount: Disputed amount
            reason: Dispute reason from Stripe
            dispute_id: Stripe dispute ID
        """
        title = "Payment Dispute Opened - Service Suspended"
        message = (
            f"A payment dispute for ${amount:.2f} has been opened. "
            f"Your deployments have been suspended while we investigate.\n\n"
            f"Reason: {reason}\n\n"
            f"Please contact billing@calliope.ai if you have questions."
        )

        self._create_notification(
            organization=organization,
            title=title,
            message=message,
            notification_type='dispute_opened',
            severity='error',
            metadata={
                'amount': amount,
                'reason': reason,
                'dispute_id': dispute_id,
            },
        )

        logger.warning(
            f"Dispute alert created for {organization.name}: "
            f"${amount:.2f} - {reason}"
        )

    def create_dispute_resolved_alert(
        self,
        organization,
        won: bool,
    ):
        """
        Create alert for dispute resolution.

        Args:
            organization: The organization with resolved dispute
            won: Whether we won the dispute
        """
        if won:
            title = "Dispute Resolved - Service Restored"
            message = (
                "The payment dispute has been resolved in your favor. "
                "Your service has been fully restored."
            )
            severity = 'success'
        else:
            title = "Dispute Lost - Service Terminated"
            message = (
                "The payment dispute has been resolved against your account. "
                "Your deployments have been terminated. "
                "Please contact billing@calliope.ai if you believe this is an error."
            )
            severity = 'error'

        self._create_notification(
            organization=organization,
            title=title,
            message=message,
            notification_type='dispute_resolved',
            severity=severity,
            metadata={'won': won},
        )

        logger.info(
            f"Dispute resolved alert for {organization.name}: "
            f"{'won' if won else 'lost'}"
        )

    def create_subscription_cancelled_alert(
        self,
        organization,
        immediate: bool = False,
        period_end: Optional[str] = None,
    ):
        """
        Create alert for subscription cancellation.

        Args:
            organization: The organization cancelling
            immediate: Whether cancellation is immediate
            period_end: When service ends (if not immediate)
        """
        if immediate:
            title = "Subscription Cancelled"
            message = (
                "Your subscription has been cancelled immediately. "
                "Your deployments are being terminated."
            )
        else:
            title = "Subscription Scheduled for Cancellation"
            message = (
                f"Your subscription will end on {period_end}. "
                f"You'll continue to have access until then. "
                f"You can reactivate anytime before the end date."
            )

        self._create_notification(
            organization=organization,
            title=title,
            message=message,
            notification_type='subscription_cancelled',
            severity='warning',
            metadata={
                'immediate': immediate,
                'period_end': period_end,
            },
        )

        logger.info(
            f"Cancellation alert for {organization.name}: "
            f"{'immediate' if immediate else f'at period end {period_end}'}"
        )

    def send_license_alerts(self, alerts: List[Dict[str, Any]]):
        """
        Send license limit exceeded alerts.

        Args:
            alerts: List of alert dictionaries with org, issues, etc.
        """
        for alert in alerts:
            org = alert.get('organization')
            issues = alert.get('issues', [])

            if not org:
                continue

            title = "License Limit Exceeded"
            message = (
                "Your usage has exceeded the limits of your current plan:\n\n"
                + "\n".join(f"• {issue}" for issue in issues)
                + "\n\nPlease upgrade your plan to continue uninterrupted service."
            )

            self._create_notification(
                organization=org,
                title=title,
                message=message,
                notification_type='license_exceeded',
                severity='warning',
                metadata={'issues': issues},
            )
