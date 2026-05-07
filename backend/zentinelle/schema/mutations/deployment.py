"""
Deployment-related GraphQL mutations.
"""
import logging
import uuid
from typing import Optional

import strawberry
from strawberry.scalars import JSON

from deployments.models import Deployment
from organization.models import OrganizationMember
from zentinelle.schema.types import DeploymentType, TerraformProvisionType

logger = logging.getLogger(__name__)


def get_user_organizations(user):
    """Get all organizations the user belongs to."""
    return OrganizationMember.objects.filter(
        member=user
    ).values_list('organization_id', flat=True)


@strawberry.input
class CreateDeploymentInput:
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    environment: Optional[str] = None
    deployment_type: Optional[str] = None
    hosting_model: Optional[str] = None
    cloud_config_id: Optional[uuid.UUID] = None
    cloud_provider: Optional[str] = None
    cloud_region: Optional[str] = None
    cluster_arn: Optional[str] = None
    secrets_arn: Optional[str] = None
    site_name: Optional[str] = None
    hub_url: Optional[str] = None
    internal_url: Optional[str] = None
    health_check_url: Optional[str] = None
    config: Optional[JSON] = None
    status: Optional[str] = None
    is_internal: Optional[bool] = None


@strawberry.input
class UpdateDeploymentInput:
    id: strawberry.ID
    name: Optional[str] = None
    description: Optional[str] = None
    environment: Optional[str] = None
    deployment_type: Optional[str] = None
    hosting_model: Optional[str] = None
    cloud_config_id: Optional[uuid.UUID] = None
    cloud_provider: Optional[str] = None
    cloud_region: Optional[str] = None
    cluster_arn: Optional[str] = None
    secrets_arn: Optional[str] = None
    site_name: Optional[str] = None
    hub_url: Optional[str] = None
    internal_url: Optional[str] = None
    health_check_url: Optional[str] = None
    health_check_interval: Optional[int] = None
    config: Optional[JSON] = None
    status: Optional[str] = None
    is_internal: Optional[bool] = None


