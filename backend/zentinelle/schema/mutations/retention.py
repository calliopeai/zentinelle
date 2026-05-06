"""
Retention Policy and Legal Hold Mutations.

GraphQL mutations for managing data retention policies and legal holds.

Retention mutations require the ZENTINELLE_RETENTION_POLICIES feature (Enterprise plan).
Legal Hold mutations require the ZENTINELLE_LEGAL_HOLDS feature (Enterprise plan).
"""
from datetime import datetime
from typing import Optional

import strawberry
from strawberry.scalars import JSON
from graphql import GraphQLError
from graphql_relay import from_global_id
from django.utils import timezone

try:
    from billing.features import Features, require_feature_for_mutation
except ImportError:
    class Features:
        ZENTINELLE_RETENTION_POLICIES = 'zentinelle_retention_policies'
        ZENTINELLE_LEGAL_HOLDS = 'zentinelle_legal_holds'
    def require_feature_for_mutation(feature):
        def decorator(fn):
            return fn
        return decorator
from zentinelle.models import RetentionPolicy, LegalHold
from zentinelle.schema.auth_helpers import user_has_org_access


@strawberry.input
class CreateRetentionPolicyInput:
    name: str
    description: Optional[str] = None
    entity_type: Optional[str] = None
    deployment_id: Optional[strawberry.ID] = None
    retention_days: Optional[int] = None
    minimum_retention_days: Optional[int] = None
    expiration_action: Optional[str] = None
    archive_location: Optional[str] = None
    compliance_requirement: Optional[str] = None
    compliance_notes: Optional[str] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None


@strawberry.input
class UpdateRetentionPolicyInput:
    id: strawberry.ID
    name: Optional[str] = None
    description: Optional[str] = None
    entity_type: Optional[str] = None
    deployment_id: Optional[strawberry.ID] = None
    retention_days: Optional[int] = None
    minimum_retention_days: Optional[int] = None
    expiration_action: Optional[str] = None
    archive_location: Optional[str] = None
    compliance_requirement: Optional[str] = None
    compliance_notes: Optional[str] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None


@strawberry.type
class CreateRetentionPolicyPayload:
    success: Optional[bool] = None
    policy_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class UpdateRetentionPolicyPayload:
    success: Optional[bool] = None
    policy_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class DeleteRetentionPolicyPayload:
    success: Optional[bool] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class ToggleRetentionPolicyEnabledPayload:
    success: Optional[bool] = None
    policy_id: Optional[strawberry.ID] = None


@strawberry.input
class CreateLegalHoldInput:
    name: str
    description: Optional[str] = None
    reference_number: Optional[str] = None
    hold_type: Optional[str] = None
    applies_to_all: Optional[bool] = None
    entity_types: Optional[list[str]] = None
    user_identifiers: Optional[list[str]] = None
    data_from: Optional[datetime] = None
    data_to: Optional[datetime] = None
    effective_date: Optional[datetime] = None
    expiration_date: Optional[datetime] = None
    custodian_email: Optional[str] = None
    notify_on_access: Optional[bool] = None
    notification_emails: Optional[list[str]] = None
    metadata: Optional[JSON] = None


@strawberry.input
class UpdateLegalHoldInput:
    id: strawberry.ID
    name: Optional[str] = None
    description: Optional[str] = None
    reference_number: Optional[str] = None
    hold_type: Optional[str] = None
    applies_to_all: Optional[bool] = None
    entity_types: Optional[list[str]] = None
    user_identifiers: Optional[list[str]] = None
    data_from: Optional[datetime] = None
    data_to: Optional[datetime] = None
    expiration_date: Optional[datetime] = None
    custodian_email: Optional[str] = None
    notify_on_access: Optional[bool] = None
    notification_emails: Optional[list[str]] = None
    metadata: Optional[JSON] = None


@strawberry.type
class CreateLegalHoldPayload:
    success: Optional[bool] = None
    hold_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class UpdateLegalHoldPayload:
    success: Optional[bool] = None
    hold_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class ReleaseLegalHoldPayload:
    success: Optional[bool] = None
    hold_id: Optional[strawberry.ID] = None


@strawberry.type
class DeleteLegalHoldPayload:
    success: Optional[bool] = None
    errors: list[str] = strawberry.field(default_factory=list)


