"""
License Hierarchy GraphQL Mutations.

Enterprise-only mutations for managing parent/child license relationships.
"""
import logging
import uuid
from typing import Optional

import strawberry
from strawberry.scalars import JSON

from zentinelle.models import License

try:
    from billing.features import require_feature_for_mutation, Features
except ImportError:
    class Features:
        KEYS_BULK_PROVISIONING = 'keys_bulk_provisioning'
    def require_feature_for_mutation(feature):
        def decorator(fn):
            return fn
        return decorator

try:
    from zentinelle.services.license_hierarchy_service import license_hierarchy_service
except ImportError:
    license_hierarchy_service = None

logger = logging.getLogger(__name__)


def get_user_organizations(user):
    """Get all organizations the user belongs to."""
    from organization.models import OrganizationMember
    return OrganizationMember.objects.filter(
        member=user
    ).values_list('organization_id', flat=True)



@strawberry.type
class LicenseHierarchyType:
    id: Optional[uuid.UUID] = None
    organization_id: Optional[uuid.UUID] = None
    organization_name: Optional[str] = None
    status: Optional[str] = None
    license_type: Optional[str] = None
    features: Optional[JSON] = None
    limits: Optional[JSON] = None
    inherit_entitlements: Optional[bool] = None
    children: Optional[list['LicenseHierarchyType']] = None


@strawberry.type
class LicenseType:
    id: Optional[uuid.UUID] = None
    organization_id: Optional[uuid.UUID] = None
    organization_name: Optional[str] = None
    license_key: Optional[str] = None
    status: Optional[str] = None
    license_type: Optional[str] = None
    is_parent_license: Optional[bool] = None
    is_child_license: Optional[bool] = None
    parent_license_id: Optional[uuid.UUID] = None
    max_child_licenses: Optional[int] = None
    child_license_count: Optional[int] = None
    inherit_entitlements: Optional[bool] = None
    features: Optional[JSON] = None
    max_deployments: Optional[int] = None
    max_agents: Optional[int] = None
    max_users: Optional[int] = None

    @staticmethod
    def from_model(license_obj: License) -> 'LicenseType':
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


@strawberry.input
class CreateChildLicenseInput:
    parent_license_id: uuid.UUID
    child_organization_id: uuid.UUID
    entitlements: Optional[JSON] = None
    max_deployments: Optional[int] = None
    max_agents: Optional[int] = None
    max_users: Optional[int] = None
    inherit_entitlements: Optional[bool] = None


@strawberry.input
class UpdateChildEntitlementsInput:
    child_license_id: uuid.UUID
    entitlements: JSON
    max_deployments: Optional[int] = None
    max_agents: Optional[int] = None
    max_users: Optional[int] = None


@strawberry.input
class TransferChildLicenseInput:
    child_license_id: uuid.UUID
    new_parent_license_id: uuid.UUID