@strawberry.type
class CreateDeploymentPayload:
    deployment: Optional[DeploymentType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class UpdateDeploymentPayload:
    deployment: Optional[DeploymentType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class DeleteDeploymentPayload:
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class ProvisionDeploymentPayload:
    deployment: Optional[DeploymentType] = None
    provision: Optional[TerraformProvisionType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class GenerateDeploymentApiKeyPayload:
    api_key: Optional[str] = None
    deployment: Optional[DeploymentType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class RevokeDeploymentApiKeyPayload:
    deployment: Optional[DeploymentType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class CreateInternalDeploymentPayload:
    deployment: Optional[DeploymentType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


def create_deployment(info: strawberry.types.Info, organization_id: strawberry.ID, input: CreateDeploymentInput) -> CreateDeploymentPayload:
    if not info.context.request.user.is_authenticated:
        return CreateDeploymentPayload(success=False, error="Authentication required")

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
        return CreateDeploymentPayload(success=False, error="Organization not found")

    # Validate cloud_config if provided
    cloud_config = None
    if input.cloud_config_id:
        try:
            cloud_config = CloudConfiguration.objects.get(
                id=input.cloud_config_id,
                organization=org
            )
        except CloudConfiguration.DoesNotExist:
            return CreateDeploymentPayload(success=False, error="Cloud configuration not found")

    deployment = Deployment.objects.create(
        organization=org,
        cloud_config=cloud_config,
        name=input.name,
        slug=input.slug or '',
        description=input.description or '',
        environment=input.environment or Deployment.Environment.DEVELOPMENT,
        deployment_type=input.deployment_type or Deployment.DeploymentType.JUNOHUB,
        hosting_model=input.hosting_model or Deployment.HostingModel.MANAGED_ECS,
        cloud_provider=input.cloud_provider or '',
        cloud_region=input.cloud_region or 'us-west-2',
        cluster_arn=input.cluster_arn or '',
        secrets_arn=input.secrets_arn or '',
        site_name=input.site_name or '',
        hub_url=input.hub_url or '',
        internal_url=input.internal_url or '',
        health_check_url=input.health_check_url or '',
        config=input.config or {},
        status=input.status or Deployment.Status.PENDING,
        is_internal=input.is_internal or False,
    )

    return CreateDeploymentPayload(success=True, deployment=deployment)


def update_deployment(info: strawberry.types.Info, input: UpdateDeploymentInput) -> UpdateDeploymentPayload:
    if not info.context.request.user.is_authenticated:
        return UpdateDeploymentPayload(success=False, error="Authentication required")

    from organization.models import CloudConfiguration

    # Verify organization membership
    user_orgs = get_user_organizations(info.context.request.user)
    try:
        deployment = Deployment.objects.get(id=input.id, organization_id__in=user_orgs)
    except Deployment.DoesNotExist:
        return UpdateDeploymentPayload(success=False, error="Deployment not found")

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
                return UpdateDeploymentPayload(success=False, error="Cloud configuration not found")
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

    return UpdateDeploymentPayload(success=True, deployment=deployment)


def delete_deployment(info: strawberry.types.Info, id: strawberry.ID) -> DeleteDeploymentPayload:
    if not info.context.request.user.is_authenticated:
        return DeleteDeploymentPayload(success=False, error="Authentication required")

    # Verify organization membership
    user_orgs = get_user_organizations(info.context.request.user)
    try:
        deployment = Deployment.objects.get(id=id, organization_id__in=user_orgs)
        deployment.delete()
        return DeleteDeploymentPayload(success=True)
    except Deployment.DoesNotExist:
        return DeleteDeploymentPayload(success=False, error="Deployment not found")


def provision_deployment(info: strawberry.types.Info, deployment_id: strawberry.ID, trigger_method: Optional[str] = 'webhook', auto_trigger: Optional[bool] = True) -> ProvisionDeploymentPayload:
    if not info.context.request.user.is_authenticated:
        return ProvisionDeploymentPayload(success=False, error="Authentication required")

    # Verify organization membership
    user_orgs = get_user_organizations(info.context.request.user)
    try:
        deployment = Deployment.objects.get(id=deployment_id, organization_id__in=user_orgs)
    except Deployment.DoesNotExist:
        return ProvisionDeploymentPayload(success=False, error="Deployment not found")

    # Can only provision pending or failed deployments
    if deployment.status not in [Deployment.Status.PENDING, Deployment.Status.TERMINATED]:
        return ProvisionDeploymentPayload(
            success=False,
            error=f"Cannot provision deployment in status: {deployment.status}"
        )

    try:
        provision = deployment.provision(
            trigger_method=trigger_method,
            auto_trigger=auto_trigger
        )
        return ProvisionDeploymentPayload(
            success=True,
            deployment=deployment,
            provision=provision
        )
    except Exception as e:
        logger.exception(f"Error provisioning deployment: {e}")
        return ProvisionDeploymentPayload(success=False, error="Failed to provision deployment")


def generate_deployment_api_key(info: strawberry.types.Info, deployment_id: strawberry.ID, rotate: Optional[bool] = False) -> GenerateDeploymentApiKeyPayload:
    if not info.context.request.user.is_authenticated:
        return GenerateDeploymentApiKeyPayload(success=False, error="Authentication required")

    from graphql_relay import from_global_id

    # Handle relay global ID
    try:
        type_name, uuid_str = from_global_id(deployment_id)
        if type_name == 'DeploymentType':
            deployment_id = uuid_str
    except Exception:
        pass  # Assume it's already a raw UUID

    # Verify organization membership
    user_orgs = get_user_organizations(info.context.request.user)
    try:
        deployment = Deployment.objects.get(id=deployment_id, organization_id__in=user_orgs)
    except Deployment.DoesNotExist:
        return GenerateDeploymentApiKeyPayload(success=False, error="Deployment not found")

    # Check if key already exists and rotate not requested
    if deployment.has_api_key() and not rotate:
        return GenerateDeploymentApiKeyPayload(
            success=False,
            error="Deployment already has an API key. Set rotate=True to generate a new one."
        )

    # Generate or rotate key
    api_key = deployment.rotate_api_key()

    return GenerateDeploymentApiKeyPayload(
        success=True,
        api_key=api_key,
        deployment=deployment
    )


def revoke_deployment_api_key(info: strawberry.types.Info, deployment_id: strawberry.ID) -> RevokeDeploymentApiKeyPayload:
    if not info.context.request.user.is_authenticated:
        return RevokeDeploymentApiKeyPayload(success=False, error="Authentication required")

    from graphql_relay import from_global_id

    # Handle relay global ID
    try:
        type_name, uuid_str = from_global_id(deployment_id)
        if type_name == 'DeploymentType':
            deployment_id = uuid_str
    except Exception:
        pass

    # Verify organization membership
    user_orgs = get_user_organizations(info.context.request.user)
    try:
        deployment = Deployment.objects.get(id=deployment_id, organization_id__in=user_orgs)
    except Deployment.DoesNotExist:
        return RevokeDeploymentApiKeyPayload(success=False, error="Deployment not found")

    if not deployment.has_api_key():
        return RevokeDeploymentApiKeyPayload(
            success=False,
            error="Deployment has no API key to revoke"
        )

    # Clear the key
    deployment.api_key_hash = ''
    deployment.api_key_prefix = ''
    deployment.api_key_created_at = None
    deployment.save(update_fields=['api_key_hash', 'api_key_prefix', 'api_key_created_at', 'updated_at'])

    return RevokeDeploymentApiKeyPayload(success=True, deployment=deployment)


def create_internal_deployment(info: strawberry.types.Info, organization_id: strawberry.ID, name: str, slug: str, hub_url: str, environment: Optional[str] = 'development', cloud_region: Optional[str] = 'us-west-2', cluster_arn: Optional[str] = None, secrets_arn: Optional[str] = None, description: Optional[str] = None) -> CreateInternalDeploymentPayload:
    from django.utils import timezone
    from organization.models import Organization
    from deployments.models import JunoHubConfig
    from graphql_relay import from_global_id

    user = info.context.request.user
    if not user.is_authenticated:
        return CreateInternalDeploymentPayload(success=False, error="Authentication required")

    # Require staff permissions
    if not user.is_staff:
        return CreateInternalDeploymentPayload(
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
        return CreateInternalDeploymentPayload(success=False, error="Organization not found")

    # Check if deployment with this slug already exists
    if Deployment.objects.filter(organization=org, slug=slug).exists():
        return CreateInternalDeploymentPayload(
            success=False,
            error=f"Deployment with slug '{slug}' already exists for this organization"
        )

    # Create the deployment
    deployment = Deployment.objects.create(
        organization=org,
        name=name,
        slug=slug,
        description=description or f'Internal Calliope AI deployment: {name}',
        environment=environment or Deployment.Environment.DEVELOPMENT,
        deployment_type=Deployment.DeploymentType.JUNOHUB,
        hosting_model=Deployment.HostingModel.MANAGED_ECS,
        cloud_provider='aws',
        cloud_region=cloud_region or 'us-west-2',
        cluster_arn=cluster_arn or '',
        secrets_arn=secrets_arn or '',
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

    return CreateInternalDeploymentPayload(success=True, deployment=deployment)
