"""
Risk and Incident Mutations.

GraphQL mutations for managing risks and incidents.

Risk mutations require the ZENTINELLE_RISK_MANAGEMENT feature (Enterprise plan).
Incident mutations require the ZENTINELLE_INCIDENTS feature (Enterprise plan).
"""
import strawberry
from typing import Optional
from datetime import datetime, date
from graphql import GraphQLError
from graphql_relay import from_global_id
from django.utils import timezone

try:
    from billing.features import Features, require_feature_for_mutation
except ImportError:
    class Features:
        ZENTINELLE_RISK_MANAGEMENT = 'zentinelle_risk_management'
        ZENTINELLE_INCIDENTS = 'zentinelle_incidents'

    def require_feature_for_mutation(feature):
        def decorator(fn):
            return fn
        return decorator
from zentinelle.models import Risk, Incident
from zentinelle.schema.auth_helpers import user_has_org_access, get_request_tenant_id


@strawberry.input
class CreateRiskInput:
    name: str
    description: str
    category: Optional[str] = None
    status: Optional[str] = None
    likelihood: Optional[int] = None
    impact: Optional[int] = None
    mitigation_plan: Optional[str] = None
    mitigation_status: Optional[str] = None
    residual_likelihood: Optional[int] = None
    residual_impact: Optional[int] = None
    next_review_date: Optional[date] = None
    tags: Optional[list[str]] = None


@strawberry.input
class UpdateRiskInput:
    id: strawberry.ID
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    likelihood: Optional[int] = None
    impact: Optional[int] = None
    mitigation_plan: Optional[str] = None
    mitigation_status: Optional[str] = None
    residual_likelihood: Optional[int] = None
    residual_impact: Optional[int] = None
    next_review_date: Optional[date] = None
    tags: Optional[list[str]] = None


@strawberry.type
class CreateRiskPayload:
    success: Optional[bool] = None
    risk_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class UpdateRiskPayload:
    success: Optional[bool] = None
    risk_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class DeleteRiskPayload:
    success: Optional[bool] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class ReviewRiskPayload:
    success: Optional[bool] = None
    risk_id: Optional[strawberry.ID] = None


@strawberry.input
class CreateIncidentInput:
    title: str
    description: str
    incident_type: Optional[str] = None
    severity: Optional[str] = None
    endpoint_id: Optional[strawberry.ID] = None
    deployment_id: Optional[strawberry.ID] = None
    related_risk_id: Optional[strawberry.ID] = None
    affected_user: Optional[str] = None
    affected_user_count: Optional[int] = None
    occurred_at: Optional[datetime] = None
    tags: Optional[list[str]] = None


@strawberry.input
class UpdateIncidentInput:
    id: strawberry.ID
    title: Optional[str] = None
    description: Optional[str] = None
    incident_type: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    root_cause: Optional[str] = None
    impact_assessment: Optional[str] = None
    resolution: Optional[str] = None
    lessons_learned: Optional[str] = None
    tags: Optional[list[str]] = None


@strawberry.type
class CreateIncidentPayload:
    success: Optional[bool] = None
    incident_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class UpdateIncidentPayload:
    success: Optional[bool] = None
    incident_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class AcknowledgeIncidentPayload:
    success: Optional[bool] = None
    incident_id: Optional[strawberry.ID] = None


@strawberry.type
class ResolveIncidentPayload:
    success: Optional[bool] = None
    incident_id: Optional[strawberry.ID] = None


@strawberry.type
class CloseIncidentPayload:
    success: Optional[bool] = None
    incident_id: Optional[strawberry.ID] = None


@strawberry.type
class AssignIncidentPayload:
    success: Optional[bool] = None
    incident_id: Optional[strawberry.ID] = None


@require_feature_for_mutation(Features.ZENTINELLE_RISK_MANAGEMENT)
def create_risk(info: strawberry.types.Info, input: CreateRiskInput) -> CreateRiskPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        risk = Risk.objects.create(
            tenant_id=get_request_tenant_id(user) or '',
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
            user_id=str(user.id),
        )
        return CreateRiskPayload(success=True, risk_id=str(risk.id))
    except Exception as e:
        return CreateRiskPayload(success=False, errors=[str(e)])


@require_feature_for_mutation(Features.ZENTINELLE_RISK_MANAGEMENT)
def update_risk(info: strawberry.types.Info, input: UpdateRiskInput) -> UpdateRiskPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(input.id)
        risk = Risk.objects.get(pk=pk)
    except (ValueError, Risk.DoesNotExist):
        return UpdateRiskPayload(success=False, errors=["Risk not found"])

    if not user_has_org_access(user, risk.tenant_id):
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
    return UpdateRiskPayload(success=True, risk_id=str(risk.id))


@require_feature_for_mutation(Features.ZENTINELLE_RISK_MANAGEMENT)
def delete_risk(info: strawberry.types.Info, id: strawberry.ID) -> DeleteRiskPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        risk = Risk.objects.get(pk=pk)
    except (ValueError, Risk.DoesNotExist):
        return DeleteRiskPayload(success=False, errors=["Risk not found"])

    if not user_has_org_access(user, risk.tenant_id):
        raise GraphQLError("Access denied")

    risk.delete()
    return DeleteRiskPayload(success=True)


