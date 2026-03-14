"""
Risk and Incident Mutations.

GraphQL mutations for managing risks and incidents.

Risk mutations require the ZENTINELLE_RISK_MANAGEMENT feature (Enterprise plan).
Incident mutations require the ZENTINELLE_INCIDENTS feature (Enterprise plan).
"""
import graphene
from graphql import GraphQLError
from graphql_relay import from_global_id
from django.utils import timezone

from billing.features import Features, require_feature_for_mutation
from zentinelle.models import Risk, Incident
from zentinelle.schema.auth_helpers import user_has_org_access


# =============================================================================
# Risk Input Types
# =============================================================================

class CreateRiskInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    description = graphene.String(required=True)
    category = graphene.String()
    status = graphene.String()
    likelihood = graphene.Int()
    impact = graphene.Int()
    mitigation_plan = graphene.String()
    mitigation_status = graphene.String()
    residual_likelihood = graphene.Int()
    residual_impact = graphene.Int()
    next_review_date = graphene.Date()
    tags = graphene.List(graphene.String)


class UpdateRiskInput(graphene.InputObjectType):
    id = graphene.ID(required=True)
    name = graphene.String()
    description = graphene.String()
    category = graphene.String()
    status = graphene.String()
    likelihood = graphene.Int()
    impact = graphene.Int()
    mitigation_plan = graphene.String()
    mitigation_status = graphene.String()
    residual_likelihood = graphene.Int()
    residual_impact = graphene.Int()
    next_review_date = graphene.Date()
    tags = graphene.List(graphene.String)


# =============================================================================
# Risk Mutations
# =============================================================================

class CreateRisk(graphene.Mutation):
    """Create a new risk."""

    class Arguments:
        input = CreateRiskInput(required=True)

    success = graphene.Boolean()
    risk_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_RISK_MANAGEMENT)
    def mutate(cls, root, info, input):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            risk = Risk.objects.create(
                organization=user.organization,
                name=input.name,
                description=input.description,
                category=input.category or Risk.RiskCategory.SECURITY,
                status=input.status or Risk.RiskStatus.IDENTIFIED,
                likelihood=input.likelihood or Risk.Likelihood.POSSIBLE,
                impact=input.impact or Risk.Impact.MODERATE,
                mitigation_plan=input.mitigation_plan or '',
                mitigation_status=input.mitigation_status or '',
                residual_likelihood=input.residual_likelihood,
                residual_impact=input.residual_impact,
                next_review_date=input.next_review_date,
                tags=input.tags or [],
                owner=user,
            )
            return CreateRisk(success=True, risk_id=str(risk.id))
        except Exception as e:
            return CreateRisk(success=False, errors=[str(e)])


class UpdateRisk(graphene.Mutation):
    """Update an existing risk."""

    class Arguments:
        input = UpdateRiskInput(required=True)

    success = graphene.Boolean()
    risk_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_RISK_MANAGEMENT)
    def mutate(cls, root, info, input):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(input.id)
            risk = Risk.objects.get(pk=pk)
        except (ValueError, Risk.DoesNotExist):
            return UpdateRisk(success=False, errors=["Risk not found"])

        if not user_has_org_access(user, risk.organization_id):
            raise GraphQLError("Access denied")

        update_fields = ['updated_at']

        if input.name is not None:
            risk.name = input.name
            update_fields.append('name')
        if input.description is not None:
            risk.description = input.description
            update_fields.append('description')
        if input.category is not None:
            risk.category = input.category
            update_fields.append('category')
        if input.status is not None:
            risk.status = input.status
            update_fields.append('status')
        if input.likelihood is not None:
            risk.likelihood = input.likelihood
            update_fields.append('likelihood')
        if input.impact is not None:
            risk.impact = input.impact
            update_fields.append('impact')
        if input.mitigation_plan is not None:
            risk.mitigation_plan = input.mitigation_plan
            update_fields.append('mitigation_plan')
        if input.mitigation_status is not None:
            risk.mitigation_status = input.mitigation_status
            update_fields.append('mitigation_status')
        if input.residual_likelihood is not None:
            risk.residual_likelihood = input.residual_likelihood
            update_fields.append('residual_likelihood')
        if input.residual_impact is not None:
            risk.residual_impact = input.residual_impact
            update_fields.append('residual_impact')
        if input.next_review_date is not None:
            risk.next_review_date = input.next_review_date
            update_fields.append('next_review_date')
        if input.tags is not None:
            risk.tags = input.tags
            update_fields.append('tags')

        risk.save(update_fields=update_fields)
        return UpdateRisk(success=True, risk_id=str(risk.id))


