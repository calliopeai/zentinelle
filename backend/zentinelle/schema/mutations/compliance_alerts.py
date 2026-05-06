"""
Compliance Alert Mutations.

GraphQL mutations for acknowledging, resolving, and dismissing compliance alerts.
"""
import strawberry
from typing import Optional
from graphql import GraphQLError
from graphql_relay import from_global_id
from django.utils import timezone

from zentinelle.models import ComplianceAlert
from zentinelle.schema.auth_helpers import user_has_org_access


@strawberry.type
class AcknowledgeComplianceAlertPayload:
    success: Optional[bool] = None
    alert_id: Optional[strawberry.ID] = None


@strawberry.type
class ResolveComplianceAlertPayload:
    success: Optional[bool] = None
    alert_id: Optional[strawberry.ID] = None


@strawberry.type
class DismissComplianceAlertPayload:
    success: Optional[bool] = None
    alert_id: Optional[strawberry.ID] = None


def acknowledge_compliance_alert(info: strawberry.types.Info, alert_id: strawberry.ID) -> AcknowledgeComplianceAlertPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(alert_id)
        alert = ComplianceAlert.objects.get(pk=pk)
    except (ValueError, ComplianceAlert.DoesNotExist):
        raise GraphQLError("Alert not found")

    if not user_has_org_access(user, alert.organization_id):
        raise GraphQLError("Access denied")

    alert.status = ComplianceAlert.Status.ACKNOWLEDGED
    alert.acknowledged_by = user
    alert.acknowledged_at = timezone.now()
    alert.save(update_fields=['status', 'acknowledged_by', 'acknowledged_at', 'updated_at'])

    return AcknowledgeComplianceAlertPayload(success=True, alert_id=alert_id)


def resolve_compliance_alert(info: strawberry.types.Info, alert_id: strawberry.ID, resolution_notes: Optional[str] = None) -> ResolveComplianceAlertPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(alert_id)
        alert = ComplianceAlert.objects.get(pk=pk)
    except (ValueError, ComplianceAlert.DoesNotExist):
        raise GraphQLError("Alert not found")

    if not user_has_org_access(user, alert.organization_id):
        raise GraphQLError("Access denied")

    alert.status = ComplianceAlert.Status.RESOLVED
    alert.resolved_by = user
    alert.resolved_at = timezone.now()
    if resolution_notes:
        alert.resolution_notes = resolution_notes
    alert.save(update_fields=[
        'status', 'resolved_by', 'resolved_at', 'resolution_notes', 'updated_at'
    ])

    return ResolveComplianceAlertPayload(success=True, alert_id=alert_id)


def dismiss_compliance_alert(info: strawberry.types.Info, alert_id: strawberry.ID, reason: Optional[str] = None) -> DismissComplianceAlertPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(alert_id)
        alert = ComplianceAlert.objects.get(pk=pk)
    except (ValueError, ComplianceAlert.DoesNotExist):
        raise GraphQLError("Alert not found")

    if not user_has_org_access(user, alert.organization_id):
        raise GraphQLError("Access denied")

    alert.status = ComplianceAlert.Status.FALSE_POSITIVE
    alert.resolved_by = user
    alert.resolved_at = timezone.now()
    if reason:
        alert.resolution_notes = f"Dismissed as false positive: {reason}"
    else:
        alert.resolution_notes = "Dismissed as false positive"
    alert.save(update_fields=[
        'status', 'resolved_by', 'resolved_at', 'resolution_notes', 'updated_at'
    ])

    return DismissComplianceAlertPayload(success=True, alert_id=alert_id)
