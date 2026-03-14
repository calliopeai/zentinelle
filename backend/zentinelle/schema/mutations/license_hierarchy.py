"""
License Hierarchy GraphQL Mutations.

Enterprise-only mutations for managing parent/child license relationships.
"""
import logging

import graphene
from graphene import relay

from billing.features import require_feature_for_mutation, Features
from organization.models import Organization, OrganizationMember
from zentinelle.models import License
from zentinelle.services.license_hierarchy_service import license_hierarchy_service

logger = logging.getLogger(__name__)


def get_user_organizations(user):
    """Get all organizations the user belongs to."""
    return OrganizationMember.objects.filter(
        member=user
    ).values_list('organization_id', flat=True)


# =============================================================================
# GraphQL Types for License Hierarchy
# =============================================================================

class LicenseHierarchyType(graphene.ObjectType):
    """GraphQL type for license hierarchy information."""
    id = graphene.UUID()
    organization_id = graphene.UUID()
    organization_name = graphene.String()
    status = graphene.String()
    license_type = graphene.String()
    features = graphene.JSONString()
    limits = graphene.JSONString()
    inherit_entitlements = graphene.Boolean()
    children = graphene.List(lambda: LicenseHierarchyType)


class LicenseType(graphene.ObjectType):
    """GraphQL type for License in hierarchy context."""
    id = graphene.UUID()
    organization_id = graphene.UUID()
    organization_name = graphene.String()
    license_key = graphene.String()
    status = graphene.String()
    license_type = graphene.String()
    is_parent_license = graphene.Boolean()
    is_child_license = graphene.Boolean()
    parent_license_id = graphene.UUID()
    max_child_licenses = graphene.Int()
    child_license_count = graphene.Int()
    inherit_entitlements = graphene.Boolean()
    features = graphene.JSONString()
    max_deployments = graphene.Int()
    max_agents = graphene.Int()
    max_users = graphene.Int()

    @staticmethod
    def from_model(license_obj: License) -> 'LicenseType':
        """Create LicenseType from License model."""
        return LicenseType(
            id=license_obj.id,
            organization_id=license_obj.organization_id,
            organization_name=license_obj.organization.name,
            license_key=license_obj.license_key,
            status=license_obj.status,
            license_type=license_obj.license_type,
            is_parent_license=license_obj.is_parent_license,
            is_child_license=license_obj.is_child_license,
            parent_license_id=license_obj.parent_license_id,
            max_child_licenses=license_obj.max_child_licenses,
            child_license_count=license_obj.child_license_count,
            inherit_entitlements=license_obj.inherit_entitlements,
            features=license_obj.get_effective_features(),
            max_deployments=license_obj.max_deployments,
            max_agents=license_obj.max_agents,
            max_users=license_obj.max_users,
        )


# =============================================================================
# Input Types
# =============================================================================

class CreateChildLicenseInput(graphene.InputObjectType):
    """Input for creating a child license."""
    parent_license_id = graphene.UUID(required=True)
    child_organization_id = graphene.UUID(required=True)
    entitlements = graphene.JSONString()
    max_deployments = graphene.Int()
    max_agents = graphene.Int()
    max_users = graphene.Int()
    inherit_entitlements = graphene.Boolean()


class UpdateChildEntitlementsInput(graphene.InputObjectType):
    """Input for updating child license entitlements."""
    child_license_id = graphene.UUID(required=True)
    entitlements = graphene.JSONString(required=True)
    max_deployments = graphene.Int()
    max_agents = graphene.Int()
    max_users = graphene.Int()


class TransferChildLicenseInput(graphene.InputObjectType):
    """Input for transferring a child license to a new parent."""
    child_license_id = graphene.UUID(required=True)
    new_parent_license_id = graphene.UUID(required=True)


# =============================================================================
# Mutations
# =============================================================================