class DeleteRisk(graphene.Mutation):
    """Delete a risk."""

    class Arguments:
        id = graphene.ID(required=True)

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_RISK_MANAGEMENT)
    def mutate(cls, root, info, id):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            risk = Risk.objects.get(pk=pk)
        except (ValueError, Risk.DoesNotExist):
            return DeleteRisk(success=False, errors=["Risk not found"])

        if not user_has_org_access(user, risk.organization_id):
            raise GraphQLError("Access denied")

        risk.delete()
        return DeleteRisk(success=True)


class ReviewRisk(graphene.Mutation):
    """Mark a risk as reviewed."""

    class Arguments:
        id = graphene.ID(required=True)
        notes = graphene.String()

    success = graphene.Boolean()
    risk_id = graphene.ID()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_RISK_MANAGEMENT)
    def mutate(cls, root, info, id, notes=None):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            risk = Risk.objects.get(pk=pk)
        except (ValueError, Risk.DoesNotExist):
            raise GraphQLError("Risk not found")

        if not user_has_org_access(user, risk.organization_id):
            raise GraphQLError("Access denied")

        risk.last_reviewed_at = timezone.now()
        risk.last_reviewed_by = user
        risk.save(update_fields=['last_reviewed_at', 'last_reviewed_by', 'updated_at'])

        return ReviewRisk(success=True, risk_id=str(risk.id))


# =============================================================================
# Incident Input Types
# =============================================================================

class CreateIncidentInput(graphene.InputObjectType):
    title = graphene.String(required=True)
    description = graphene.String(required=True)
    incident_type = graphene.String()
    severity = graphene.String()
    endpoint_id = graphene.ID()
    deployment_id = graphene.ID()
    related_risk_id = graphene.ID()
    affected_user = graphene.String()
    affected_user_count = graphene.Int()
    occurred_at = graphene.DateTime()
    tags = graphene.List(graphene.String)


class UpdateIncidentInput(graphene.InputObjectType):
    id = graphene.ID(required=True)
    title = graphene.String()
    description = graphene.String()
    incident_type = graphene.String()
    severity = graphene.String()
    status = graphene.String()
    root_cause = graphene.String()
    impact_assessment = graphene.String()
    resolution = graphene.String()
    lessons_learned = graphene.String()
    tags = graphene.List(graphene.String)


# =============================================================================
# Incident Mutations
# =============================================================================

class CreateIncident(graphene.Mutation):
    """Create a new incident."""

    class Arguments:
        input = CreateIncidentInput(required=True)

    success = graphene.Boolean()
    incident_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
    def mutate(cls, root, info, input):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            from deployments.models import Deployment
            from zentinelle.models import AgentEndpoint

            endpoint = None
            deployment = None
            related_risk = None

            if input.endpoint_id:
                _, ep_pk = from_global_id(input.endpoint_id)
                endpoint = AgentEndpoint.objects.get(pk=ep_pk)

            if input.deployment_id:
                _, dep_pk = from_global_id(input.deployment_id)
                deployment = Deployment.objects.get(pk=dep_pk)

            if input.related_risk_id:
                _, risk_pk = from_global_id(input.related_risk_id)
                related_risk = Risk.objects.get(pk=risk_pk)

            incident = Incident.objects.create(
                organization=user.organization,
                title=input.title,
                description=input.description,
                incident_type=input.incident_type or Incident.IncidentType.POLICY_VIOLATION,
                severity=input.severity or Incident.Severity.MEDIUM,
                endpoint=endpoint,
                deployment=deployment,
                related_risk=related_risk,
                affected_user=input.affected_user or '',
                affected_user_count=input.affected_user_count or 1,
                occurred_at=input.occurred_at or timezone.now(),
                tags=input.tags or [],
                reported_by=user,
            )
            return CreateIncident(success=True, incident_id=str(incident.id))
        except Exception as e:
            return CreateIncident(success=False, errors=[str(e)])


class UpdateIncident(graphene.Mutation):
    """Update an existing incident."""

    class Arguments:
        input = UpdateIncidentInput(required=True)

    success = graphene.Boolean()
    incident_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
    def mutate(cls, root, info, input):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(input.id)
            incident = Incident.objects.get(pk=pk)
        except (ValueError, Incident.DoesNotExist):
            return UpdateIncident(success=False, errors=["Incident not found"])

        if not user_has_org_access(user, incident.organization_id):
            raise GraphQLError("Access denied")

        update_fields = ['updated_at']

        if input.title is not None:
            incident.title = input.title
            update_fields.append('title')
        if input.description is not None:
            incident.description = input.description
            update_fields.append('description')
        if input.incident_type is not None:
            incident.incident_type = input.incident_type
            update_fields.append('incident_type')
        if input.severity is not None:
            incident.severity = input.severity
            update_fields.append('severity')
        if input.status is not None:
            incident.status = input.status
            update_fields.append('status')
        if input.root_cause is not None:
            incident.root_cause = input.root_cause
            update_fields.append('root_cause')
        if input.impact_assessment is not None:
            incident.impact_assessment = input.impact_assessment
            update_fields.append('impact_assessment')
        if input.resolution is not None:
            incident.resolution = input.resolution
            update_fields.append('resolution')
        if input.lessons_learned is not None:
            incident.lessons_learned = input.lessons_learned
            update_fields.append('lessons_learned')
        if input.tags is not None:
            incident.tags = input.tags
            update_fields.append('tags')

        incident.save(update_fields=update_fields)
        return UpdateIncident(success=True, incident_id=str(incident.id))


