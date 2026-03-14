"""
Retention Policy and Legal Hold Mutations.

GraphQL mutations for managing data retention policies and legal holds.

Retention mutations require the ZENTINELLE_RETENTION_POLICIES feature (Enterprise plan).
Legal Hold mutations require the ZENTINELLE_LEGAL_HOLDS feature (Enterprise plan).
"""
import graphene
from graphql import GraphQLError
from graphql_relay import from_global_id
from django.utils import timezone

from billing.features import Features, require_feature_for_mutation
from zentinelle.models import RetentionPolicy, LegalHold
from zentinelle.schema.auth_helpers import user_has_org_access


# =============================================================================
# Retention Policy Input Types
# =============================================================================

class CreateRetentionPolicyInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    description = graphene.String()
    entity_type = graphene.String()
    deployment_id = graphene.ID()
    retention_days = graphene.Int()
    minimum_retention_days = graphene.Int()
    expiration_action = graphene.String()
    archive_location = graphene.String()
    compliance_requirement = graphene.String()
    compliance_notes = graphene.String()
    enabled = graphene.Boolean()
    priority = graphene.Int()


class UpdateRetentionPolicyInput(graphene.InputObjectType):
    id = graphene.ID(required=True)
    name = graphene.String()
    description = graphene.String()
    entity_type = graphene.String()
    deployment_id = graphene.ID()
    retention_days = graphene.Int()
    minimum_retention_days = graphene.Int()
    expiration_action = graphene.String()
    archive_location = graphene.String()
    compliance_requirement = graphene.String()
    compliance_notes = graphene.String()
    enabled = graphene.Boolean()
    priority = graphene.Int()


# =============================================================================
# Retention Policy Mutations
# =============================================================================

class CreateRetentionPolicy(graphene.Mutation):
    """Create a new retention policy."""

    class Arguments:
        input = CreateRetentionPolicyInput(required=True)

    success = graphene.Boolean()
    policy_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_RETENTION_POLICIES)
    def mutate(cls, root, info, input):
        user = info.context.user
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
            return CreateRetentionPolicy(success=True, policy_id=str(policy.id))
        except Exception as e:
            return CreateRetentionPolicy(success=False, errors=[str(e)])


class UpdateRetentionPolicy(graphene.Mutation):
    """Update an existing retention policy."""

    class Arguments:
        input = UpdateRetentionPolicyInput(required=True)

    success = graphene.Boolean()
    policy_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_RETENTION_POLICIES)
    def mutate(cls, root, info, input):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(input.id)
            policy = RetentionPolicy.objects.get(pk=pk)
        except (ValueError, RetentionPolicy.DoesNotExist):
            return UpdateRetentionPolicy(success=False, errors=["Policy not found"])

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
        return UpdateRetentionPolicy(success=True, policy_id=str(policy.id))


class DeleteRetentionPolicy(graphene.Mutation):
    """Delete a retention policy."""

    class Arguments:
        id = graphene.ID(required=True)

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_RETENTION_POLICIES)
    def mutate(cls, root, info, id):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            policy = RetentionPolicy.objects.get(pk=pk)
        except (ValueError, RetentionPolicy.DoesNotExist):
            return DeleteRetentionPolicy(success=False, errors=["Policy not found"])

        if not user_has_org_access(user, policy.organization_id):
            raise GraphQLError("Access denied")

        policy.delete()
        return DeleteRetentionPolicy(success=True)


class ToggleRetentionPolicyEnabled(graphene.Mutation):
    """Toggle a retention policy's enabled status."""

    class Arguments:
        id = graphene.ID(required=True)
        enabled = graphene.Boolean(required=True)

    success = graphene.Boolean()
    policy_id = graphene.ID()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_RETENTION_POLICIES)
    def mutate(cls, root, info, id, enabled):
        user = info.context.user
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

        return ToggleRetentionPolicyEnabled(success=True, policy_id=str(policy.id))


# =============================================================================
# Legal Hold Input Types
# =============================================================================

class CreateLegalHoldInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    description = graphene.String()
    reference_number = graphene.String()
    hold_type = graphene.String()
    applies_to_all = graphene.Boolean()
    entity_types = graphene.List(graphene.String)
    user_identifiers = graphene.List(graphene.String)
    data_from = graphene.DateTime()
    data_to = graphene.DateTime()
    effective_date = graphene.DateTime()
    expiration_date = graphene.DateTime()
    custodian_email = graphene.String()
    notify_on_access = graphene.Boolean()
    notification_emails = graphene.List(graphene.String)
    metadata = graphene.JSONString()


class UpdateLegalHoldInput(graphene.InputObjectType):
    id = graphene.ID(required=True)
    name = graphene.String()
    description = graphene.String()
    reference_number = graphene.String()
    hold_type = graphene.String()
    applies_to_all = graphene.Boolean()
    entity_types = graphene.List(graphene.String)
    user_identifiers = graphene.List(graphene.String)
    data_from = graphene.DateTime()
    data_to = graphene.DateTime()
    expiration_date = graphene.DateTime()
    custodian_email = graphene.String()
    notify_on_access = graphene.Boolean()
    notification_emails = graphene.List(graphene.String)
    metadata = graphene.JSONString()


# =============================================================================
# Legal Hold Mutations
# =============================================================================

class CreateLegalHold(graphene.Mutation):
    """Create a new legal hold."""

    class Arguments:
        input = CreateLegalHoldInput(required=True)

    success = graphene.Boolean()
    hold_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_LEGAL_HOLDS)
    def mutate(cls, root, info, input):
        user = info.context.user
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
            return CreateLegalHold(success=True, hold_id=str(hold.id))
        except Exception as e:
            return CreateLegalHold(success=False, errors=[str(e)])


class UpdateLegalHold(graphene.Mutation):
    """Update an existing legal hold."""

    class Arguments:
        input = UpdateLegalHoldInput(required=True)

    success = graphene.Boolean()
    hold_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_LEGAL_HOLDS)
    def mutate(cls, root, info, input):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(input.id)
            hold = LegalHold.objects.get(pk=pk)
        except (ValueError, LegalHold.DoesNotExist):
            return UpdateLegalHold(success=False, errors=["Legal hold not found"])

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
        return UpdateLegalHold(success=True, hold_id=str(hold.id))


class ReleaseLegalHold(graphene.Mutation):
    """Release a legal hold."""

    class Arguments:
        id = graphene.ID(required=True)
        reason = graphene.String()

    success = graphene.Boolean()
    hold_id = graphene.ID()

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_LEGAL_HOLDS)
    def mutate(cls, root, info, id, reason=None):
        user = info.context.user
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

        return ReleaseLegalHold(success=True, hold_id=str(hold.id))


class DeleteLegalHold(graphene.Mutation):
    """Delete a legal hold (only if not active)."""

    class Arguments:
        id = graphene.ID(required=True)

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_LEGAL_HOLDS)
    def mutate(cls, root, info, id):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            hold = LegalHold.objects.get(pk=pk)
        except (ValueError, LegalHold.DoesNotExist):
            return DeleteLegalHold(success=False, errors=["Legal hold not found"])

        if not user_has_org_access(user, hold.organization_id):
            raise GraphQLError("Access denied")

        if hold.is_active:
            return DeleteLegalHold(
                success=False,
                errors=["Cannot delete an active legal hold. Release it first."]
            )

        hold.delete()
        return DeleteLegalHold(success=True)