class CreateChildLicense(graphene.Mutation):
    """
    Create a child license under a parent license.

    Requires enterprise tier.
    """
    class Arguments:
        input = CreateChildLicenseInput(required=True)

    license = graphene.Field(LicenseType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.KEYS_BULK_PROVISIONING)
    def mutate(cls, root, info, input):
        if not info.context.user.is_authenticated:
            return CreateChildLicense(success=False, error="Authentication required")

        user_orgs = list(get_user_organizations(info.context.user))

        try:
            parent_license = License.objects.get(
                id=input.parent_license_id,
                organization_id__in=user_orgs
            )
        except License.DoesNotExist:
            return CreateChildLicense(success=False, error="Parent license not found")

        try:
            child_org = Organization.objects.get(id=input.child_organization_id)
        except Organization.DoesNotExist:
            return CreateChildLicense(success=False, error="Child organization not found")

        # Parse optional entitlements
        entitlements = None
        if input.entitlements:
            import json
            try:
                entitlements = json.loads(input.entitlements) if isinstance(input.entitlements, str) else input.entitlements
            except json.JSONDecodeError:
                return CreateChildLicense(success=False, error="Invalid entitlements JSON")

        # Create child license
        child_license, error = license_hierarchy_service.create_child_license(
            parent_license=parent_license,
            child_org=child_org,
            entitlements=entitlements,
            max_deployments=input.max_deployments or 1,
            max_agents=input.max_agents or 50,
            max_users=input.max_users or 25,
            inherit_entitlements=input.inherit_entitlements if input.inherit_entitlements is not None else True,
        )

        if error:
            return CreateChildLicense(success=False, error=error)

        return CreateChildLicense(
            success=True,
            license=LicenseType.from_model(child_license)
        )


class UpdateChildEntitlements(graphene.Mutation):
    """
    Update entitlements for a child license.

    Requires enterprise tier.
    """
    class Arguments:
        input = UpdateChildEntitlementsInput(required=True)

    license = graphene.Field(LicenseType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.KEYS_BULK_PROVISIONING)
    def mutate(cls, root, info, input):
        if not info.context.user.is_authenticated:
            return UpdateChildEntitlements(success=False, error="Authentication required")

        user_orgs = list(get_user_organizations(info.context.user))

        try:
            child_license = License.objects.select_related('parent_license', 'organization').get(
                id=input.child_license_id
            )
        except License.DoesNotExist:
            return UpdateChildEntitlements(success=False, error="Child license not found")

        # User must have access to parent license's organization
        if child_license.parent_license_id:
            if child_license.parent_license.organization_id not in user_orgs:
                return UpdateChildEntitlements(success=False, error="Access denied to parent license")

        # Parse entitlements
        import json
        try:
            entitlements = json.loads(input.entitlements) if isinstance(input.entitlements, str) else input.entitlements
        except json.JSONDecodeError:
            return UpdateChildEntitlements(success=False, error="Invalid entitlements JSON")

        # Build limits dict
        limits = {}
        if input.max_deployments is not None:
            limits['max_deployments'] = input.max_deployments
        if input.max_agents is not None:
            limits['max_agents'] = input.max_agents
        if input.max_users is not None:
            limits['max_users'] = input.max_users

        # Update entitlements
        success, error = license_hierarchy_service.update_child_entitlements(
            child_license=child_license,
            entitlements=entitlements,
            limits=limits if limits else None
        )

        if not success:
            return UpdateChildEntitlements(success=False, error=error)

        child_license.refresh_from_db()
        return UpdateChildEntitlements(
            success=True,
            license=LicenseType.from_model(child_license)
        )


class TransferChildLicense(graphene.Mutation):
    """
    Transfer a child license to a new parent.

    Requires enterprise tier.
    """
    class Arguments:
        input = TransferChildLicenseInput(required=True)

    license = graphene.Field(LicenseType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.KEYS_BULK_PROVISIONING)
    def mutate(cls, root, info, input):
        if not info.context.user.is_authenticated:
            return TransferChildLicense(success=False, error="Authentication required")

        user_orgs = list(get_user_organizations(info.context.user))

        try:
            child_license = License.objects.select_related('parent_license', 'organization').get(
                id=input.child_license_id
            )
        except License.DoesNotExist:
            return TransferChildLicense(success=False, error="Child license not found")

        # User must have access to current parent's organization
        if child_license.parent_license_id:
            if child_license.parent_license.organization_id not in user_orgs:
                return TransferChildLicense(success=False, error="Access denied to current parent")

        try:
            new_parent = License.objects.get(
                id=input.new_parent_license_id,
                organization_id__in=user_orgs
            )
        except License.DoesNotExist:
            return TransferChildLicense(success=False, error="New parent license not found")

        # Transfer
        success, error = license_hierarchy_service.transfer_child_license(
            child_license=child_license,
            new_parent_license=new_parent
        )

        if not success:
            return TransferChildLicense(success=False, error=error)

        child_license.refresh_from_db()
        return TransferChildLicense(
            success=True,
            license=LicenseType.from_model(child_license)
        )