class AcknowledgeIncident(graphene.Mutation):
    """Acknowledge an incident."""

    class Arguments:
        id = graphene.ID(required=True)

    success = graphene.Boolean()
    incident_id = graphene.ID()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
    def mutate(cls, root, info, id):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            incident = Incident.objects.get(pk=pk)
        except (ValueError, Incident.DoesNotExist):
            raise GraphQLError("Incident not found")

        if not user_has_org_access(user, incident.organization_id):
            raise GraphQLError("Access denied")

        incident.status = Incident.Status.INVESTIGATING
        incident.acknowledged_at = timezone.now()
        incident.assigned_to = user
        incident.save(update_fields=['status', 'acknowledged_at', 'assigned_to', 'updated_at'])

        incident.add_timeline_event('acknowledged', 'Incident acknowledged', user)

        return AcknowledgeIncident(success=True, incident_id=str(incident.id))


class ResolveIncident(graphene.Mutation):
    """Resolve an incident."""

    class Arguments:
        id = graphene.ID(required=True)
        resolution = graphene.String(required=True)
        root_cause = graphene.String()

    success = graphene.Boolean()
    incident_id = graphene.ID()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
    def mutate(cls, root, info, id, resolution, root_cause=None):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            incident = Incident.objects.get(pk=pk)
        except (ValueError, Incident.DoesNotExist):
            raise GraphQLError("Incident not found")

        if not user_has_org_access(user, incident.organization_id):
            raise GraphQLError("Access denied")

        incident.status = Incident.Status.RESOLVED
        incident.resolved_at = timezone.now()
        incident.resolution = resolution
        if root_cause:
            incident.root_cause = root_cause

        update_fields = ['status', 'resolved_at', 'resolution', 'updated_at']
        if root_cause:
            update_fields.append('root_cause')

        incident.save(update_fields=update_fields)
        incident.add_timeline_event('resolved', f'Incident resolved: {resolution}', user)

        return ResolveIncident(success=True, incident_id=str(incident.id))


class CloseIncident(graphene.Mutation):
    """Close an incident."""

    class Arguments:
        id = graphene.ID(required=True)
        lessons_learned = graphene.String()

    success = graphene.Boolean()
    incident_id = graphene.ID()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
    def mutate(cls, root, info, id, lessons_learned=None):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            incident = Incident.objects.get(pk=pk)
        except (ValueError, Incident.DoesNotExist):
            raise GraphQLError("Incident not found")

        if not user_has_org_access(user, incident.organization_id):
            raise GraphQLError("Access denied")

        incident.status = Incident.Status.CLOSED
        incident.closed_at = timezone.now()
        if lessons_learned:
            incident.lessons_learned = lessons_learned

        update_fields = ['status', 'closed_at', 'updated_at']
        if lessons_learned:
            update_fields.append('lessons_learned')

        incident.save(update_fields=update_fields)
        incident.add_timeline_event('closed', 'Incident closed', user)

        return CloseIncident(success=True, incident_id=str(incident.id))


class AssignIncident(graphene.Mutation):
    """Assign an incident to a user."""

    class Arguments:
        id = graphene.ID(required=True)
        assignee_id = graphene.ID(required=True)

    success = graphene.Boolean()
    incident_id = graphene.ID()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
    def mutate(cls, root, info, id, assignee_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            incident = Incident.objects.get(pk=pk)
        except (ValueError, Incident.DoesNotExist):
            raise GraphQLError("Incident not found")

        if not user_has_org_access(user, incident.organization_id):
            raise GraphQLError("Access denied")

        try:
            _, assignee_pk = from_global_id(assignee_id)
            assignee = User.objects.get(pk=assignee_pk)
        except (ValueError, User.DoesNotExist):
            raise GraphQLError("Assignee not found")

        incident.assigned_to = assignee
        incident.save(update_fields=['assigned_to', 'updated_at'])

        incident.add_timeline_event('assigned', f'Assigned to {assignee.get_full_name() or assignee.email}', user)

        return AssignIncident(success=True, incident_id=str(incident.id))
