"""
Policy-related GraphQL mutations.

These mutations require Zentinelle access (any tier: basic, pro, or enterprise).
"""
import logging

import graphene

from billing.features import require_zentinelle_access
from deployments.models import Deployment
from organization.models import OrganizationMember
from zentinelle.models import Policy, AgentEndpoint
from zentinelle.schema.types import PolicyType

logger = logging.getLogger(__name__)


def get_user_organizations(user):
    """Get all organizations the user belongs to."""
    return OrganizationMember.objects.filter(
        member=user
    ).values_list('organization_id', flat=True)


class CreatePolicyInput(graphene.InputObjectType):
    """Input for creating a policy."""
    name = graphene.String(required=True)
    description = graphene.String()
    policy_type = graphene.String(required=True)
    scope_type = graphene.String()
    scope_sub_organization_id = graphene.ID()
    scope_deployment_id = graphene.ID()
    scope_endpoint_id = graphene.ID()
    scope_user_id = graphene.ID()
    config = graphene.JSONString()
    priority = graphene.Int()
    enforcement = graphene.String()
    enabled = graphene.Boolean()


class UpdatePolicyInput(graphene.InputObjectType):
    """Input for updating a policy."""
    id = graphene.ID(required=True)
    name = graphene.String()
    description = graphene.String()
    config = graphene.JSONString()
    priority = graphene.Int()
    enforcement = graphene.String()
    enabled = graphene.Boolean()


