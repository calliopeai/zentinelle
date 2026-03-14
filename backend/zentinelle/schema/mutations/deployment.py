"""
Deployment-related GraphQL mutations.
"""
import logging

import graphene

from deployments.models import Deployment
from organization.models import OrganizationMember
from zentinelle.models import AgentEndpoint
from zentinelle.schema.types import DeploymentType, TerraformProvisionType

logger = logging.getLogger(__name__)


def get_user_organizations(user):
    """Get all organizations the user belongs to."""
    return OrganizationMember.objects.filter(
        member=user
    ).values_list('organization_id', flat=True)


class CreateDeploymentInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    slug = graphene.String()
    description = graphene.String()
    environment = graphene.String()
    deployment_type = graphene.String()
    hosting_model = graphene.String()
    cloud_config_id = graphene.UUID()
    cloud_provider = graphene.String()
    cloud_region = graphene.String()
    cluster_arn = graphene.String()
    secrets_arn = graphene.String()
    site_name = graphene.String()
    hub_url = graphene.String()
    internal_url = graphene.String()
    health_check_url = graphene.String()
    config = graphene.JSONString()
    status = graphene.String(description="Set initial status (default: pending)")
    is_internal = graphene.Boolean(description="Mark as internal Calliope deployment")


class UpdateDeploymentInput(graphene.InputObjectType):
    id = graphene.ID(required=True)
    name = graphene.String()
    description = graphene.String()
    environment = graphene.String()
    deployment_type = graphene.String()
    hosting_model = graphene.String()
    cloud_config_id = graphene.UUID()
    cloud_provider = graphene.String()
    cloud_region = graphene.String()
    cluster_arn = graphene.String()
    secrets_arn = graphene.String()
    site_name = graphene.String()
    hub_url = graphene.String()
    internal_url = graphene.String()
    health_check_url = graphene.String()
    health_check_interval = graphene.Int()
    config = graphene.JSONString()
    status = graphene.String()
    is_internal = graphene.Boolean(description="Mark as internal Calliope deployment")


class CreateDeployment(graphene.Mutation):
    class Arguments:
        organization_id = graphene.ID(required=True, description="Organization ID (integer or relay global ID)")
        input = CreateDeploymentInput(required=True)

    deployment = graphene.Field(DeploymentType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, organization_id, input):
        if not info.context.user.is_authenticated:
            return CreateDeployment(success=False, error="Authentication required")

        from organization.models import Organization, CloudConfiguration
        from graphql_relay import from_global_id

        # Handle both relay global ID and raw integer ID
        try:
            type_name, obj_id = from_global_id(organization_id)
            org_id = int(obj_id)
        except Exception:
            org_id = int(organization_id)

        try:
            org = Organization.objects.get(id=org_id)
        except Organization.DoesNotExist:
            return CreateDeployment(success=False, error="Organization not found")

        # Validate cloud_config if provided
        cloud_config = None
        if input.cloud_config_id:
            try:
                cloud_config = CloudConfiguration.objects.get(
                    id=input.cloud_config_id,
                    organization=org
                )
            except CloudConfiguration.DoesNotExist:
                return CreateDeployment(success=False, error="Cloud configuration not found")

        deployment = Deployment.objects.create(
            organization=org,
            cloud_config=cloud_config,
            name=input.name,
            slug=input.get('slug', ''),
            description=input.get('description', ''),
            environment=input.get('environment', Deployment.Environment.DEVELOPMENT),
            deployment_type=input.get('deployment_type', Deployment.DeploymentType.JUNOHUB),
            hosting_model=input.get('hosting_model', Deployment.HostingModel.MANAGED_ECS),
            cloud_provider=input.get('cloud_provider', ''),
            cloud_region=input.get('cloud_region', 'us-west-2'),
            cluster_arn=input.get('cluster_arn', ''),
            secrets_arn=input.get('secrets_arn', ''),
            site_name=input.get('site_name', ''),
            hub_url=input.get('hub_url', ''),
            internal_url=input.get('internal_url', ''),
            health_check_url=input.get('health_check_url', ''),
            config=input.get('config', {}),
            status=input.get('status', Deployment.Status.PENDING),
            is_internal=input.get('is_internal', False),
        )

        return CreateDeployment(success=True, deployment=deployment)