@strawberry.type
class CreateChildLicensePayload:
    license: Optional[LicenseType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class UpdateChildEntitlementsPayload:
    license: Optional[LicenseType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class TransferChildLicensePayload:
    license: Optional[LicenseType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class RevokeChildLicensePayload:
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class PropagateParentEntitlementsPayload:
    updated_count: Optional[int] = None
    errors: Optional[list[str]] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class GetLicenseHierarchyPayload:
    hierarchy: Optional[LicenseHierarchyType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


def create_child_license(info: strawberry.types.Info, input: CreateChildLicenseInput) -> CreateChildLicensePayload:
    if not info.context.request.user.is_authenticated:
        return CreateChildLicensePayload(success=False, error="Authentication required")

    user_orgs = list(get_user_organizations(info.context.request.user))

    try:
        parent_license = License.objects.get(
            id=input.parent_license_id,
            organization_id__in=user_orgs
        )
    except License.DoesNotExist:
        return CreateChildLicensePayload(success=False, error="Parent license not found")

    from organization.models import Organization
    try:
        child_org = Organization.objects.get(id=input.child_organization_id)
    except Organization.DoesNotExist:
        return CreateChildLicensePayload(success=False, error="Child organization not found")

    entitlements = None
    if input.entitlements:
        import json
        try:
            entitlements = json.loads(input.entitlements) if isinstance(input.entitlements, str) else input.entitlements
        except json.JSONDecodeError:
            return CreateChildLicensePayload(success=False, error="Invalid entitlements JSON")

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
        return CreateChildLicensePayload(success=False, error=error)

    return CreateChildLicensePayload(
        success=True,
        license=LicenseType.from_model(child_license)
    )


def update_child_entitlements(info: strawberry.types.Info, input: UpdateChildEntitlementsInput) -> UpdateChildEntitlementsPayload:
    if not info.context.request.user.is_authenticated:
        return UpdateChildEntitlementsPayload(success=False, error="Authentication required")

    user_orgs = list(get_user_organizations(info.context.request.user))

    try:
        child_license = License.objects.select_related('parent_license', 'organization').get(
            id=input.child_license_id
        )
    except License.DoesNotExist:
        return UpdateChildEntitlementsPayload(success=False, error="Child license not found")

    if child_license.parent_license_id:
        if child_license.parent_license.organization_id not in user_orgs:
            return UpdateChildEntitlementsPayload(success=False, error="Access denied to parent license")

    import json
    try:
        entitlements = json.loads(input.entitlements) if isinstance(input.entitlements, str) else input.entitlements
    except json.JSONDecodeError:
        return UpdateChildEntitlementsPayload(success=False, error="Invalid entitlements JSON")

    limits = {}
    if input.max_deployments is not None:
        limits['max_deployments'] = input.max_deployments
    if input.max_agents is not None:
        limits['max_agents'] = input.max_agents
    if input.max_users is not None:
        limits['max_users'] = input.max_users

    success, error = license_hierarchy_service.update_child_entitlements(
        child_license=child_license,
        entitlements=entitlements,
        limits=limits if limits else None
    )

    if not success:
        return UpdateChildEntitlementsPayload(success=False, error=error)

    child_license.refresh_from_db()
    return UpdateChildEntitlementsPayload(
        success=True,
        license=LicenseType.from_model(child_license)
    )


def transfer_child_license(info: strawberry.types.Info, input: TransferChildLicenseInput) -> TransferChildLicensePayload:
    if not info.context.request.user.is_authenticated:
        return TransferChildLicensePayload(success=False, error="Authentication required")

    user_orgs = list(get_user_organizations(info.context.request.user))

    try:
        child_license = License.objects.select_related('parent_license', 'organization').get(
            id=input.child_license_id
        )
    except License.DoesNotExist:
        return TransferChildLicensePayload(success=False, error="Child license not found")

    if child_license.parent_license_id:
        if child_license.parent_license.organization_id not in user_orgs:
            return TransferChildLicensePayload(success=False, error="Access denied to current parent")

    try:
        new_parent = License.objects.get(
            id=input.new_parent_license_id,
            organization_id__in=user_orgs
        )
    except License.DoesNotExist:
        return TransferChildLicensePayload(success=False, error="New parent license not found")

    success, error = license_hierarchy_service.transfer_child_license(
        child_license=child_license,
        new_parent_license=new_parent
    )

    if not success:
        return TransferChildLicensePayload(success=False, error=error)

    child_license.refresh_from_db()
    return TransferChildLicensePayload(
        success=True,
        license=LicenseType.from_model(child_license)
    )


def revoke_child_license(info: strawberry.types.Info, child_license_id: uuid.UUID, reason: Optional[str] = None) -> RevokeChildLicensePayload:
    if not info.context.request.user.is_authenticated:
        return RevokeChildLicensePayload(success=False, error="Authentication required")

    user_orgs = list(get_user_organizations(info.context.request.user))

    try:
        child_license = License.objects.select_related('parent_license', 'organization').get(
            id=child_license_id
        )
    except License.DoesNotExist:
        return RevokeChildLicensePayload(success=False, error="Child license not found")

    if child_license.parent_license_id:
        if child_license.parent_license.organization_id not in user_orgs:
            return RevokeChildLicensePayload(success=False, error="Access denied to parent license")

    success, error = license_hierarchy_service.revoke_child_license(
        child_license=child_license,
        reason=reason or ""
    )

    if not success:
        return RevokeChildLicensePayload(success=False, error=error)

    return RevokeChildLicensePayload(success=True)


def propagate_parent_entitlements(info: strawberry.types.Info, parent_license_id: uuid.UUID, force: Optional[bool] = False) -> PropagateParentEntitlementsPayload:
    if not info.context.request.user.is_authenticated:
        return PropagateParentEntitlementsPayload(success=False, error="Authentication required")

    user_orgs = list(get_user_organizations(info.context.request.user))

    try:
        parent_license = License.objects.get(
            id=parent_license_id,
            organization_id__in=user_orgs
        )
    except License.DoesNotExist:
        return PropagateParentEntitlementsPayload(success=False, error="Parent license not found")

    if not parent_license.is_parent_license:
        return PropagateParentEntitlementsPayload(
            success=False,
            error="License is not configured as a parent license"
        )

    updated_count, errors = license_hierarchy_service.propagate_entitlements(
        parent_license=parent_license,
        force=force or False
    )

    return PropagateParentEntitlementsPayload(
        success=True,
        updated_count=updated_count,
        errors=errors
    )


def get_license_hierarchy(info: strawberry.types.Info, parent_license_id: uuid.UUID) -> GetLicenseHierarchyPayload:
    if not info.context.request.user.is_authenticated:
        return GetLicenseHierarchyPayload(success=False, error="Authentication required")

    user_orgs = list(get_user_organizations(info.context.request.user))

    try:
        parent_license = License.objects.select_related('organization').get(
            id=parent_license_id,
            organization_id__in=user_orgs
        )
    except License.DoesNotExist:
        return GetLicenseHierarchyPayload(success=False, error="Parent license not found")

    hierarchy_dict = license_hierarchy_service.get_hierarchy_tree(parent_license)

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

    return GetLicenseHierarchyPayload(
        success=True,
        hierarchy=dict_to_type(hierarchy_dict)
    )