class CreatePolicy(graphene.Mutation):
    """Create a new policy. Requires Zentinelle access."""
    class Arguments:
        organization_id = graphene.UUID(required=True)
        input = CreatePolicyInput(required=True)

    policy = graphene.Field(PolicyType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_zentinelle_access
    def mutate(cls, root, info, organization_id, input):
        if not info.context.user.is_authenticated:
            return CreatePolicy(success=False, error="Authentication required")

        from organization.models import Organization

        try:
            org = Organization.objects.get(id=organization_id)
        except Organization.DoesNotExist:
            return CreatePolicy(success=False, error="Organization not found")

        # Validate policy_type
        valid_types = [t.value for t in Policy.PolicyType]
        if input.policy_type not in valid_types:
            return CreatePolicy(success=False, error=f"Invalid policy type: {input.policy_type}")

        # Build policy data
        policy_data = {
            'organization': org,
            'name': input.name,
            'policy_type': input.policy_type,
            'description': input.description or '',
            'config': input.config or {},
            'priority': input.priority or 0,
            'enabled': input.enabled if input.enabled is not None else True,
        }

        # Handle scope
        scope_type = input.scope_type or Policy.ScopeType.ORGANIZATION
        policy_data['scope_type'] = scope_type

        if scope_type == Policy.ScopeType.SUB_ORGANIZATION and input.scope_sub_organization_id:
            from organization.models import SubOrganization
            try:
                sub_org = SubOrganization.objects.get(id=input.scope_sub_organization_id, organization=org)
                policy_data['scope_sub_organization'] = sub_org
            except SubOrganization.DoesNotExist:
                return CreatePolicy(success=False, error="Sub-organization not found")

        elif scope_type == Policy.ScopeType.DEPLOYMENT and input.scope_deployment_id:
            try:
                deployment = Deployment.objects.get(id=input.scope_deployment_id, organization=org)
                policy_data['scope_deployment'] = deployment
            except Deployment.DoesNotExist:
                return CreatePolicy(success=False, error="Deployment not found")

        elif scope_type == Policy.ScopeType.ENDPOINT and input.scope_endpoint_id:
            try:
                endpoint = AgentEndpoint.objects.get(id=input.scope_endpoint_id, organization=org)
                policy_data['scope_endpoint'] = endpoint
            except AgentEndpoint.DoesNotExist:
                return CreatePolicy(success=False, error="Endpoint not found")

        elif scope_type == Policy.ScopeType.USER and input.scope_user_id:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                user = User.objects.get(id=input.scope_user_id)
                policy_data['scope_user'] = user
            except User.DoesNotExist:
                return CreatePolicy(success=False, error="User not found")

        # Handle enforcement
        if input.enforcement:
            valid_enforcement = [e.value for e in Policy.Enforcement]
            if input.enforcement not in valid_enforcement:
                return CreatePolicy(success=False, error=f"Invalid enforcement: {input.enforcement}")
            policy_data['enforcement'] = input.enforcement

        # Set created_by to current user
        if info.context.user.is_authenticated:
            policy_data['created_by'] = info.context.user

        try:
            policy = Policy.objects.create(**policy_data)
            return CreatePolicy(success=True, policy=policy)
        except Exception as e:
            logger.exception(f"Error creating policy: {e}")
            return CreatePolicy(success=False, error="Failed to create policy")


class UpdatePolicy(graphene.Mutation):
    """Update an existing policy. Requires Zentinelle access."""
    class Arguments:
        input = UpdatePolicyInput(required=True)

    policy = graphene.Field(PolicyType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_zentinelle_access
    def mutate(cls, root, info, input):
        if not info.context.user.is_authenticated:
            return UpdatePolicy(success=False, error="Authentication required")

        # Get policy and verify organization membership
        user_orgs = get_user_organizations(info.context.user)
        try:
            policy = Policy.objects.get(id=input.id, organization_id__in=user_orgs)
        except Policy.DoesNotExist:
            return UpdatePolicy(success=False, error="Policy not found")

        # Update fields
        if input.name:
            policy.name = input.name
        if input.description is not None:
            policy.description = input.description
        if input.config:
            policy.config = input.config
        if input.priority is not None:
            policy.priority = input.priority
        if input.enabled is not None:
            policy.enabled = input.enabled
        if input.enforcement:
            valid_enforcement = [e.value for e in Policy.Enforcement]
            if input.enforcement not in valid_enforcement:
                return UpdatePolicy(success=False, error=f"Invalid enforcement: {input.enforcement}")
            policy.enforcement = input.enforcement

        try:
            policy.save()
            return UpdatePolicy(success=True, policy=policy)
        except Exception as e:
            logger.exception(f"Error updating policy: {e}")
            return UpdatePolicy(success=False, error="Failed to update policy")


class DeletePolicy(graphene.Mutation):
    """Delete a policy. Requires Zentinelle access."""
    class Arguments:
        id = graphene.ID(required=True)

    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_zentinelle_access
    def mutate(cls, root, info, id):
        if not info.context.user.is_authenticated:
            return DeletePolicy(success=False, error="Authentication required")

        # Verify organization membership
        user_orgs = get_user_organizations(info.context.user)
        try:
            policy = Policy.objects.get(id=id, organization_id__in=user_orgs)
            policy.delete()
            return DeletePolicy(success=True)
        except Policy.DoesNotExist:
            return DeletePolicy(success=False, error="Policy not found")


class DuplicatePolicy(graphene.Mutation):
    """Duplicate a policy (useful for creating similar policies). Requires Zentinelle access."""
    class Arguments:
        id = graphene.ID(required=True)
        new_name = graphene.String()

    policy = graphene.Field(PolicyType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    @require_zentinelle_access
    def mutate(cls, root, info, id, new_name=None):
        if not info.context.user.is_authenticated:
            return DuplicatePolicy(success=False, error="Authentication required")

        # Verify organization membership
        user_orgs = get_user_organizations(info.context.user)
        try:
            original = Policy.objects.get(id=id, organization_id__in=user_orgs)
        except Policy.DoesNotExist:
            return DuplicatePolicy(success=False, error="Policy not found")

        # Create copy
        new_policy = Policy.objects.create(
            organization=original.organization,
            name=new_name or f"{original.name} (Copy)",
            description=original.description,
            policy_type=original.policy_type,
            scope_type=original.scope_type,
            scope_sub_organization=original.scope_sub_organization,
            scope_deployment=original.scope_deployment,
            scope_endpoint=original.scope_endpoint,
            scope_user=original.scope_user,
            config=original.config.copy(),
            priority=original.priority,
            enforcement=original.enforcement,
            enabled=False,  # Start disabled
        )

        return DuplicatePolicy(success=True, policy=new_policy)


class TogglePolicyEnabled(graphene.Mutation):
    """Toggle policy enabled/disabled status."""
    class Arguments:
        id = graphene.ID(required=True)

    policy = graphene.Field(PolicyType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, id):
        if not info.context.user.is_authenticated:
            return TogglePolicyEnabled(success=False, error="Authentication required")

        # Verify organization membership
        user_orgs = get_user_organizations(info.context.user)
        try:
            policy = Policy.objects.get(id=id, organization_id__in=user_orgs)
            policy.enabled = not policy.enabled
            policy.save(update_fields=['enabled', 'updated_at'])
            return TogglePolicyEnabled(success=True, policy=policy)
        except Policy.DoesNotExist:
            return TogglePolicyEnabled(success=False, error="Policy not found")