class UpdateDeployment(graphene.Mutation):
    class Arguments:
        input = UpdateDeploymentInput(required=True)

    deployment = graphene.Field(DeploymentType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, input):
        if not info.context.user.is_authenticated:
            return UpdateDeployment(success=False, error="Authentication required")

        from organization.models import CloudConfiguration

        # Verify organization membership
        user_orgs = get_user_organizations(info.context.user)
        try:
            deployment = Deployment.objects.get(id=input.id, organization_id__in=user_orgs)
        except Deployment.DoesNotExist:
            return UpdateDeployment(success=False, error="Deployment not found")

        # Handle cloud_config update
        if input.cloud_config_id is not None:
            if input.cloud_config_id:
                try:
                    cloud_config = CloudConfiguration.objects.get(
                        id=input.cloud_config_id,
                        organization=deployment.organization
                    )
                    deployment.cloud_config = cloud_config
                except CloudConfiguration.DoesNotExist:
                    return UpdateDeployment(success=False, error="Cloud configuration not found")
            else:
                deployment.cloud_config = None

        # Update simple fields
        if input.name:
            deployment.name = input.name
        if input.description is not None:
            deployment.description = input.description
        if input.environment:
            deployment.environment = input.environment
        if input.deployment_type:
            deployment.deployment_type = input.deployment_type
        if input.hosting_model:
            deployment.hosting_model = input.hosting_model
        if input.cloud_provider is not None:
            deployment.cloud_provider = input.cloud_provider
        if input.cloud_region:
            deployment.cloud_region = input.cloud_region
        if input.cluster_arn is not None:
            deployment.cluster_arn = input.cluster_arn
        if input.secrets_arn is not None:
            deployment.secrets_arn = input.secrets_arn
        if input.site_name is not None:
            deployment.site_name = input.site_name
        if input.hub_url is not None:
            deployment.hub_url = input.hub_url
        if input.internal_url is not None:
            deployment.internal_url = input.internal_url
        if input.health_check_url is not None:
            deployment.health_check_url = input.health_check_url
        if input.health_check_interval is not None:
            deployment.health_check_interval = input.health_check_interval
        if input.config:
            deployment.config = input.config
        if input.status:
            deployment.status = input.status
        if input.is_internal is not None:
            deployment.is_internal = input.is_internal

        deployment.save()

        return UpdateDeployment(success=True, deployment=deployment)


class DeleteDeployment(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, id):
        if not info.context.user.is_authenticated:
            return DeleteDeployment(success=False, error="Authentication required")

        # Verify organization membership
        user_orgs = get_user_organizations(info.context.user)
        try:
            deployment = Deployment.objects.get(id=id, organization_id__in=user_orgs)
            deployment.delete()
            return DeleteDeployment(success=True)
        except Deployment.DoesNotExist:
            return DeleteDeployment(success=False, error="Deployment not found")


class ProvisionDeployment(graphene.Mutation):
    """
    Provision a deployment - creates JunoHubConfig and triggers Terraform.

    This is the main entry point for spinning up new infrastructure.
    """
    class Arguments:
        deployment_id = graphene.ID(required=True)
        trigger_method = graphene.String(description="webhook, api, github_actions, or manual")
        auto_trigger = graphene.Boolean(default_value=True)

    deployment = graphene.Field(DeploymentType)
    provision = graphene.Field(TerraformProvisionType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, deployment_id, trigger_method='webhook', auto_trigger=True):
        if not info.context.user.is_authenticated:
            return ProvisionDeployment(success=False, error="Authentication required")

        # Verify organization membership
        user_orgs = get_user_organizations(info.context.user)
        try:
            deployment = Deployment.objects.get(id=deployment_id, organization_id__in=user_orgs)
        except Deployment.DoesNotExist:
            return ProvisionDeployment(success=False, error="Deployment not found")

        # Can only provision pending or failed deployments
        if deployment.status not in [Deployment.Status.PENDING, Deployment.Status.TERMINATED]:
            return ProvisionDeployment(
                success=False,
                error=f"Cannot provision deployment in status: {deployment.status}"
            )

        try:
            provision = deployment.provision(
                trigger_method=trigger_method,
                auto_trigger=auto_trigger
            )
            return ProvisionDeployment(
                success=True,
                deployment=deployment,
                provision=provision
            )
        except Exception as e:
            logger.exception(f"Error provisioning deployment: {e}")
            return ProvisionDeployment(success=False, error="Failed to provision deployment")