def create_retention_policy(info: strawberry.types.Info, input: CreateRetentionPolicyInput) -> CreateRetentionPolicyPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        from deployments.models import Deployment

        deployment = None
        if input.deployment_id:
            _, dep_pk = from_global_id(input.deployment_id)
            deployment = Deployment.objects.get(pk=dep_pk)

        policy = RetentionPolicy.objects.create(
            organization=user.organization,
            name=input.name,
            description=input.description or '',
            entity_type=input.entity_type or RetentionPolicy.EntityType.ALL,
            deployment=deployment,
            retention_days=input.retention_days or 90,
            minimum_retention_days=input.minimum_retention_days,
            expiration_action=input.expiration_action or RetentionPolicy.ExpirationAction.DELETE,
            archive_location=input.archive_location or '',
            compliance_requirement=input.compliance_requirement or RetentionPolicy.ComplianceRequirement.NONE,
            compliance_notes=input.compliance_notes or '',
            enabled=input.enabled if input.enabled is not None else True,
            priority=input.priority or 0,
            created_by=user,
        )
        return CreateRetentionPolicyPayload(success=True, policy_id=str(policy.id))
    except Exception as e:
        return CreateRetentionPolicyPayload(success=False, errors=[str(e)])


def update_retention_policy(info: strawberry.types.Info, input: UpdateRetentionPolicyInput) -> UpdateRetentionPolicyPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(input.id)
        policy = RetentionPolicy.objects.get(pk=pk)
    except (ValueError, RetentionPolicy.DoesNotExist):
        return UpdateRetentionPolicyPayload(success=False, errors=["Policy not found"])

    if not user_has_org_access(user, policy.organization_id):
        raise GraphQLError("Access denied")

    update_fields = ['updated_at']

    if input.name is not None:
        policy.name = input.name
        update_fields.append('name')
    if input.description is not None:
        policy.description = input.description
        update_fields.append('description')
    if input.entity_type is not None:
        policy.entity_type = input.entity_type
        update_fields.append('entity_type')
    if input.retention_days is not None:
        policy.retention_days = input.retention_days
        update_fields.append('retention_days')
    if input.minimum_retention_days is not None:
        policy.minimum_retention_days = input.minimum_retention_days
        update_fields.append('minimum_retention_days')
    if input.expiration_action is not None:
        policy.expiration_action = input.expiration_action
        update_fields.append('expiration_action')
    if input.archive_location is not None:
        policy.archive_location = input.archive_location
        update_fields.append('archive_location')
    if input.compliance_requirement is not None:
        policy.compliance_requirement = input.compliance_requirement
        update_fields.append('compliance_requirement')
    if input.compliance_notes is not None:
        policy.compliance_notes = input.compliance_notes
        update_fields.append('compliance_notes')
    if input.enabled is not None:
        policy.enabled = input.enabled
        update_fields.append('enabled')
    if input.priority is not None:
        policy.priority = input.priority
        update_fields.append('priority')

    policy.save(update_fields=update_fields)
    return UpdateRetentionPolicyPayload(success=True, policy_id=str(policy.id))


def delete_retention_policy(info: strawberry.types.Info, id: strawberry.ID) -> DeleteRetentionPolicyPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        policy = RetentionPolicy.objects.get(pk=pk)
    except (ValueError, RetentionPolicy.DoesNotExist):
        return DeleteRetentionPolicyPayload(success=False, errors=["Policy not found"])

    if not user_has_org_access(user, policy.organization_id):
        raise GraphQLError("Access denied")

    policy.delete()
    return DeleteRetentionPolicyPayload(success=True)


def toggle_retention_policy_enabled(info: strawberry.types.Info, id: strawberry.ID, enabled: bool) -> ToggleRetentionPolicyEnabledPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        policy = RetentionPolicy.objects.get(pk=pk)
    except (ValueError, RetentionPolicy.DoesNotExist):
        raise GraphQLError("Policy not found")

    if not user_has_org_access(user, policy.organization_id):
        raise GraphQLError("Access denied")

    policy.enabled = enabled
    policy.save(update_fields=['enabled', 'updated_at'])

    return ToggleRetentionPolicyEnabledPayload(success=True, policy_id=str(policy.id))