@require_feature_for_mutation(Features.ZENTINELLE_RISK_MANAGEMENT)
def review_risk(info: strawberry.types.Info, id: strawberry.ID, notes: Optional[str] = None) -> ReviewRiskPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        risk = Risk.objects.get(pk=pk)
    except (ValueError, Risk.DoesNotExist):
        raise GraphQLError("Risk not found")

    if not user_has_org_access(user, risk.tenant_id):
        raise GraphQLError("Access denied")

    risk.last_reviewed_at = timezone.now()
    risk.reviewer_id = str(user.id)
    risk.save(update_fields=['last_reviewed_at', 'reviewer_id', 'updated_at'])

    return ReviewRiskPayload(success=True, risk_id=str(risk.id))


@require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
def create_incident(info: strawberry.types.Info, input: CreateIncidentInput) -> CreateIncidentPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        from zentinelle.models import AgentEndpoint

        endpoint = None
        deployment_id_ext = ''
        related_risk = None

        if input.endpoint_id:
            _, ep_pk = from_global_id(input.endpoint_id)
            endpoint = AgentEndpoint.objects.get(pk=ep_pk)

        if input.deployment_id:
            _, dep_pk = from_global_id(input.deployment_id)
            deployment_id_ext = dep_pk

        if input.related_risk_id:
            _, risk_pk = from_global_id(input.related_risk_id)
            related_risk = Risk.objects.get(pk=risk_pk)

        incident = Incident.objects.create(
            tenant_id=get_request_tenant_id(user) or '',
            title=input.title,
            description=input.description,
            incident_type=input.incident_type or Incident.IncidentType.POLICY_VIOLATION,
            severity=input.severity or Incident.Severity.MEDIUM,
            endpoint=endpoint,
            deployment_id_ext=deployment_id_ext,
            related_risk=related_risk,
            affected_user=input.affected_user or '',
            affected_user_count=input.affected_user_count or 1,
            occurred_at=input.occurred_at or timezone.now(),
            tags=input.tags or [],
            reporter_id=str(user.id),
        )
        return CreateIncidentPayload(success=True, incident_id=str(incident.id))
    except Exception as e:
        return CreateIncidentPayload(success=False, errors=[str(e)])


@require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
def update_incident(info: strawberry.types.Info, input: UpdateIncidentInput) -> UpdateIncidentPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(input.id)
        incident = Incident.objects.get(pk=pk)
    except (ValueError, Incident.DoesNotExist):
        return UpdateIncidentPayload(success=False, errors=["Incident not found"])

    if not user_has_org_access(user, incident.tenant_id):
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
    return UpdateIncidentPayload(success=True, incident_id=str(incident.id))


@require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
def acknowledge_incident(info: strawberry.types.Info, id: strawberry.ID) -> AcknowledgeIncidentPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        incident = Incident.objects.get(pk=pk)
    except (ValueError, Incident.DoesNotExist):
        raise GraphQLError("Incident not found")

    if not user_has_org_access(user, incident.tenant_id):
        raise GraphQLError("Access denied")

    incident.status = Incident.Status.INVESTIGATING
    incident.acknowledged_at = timezone.now()
    incident.assignee_id = str(user.id)
    incident.save(update_fields=['status', 'acknowledged_at', 'assignee_id', 'updated_at'])

    incident.add_timeline_event('acknowledged', 'Incident acknowledged', user)

    return AcknowledgeIncidentPayload(success=True, incident_id=str(incident.id))


@require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
def resolve_incident(info: strawberry.types.Info, id: strawberry.ID, resolution: str, root_cause: Optional[str] = None) -> ResolveIncidentPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        incident = Incident.objects.get(pk=pk)
    except (ValueError, Incident.DoesNotExist):
        raise GraphQLError("Incident not found")

    if not user_has_org_access(user, incident.tenant_id):
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

    return ResolveIncidentPayload(success=True, incident_id=str(incident.id))


@require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
def close_incident(info: strawberry.types.Info, id: strawberry.ID, lessons_learned: Optional[str] = None) -> CloseIncidentPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        incident = Incident.objects.get(pk=pk)
    except (ValueError, Incident.DoesNotExist):
        raise GraphQLError("Incident not found")

    if not user_has_org_access(user, incident.tenant_id):
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

    return CloseIncidentPayload(success=True, incident_id=str(incident.id))


@require_feature_for_mutation(Features.ZENTINELLE_INCIDENTS)
def assign_incident(info: strawberry.types.Info, id: strawberry.ID, assignee_id: strawberry.ID) -> AssignIncidentPayload:
    from django.contrib.auth import get_user_model
    User = get_user_model()

    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        incident = Incident.objects.get(pk=pk)
    except (ValueError, Incident.DoesNotExist):
        raise GraphQLError("Incident not found")

    if not user_has_org_access(user, incident.tenant_id):
        raise GraphQLError("Access denied")

    try:
        _, assignee_pk = from_global_id(assignee_id)
        assignee = User.objects.get(pk=assignee_pk)
    except (ValueError, User.DoesNotExist):
        raise GraphQLError("Assignee not found")

    incident.assignee_id = str(assignee.pk)
    incident.save(update_fields=['assignee_id', 'updated_at'])

    incident.add_timeline_event('assigned', f'Assigned to {assignee.get_full_name() or assignee.email}', user)

    return AssignIncidentPayload(success=True, incident_id=str(incident.id))