class GenerateDeploymentApiKey(graphene.Mutation):
    """
    Generate or rotate a deployment API key.

    Returns the full API key (only shown once - not stored).
    Use this key for deployment heartbeats: X-Zentinelle-Key: sk_deploy_...
    """
    class Arguments:
        deployment_id = graphene.ID(required=True)
        rotate = graphene.Boolean(
            default_value=False,
            description="If True, rotates existing key. If False, only generates if no key exists."
        )

    api_key = graphene.String(description="The full API key (only shown once)")
    deployment = graphene.Field(DeploymentType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, deployment_id, rotate=False):
        if not info.context.user.is_authenticated:
            return GenerateDeploymentApiKey(success=False, error="Authentication required")

        from graphql_relay import from_global_id

        # Handle relay global ID
        try:
            type_name, uuid_str = from_global_id(deployment_id)
            if type_name == 'DeploymentType':
                deployment_id = uuid_str
        except Exception:
            pass  # Assume it's already a raw UUID

        # Verify organization membership
        user_orgs = get_user_organizations(info.context.user)
        try:
            deployment = Deployment.objects.get(id=deployment_id, organization_id__in=user_orgs)
        except Deployment.DoesNotExist:
            return GenerateDeploymentApiKey(success=False, error="Deployment not found")

        # Check if key already exists and rotate not requested
        if deployment.has_api_key() and not rotate:
            return GenerateDeploymentApiKey(
                success=False,
                error="Deployment already has an API key. Set rotate=True to generate a new one."
            )

        # Generate or rotate key
        api_key = deployment.rotate_api_key()

        return GenerateDeploymentApiKey(
            success=True,
            api_key=api_key,
            deployment=deployment
        )


class RevokeDeploymentApiKey(graphene.Mutation):
    """
    Revoke a deployment's API key without generating a new one.
    """
    class Arguments:
        deployment_id = graphene.ID(required=True)

    deployment = graphene.Field(DeploymentType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, deployment_id):
        if not info.context.user.is_authenticated:
            return RevokeDeploymentApiKey(success=False, error="Authentication required")

        from graphql_relay import from_global_id

        # Handle relay global ID
        try:
            type_name, uuid_str = from_global_id(deployment_id)
            if type_name == 'DeploymentType':
                deployment_id = uuid_str
        except Exception:
            pass

        # Verify organization membership
        user_orgs = get_user_organizations(info.context.user)
        try:
            deployment = Deployment.objects.get(id=deployment_id, organization_id__in=user_orgs)
        except Deployment.DoesNotExist:
            return RevokeDeploymentApiKey(success=False, error="Deployment not found")

        if not deployment.has_api_key():
            return RevokeDeploymentApiKey(
                success=False,
                error="Deployment has no API key to revoke"
            )

        # Clear the key
        deployment.api_key_hash = ''
        deployment.api_key_prefix = ''
        deployment.api_key_created_at = None
        deployment.save(update_fields=['api_key_hash', 'api_key_prefix', 'api_key_created_at', 'updated_at'])

        return RevokeDeploymentApiKey(success=True, deployment=deployment)