def create_legal_hold(info: strawberry.types.Info, input: CreateLegalHoldInput) -> CreateLegalHoldPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        hold = LegalHold.objects.create(
            organization=user.organization,
            name=input.name,
            description=input.description or '',
            reference_number=input.reference_number or '',
            hold_type=input.hold_type or LegalHold.HoldType.PRESERVATION,
            status=LegalHold.HoldStatus.ACTIVE,
            applies_to_all=input.applies_to_all or False,
            entity_types=input.entity_types or [],
            user_identifiers=input.user_identifiers or [],
            data_from=input.data_from,
            data_to=input.data_to,
            effective_date=input.effective_date or timezone.now(),
            expiration_date=input.expiration_date,
            custodian=user,
            custodian_email=input.custodian_email or '',
            notify_on_access=input.notify_on_access or False,
            notification_emails=input.notification_emails or [],
            metadata=input.metadata or {},
            created_by=user,
        )
        return CreateLegalHoldPayload(success=True, hold_id=str(hold.id))
    except Exception as e:
        return CreateLegalHoldPayload(success=False, errors=[str(e)])


def update_legal_hold(info: strawberry.types.Info, input: UpdateLegalHoldInput) -> UpdateLegalHoldPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(input.id)
        hold = LegalHold.objects.get(pk=pk)
    except (ValueError, LegalHold.DoesNotExist):
        return UpdateLegalHoldPayload(success=False, errors=["Legal hold not found"])

    if not user_has_org_access(user, hold.organization_id):
        raise GraphQLError("Access denied")

    update_fields = ['updated_at']

    if input.name is not None:
        hold.name = input.name
        update_fields.append('name')
    if input.description is not None:
        hold.description = input.description
        update_fields.append('description')
    if input.reference_number is not None:
        hold.reference_number = input.reference_number
        update_fields.append('reference_number')
    if input.hold_type is not None:
        hold.hold_type = input.hold_type
        update_fields.append('hold_type')
    if input.applies_to_all is not None:
        hold.applies_to_all = input.applies_to_all
        update_fields.append('applies_to_all')
    if input.entity_types is not None:
        hold.entity_types = input.entity_types
        update_fields.append('entity_types')
    if input.user_identifiers is not None:
        hold.user_identifiers = input.user_identifiers
        update_fields.append('user_identifiers')
    if input.data_from is not None:
        hold.data_from = input.data_from
        update_fields.append('data_from')
    if input.data_to is not None:
        hold.data_to = input.data_to
        update_fields.append('data_to')
    if input.expiration_date is not None:
        hold.expiration_date = input.expiration_date
        update_fields.append('expiration_date')
    if input.custodian_email is not None:
        hold.custodian_email = input.custodian_email
        update_fields.append('custodian_email')
    if input.notify_on_access is not None:
        hold.notify_on_access = input.notify_on_access
        update_fields.append('notify_on_access')
    if input.notification_emails is not None:
        hold.notification_emails = input.notification_emails
        update_fields.append('notification_emails')
    if input.metadata is not None:
        hold.metadata = input.metadata
        update_fields.append('metadata')

    hold.save(update_fields=update_fields)
    return UpdateLegalHoldPayload(success=True, hold_id=str(hold.id))


def release_legal_hold(info: strawberry.types.Info, id: strawberry.ID, reason: Optional[str] = None) -> ReleaseLegalHoldPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        hold = LegalHold.objects.get(pk=pk)
    except (ValueError, LegalHold.DoesNotExist):
        raise GraphQLError("Legal hold not found")

    if not user_has_org_access(user, hold.organization_id):
        raise GraphQLError("Access denied")

    hold.release(user)

    return ReleaseLegalHoldPayload(success=True, hold_id=str(hold.id))


def delete_legal_hold(info: strawberry.types.Info, id: strawberry.ID) -> DeleteLegalHoldPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        hold = LegalHold.objects.get(pk=pk)
    except (ValueError, LegalHold.DoesNotExist):
        return DeleteLegalHoldPayload(success=False, errors=["Legal hold not found"])

    if not user_has_org_access(user, hold.organization_id):
        raise GraphQLError("Access denied")

    if hold.is_active:
        return DeleteLegalHoldPayload(
            success=False,
            errors=["Cannot delete an active legal hold. Release it first."]
        )

    hold.delete()
    return DeleteLegalHoldPayload(success=True)
