"""
Compliance Alert Mutations.

GraphQL mutations for acknowledging, resolving, and dismissing compliance alerts.
"""
import graphene
from graphql import GraphQLError
from graphql_relay import from_global_id
from django.utils import timezone

from zentinelle.models import ComplianceAlert
from zentinelle.schema.auth_helpers import user_has_org_access


class AcknowledgeComplianceAlert(graphene.Mutation):
    """Acknowledge a compliance alert."""

    class Arguments:
        alert_id = graphene.ID(required=True)

    success = graphene.Boolean()
    alert_id = graphene.ID()

    @classmethod
    def mutate(cls, root, info, alert_id):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(alert_id)
            alert = ComplianceAlert.objects.get(pk=pk)
        except (ValueError, ComplianceAlert.DoesNotExist):
            raise GraphQLError("Alert not found")

        # Check organization access
        if not user_has_org_access(user, alert.organization_id):
            raise GraphQLError("Access denied")

        alert.status = ComplianceAlert.Status.ACKNOWLEDGED
        alert.acknowledged_by = user
        alert.acknowledged_at = timezone.now()
        alert.save(update_fields=['status', 'acknowledged_by', 'acknowledged_at', 'updated_at'])

        return AcknowledgeComplianceAlert(success=True, alert_id=alert_id)


class ResolveComplianceAlert(graphene.Mutation):
    """Resolve a compliance alert."""

    class Arguments:
        alert_id = graphene.ID(required=True)
        resolution_notes = graphene.String()

    success = graphene.Boolean()
    alert_id = graphene.ID()

    @classmethod
    def mutate(cls, root, info, alert_id, resolution_notes=None):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(alert_id)
            alert = ComplianceAlert.objects.get(pk=pk)
        except (ValueError, ComplianceAlert.DoesNotExist):
            raise GraphQLError("Alert not found")

        # Check organization access
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

        return ResolveComplianceAlert(success=True, alert_id=alert_id)


class DismissComplianceAlert(graphene.Mutation):
    """Dismiss a compliance alert as false positive."""

    class Arguments:
        alert_id = graphene.ID(required=True)
        reason = graphene.String()

    success = graphene.Boolean()
    alert_id = graphene.ID()

    @classmethod
    def mutate(cls, root, info, alert_id, reason=None):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(alert_id)
            alert = ComplianceAlert.objects.get(pk=pk)
        except (ValueError, ComplianceAlert.DoesNotExist):
            raise GraphQLError("Alert not found")

        # Check organization access
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

        return DismissComplianceAlert(success=True, alert_id=alert_id)