class CreateInternalDeployment(graphene.Mutation):
    """
    Create an internal Calliope deployment (hub-calliope-dev, etc.).

    Internal deployments:
    - Skip the normal provisioning flow
    - Are managed by Calliope's infrastructure team
    - Auto-create JunoHubConfig with Bedrock enabled
    - Start in ACTIVE status

    Requires staff permissions.
    """
    class Arguments:
        organization_id = graphene.ID(required=True)
        name = graphene.String(required=True, description="Display name (e.g., 'Calliope Dev Hub')")
        slug = graphene.String(required=True, description="URL slug (e.g., 'hub-calliope-dev')")
        hub_url = graphene.String(required=True, description="Public URL (e.g., 'https://hub.dev.softinfra.net')")
        environment = graphene.String(default_value='development')
        cloud_region = graphene.String(default_value='us-west-2')
        cluster_arn = graphene.String(description="ECS cluster ARN")
        secrets_arn = graphene.String(description="AWS Secrets Manager ARN")
        description = graphene.String()

    deployment = graphene.Field(DeploymentType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, organization_id, name, slug, hub_url, **kwargs):
        from django.utils import timezone
        from organization.models import Organization
        from deployments.models import JunoHubConfig
        from graphql_relay import from_global_id

        user = info.context.user
        if not user.is_authenticated:
            return CreateInternalDeployment(success=False, error="Authentication required")

        # Require staff permissions
        if not user.is_staff:
            return CreateInternalDeployment(
                success=False,
                error="Staff permissions required to create internal deployments"
            )

        # Handle both relay global ID and raw integer ID
        try:
            type_name, obj_id = from_global_id(organization_id)
            org_id = int(obj_id)
        except Exception:
            org_id = int(organization_id)

        try:
            org = Organization.objects.get(id=org_id)
        except Organization.DoesNotExist:
            return CreateInternalDeployment(success=False, error="Organization not found")

        # Check if deployment with this slug already exists
        if Deployment.objects.filter(organization=org, slug=slug).exists():
            return CreateInternalDeployment(
                success=False,
                error=f"Deployment with slug '{slug}' already exists for this organization"
            )

        # Create the deployment
        deployment = Deployment.objects.create(
            organization=org,
            name=name,
            slug=slug,
            description=kwargs.get('description', f'Internal Calliope deployment: {name}'),
            environment=kwargs.get('environment', Deployment.Environment.DEVELOPMENT),
            deployment_type=Deployment.DeploymentType.JUNOHUB,
            hosting_model=Deployment.HostingModel.MANAGED_ECS,
            cloud_provider='aws',
            cloud_region=kwargs.get('cloud_region', 'us-west-2'),
            cluster_arn=kwargs.get('cluster_arn', ''),
            secrets_arn=kwargs.get('secrets_arn', ''),
            hub_url=hub_url,
            status=Deployment.Status.ACTIVE,
            is_internal=True,
            last_deployed_at=timezone.now(),
        )

        # Auto-create JunoHubConfig with Bedrock enabled
        try:
            env_map = {
                'development': JunoHubConfig.Environment.DEVELOPMENT,
                'staging': JunoHubConfig.Environment.STAGING,
                'production': JunoHubConfig.Environment.PRODUCTION,
            }
            config = JunoHubConfig.objects.create(
                organization=org,
                deployment=deployment,
                name=name,
                slug=slug,
                description=f'Config for {name}',
                environment=env_map.get(deployment.environment, JunoHubConfig.Environment.DEVELOPMENT),
                platform=JunoHubConfig.PlatformType.ECS,
                jupyterhub_host=hub_url,
                jupyterhub_public_url=hub_url,
                # Bedrock is enabled by default via model default
                is_active=True,
                last_deployed_at=timezone.now(),
            )
            logger.info(f"Created JunoHubConfig {config.id} for internal deployment {deployment.id}")
        except Exception as e:
            logger.error(f"Failed to create JunoHubConfig for internal deployment: {e}")
            # Don't fail the deployment creation, just log the error

        logger.info(
            f"Created internal deployment {deployment.id} ({name}) "
            f"for organization {org.name}"
        )

        return CreateInternalDeployment(success=True, deployment=deployment)