class RevokeChildLicense(graphene.Mutation):
    """
    Revoke a child license.

    Requires enterprise tier.
    """
    class Arguments:
        child_license_id = graphene.UUID(required=True)
        reason = graphene.String()

    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.KEYS_BULK_PROVISIONING)
    def mutate(cls, root, info, child_license_id, reason=None):
        if not info.context.user.is_authenticated:
            return RevokeChildLicense(success=False, error="Authentication required")

        user_orgs = list(get_user_organizations(info.context.user))

        try:
            child_license = License.objects.select_related('parent_license', 'organization').get(
                id=child_license_id
            )
        except License.DoesNotExist:
            return RevokeChildLicense(success=False, error="Child license not found")

        # User must have access to parent's organization
        if child_license.parent_license_id:
            if child_license.parent_license.organization_id not in user_orgs:
                return RevokeChildLicense(success=False, error="Access denied to parent license")

        # Revoke
        success, error = license_hierarchy_service.revoke_child_license(
            child_license=child_license,
            reason=reason or ""
        )

        if not success:
            return RevokeChildLicense(success=False, error=error)

        return RevokeChildLicense(success=True)


class PropagateParentEntitlements(graphene.Mutation):
    """
    Propagate entitlements from parent to all child licenses.

    Requires enterprise tier.
    """
    class Arguments:
        parent_license_id = graphene.UUID(required=True)
        force = graphene.Boolean()

    updated_count = graphene.Int()
    errors = graphene.List(graphene.String)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.KEYS_BULK_PROVISIONING)
    def mutate(cls, root, info, parent_license_id, force=False):
        if not info.context.user.is_authenticated:
            return PropagateParentEntitlements(success=False, error="Authentication required")

        user_orgs = list(get_user_organizations(info.context.user))

        try:
            parent_license = License.objects.get(
                id=parent_license_id,
                organization_id__in=user_orgs
            )
        except License.DoesNotExist:
            return PropagateParentEntitlements(success=False, error="Parent license not found")

        if not parent_license.is_parent_license:
            return PropagateParentEntitlements(
                success=False,
                error="License is not configured as a parent license"
            )

        updated_count, errors = license_hierarchy_service.propagate_entitlements(
            parent_license=parent_license,
            force=force or False
        )

        return PropagateParentEntitlements(
            success=True,
            updated_count=updated_count,
            errors=errors
        )


class GetLicenseHierarchy(graphene.Mutation):
    """
    Get the full license hierarchy tree for a parent license.

    Requires enterprise tier.
    """
    class Arguments:
        parent_license_id = graphene.UUID(required=True)

    hierarchy = graphene.Field(LicenseHierarchyType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_feature_for_mutation(Features.KEYS_BULK_PROVISIONING)
    def mutate(cls, root, info, parent_license_id):
        if not info.context.user.is_authenticated:
            return GetLicenseHierarchy(success=False, error="Authentication required")

        user_orgs = list(get_user_organizations(info.context.user))

        try:
            parent_license = License.objects.select_related('organization').get(
                id=parent_license_id,
                organization_id__in=user_orgs
            )
        except License.DoesNotExist:
            return GetLicenseHierarchy(success=False, error="Parent license not found")

        hierarchy_dict = license_hierarchy_service.get_hierarchy_tree(parent_license)

        # Convert to GraphQL type
        def dict_to_type(d):
            return LicenseHierarchyType(
                id=d['id'],
                organization_id=d['organization_id'],
                organization_name=d['organization_name'],
                status=d['status'],
                license_type=d['license_type'],
                features=d['features'],
                limits=d['limits'],
                inherit_entitlements=d['inherit_entitlements'],
                children=[dict_to_type(c) for c in d['children']]
            )

        return GetLicenseHierarchy(
            success=True,
            hierarchy=dict_to_type(hierarchy_dict)
        )
