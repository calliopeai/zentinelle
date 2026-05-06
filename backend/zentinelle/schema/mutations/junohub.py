"""
JunoHub Config and Terraform Provision GraphQL mutations.
"""
import logging
import uuid
from typing import Optional

import strawberry
from strawberry.scalars import JSON

from deployments.models import JunoHubConfig, TerraformProvision
from zentinelle.schema.types import JunoHubConfigType, TerraformProvisionType

logger = logging.getLogger(__name__)


@strawberry.input
class CreateJunoHubConfigInput:
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    deployment_id: Optional[strawberry.ID] = None
    environment: Optional[str] = None
    platform: Optional[str] = None

    # Hub URLs
    jupyterhub_host: Optional[str] = None
    jupyterhub_public_url: Optional[str] = None
    jupyterhub_base_url: Optional[str] = None

    # Access control
    admin_groups: Optional[list[str]] = None
    allowed_groups: Optional[list[str]] = None

    # Cognito
    cognito_domain: Optional[str] = None
    cognito_region: Optional[str] = None

    # ECS config
    ecs_cluster: Optional[str] = None
    ecs_task_definition: Optional[str] = None
    ecs_security_group: Optional[str] = None
    ecs_subnet_ids: Optional[list[str]] = None
    aws_execution_role_arn: Optional[str] = None

    # Storage
    efs_file_system_id: Optional[str] = None
    efs_access_point_id: Optional[str] = None
    s3_config_bucket: Optional[str] = None
    s3_env_files_prefix: Optional[str] = None
    s3_vector_bucket: Optional[str] = None
    vector_store_s3_enabled: Optional[bool] = None

    # Database
    db_host: Optional[str] = None
    jupyterhub_db_url: Optional[str] = None
    mysql_demo_host: Optional[str] = None
    pg_demo_host: Optional[str] = None

    # Monitoring
    sentry_environment: Optional[str] = None
    sentry_release: Optional[str] = None
    microsoft_clarity_id: Optional[str] = None

    # AI providers
    enabled_ai_providers: Optional[list[str]] = None

    # Instance lifecycle
    instance_idle_timeout_hours: Optional[int] = None
    instance_max_runtime_hours: Optional[int] = None
    allow_user_instance_protection: Optional[bool] = None


@strawberry.input
class UpdateJunoHubConfigInput:
    id: strawberry.ID
    name: Optional[str] = None
    description: Optional[str] = None
    environment: Optional[str] = None
    platform: Optional[str] = None
    is_active: Optional[bool] = None

    # Hub URLs
    jupyterhub_host: Optional[str] = None
    jupyterhub_public_url: Optional[str] = None
    jupyterhub_base_url: Optional[str] = None

    # Access control
    admin_groups: Optional[list[str]] = None
    allowed_groups: Optional[list[str]] = None

    # Cognito
    cognito_domain: Optional[str] = None
    cognito_region: Optional[str] = None

    # ECS config
    ecs_cluster: Optional[str] = None
    ecs_task_definition: Optional[str] = None
    ecs_security_group: Optional[str] = None
    ecs_subnet_ids: Optional[list[str]] = None
    aws_execution_role_arn: Optional[str] = None

    # Storage
    efs_file_system_id: Optional[str] = None
    efs_access_point_id: Optional[str] = None
    s3_config_bucket: Optional[str] = None
    s3_env_files_prefix: Optional[str] = None
    s3_vector_bucket: Optional[str] = None
    vector_store_s3_enabled: Optional[bool] = None

    # Database
    db_host: Optional[str] = None
    jupyterhub_db_url: Optional[str] = None
    mysql_demo_host: Optional[str] = None
    pg_demo_host: Optional[str] = None

    # Monitoring
    sentry_environment: Optional[str] = None
    sentry_release: Optional[str] = None
    microsoft_clarity_id: Optional[str] = None

    # AI providers
    enabled_ai_providers: Optional[list[str]] = None

    # Instance lifecycle
    instance_idle_timeout_hours: Optional[int] = None
    instance_max_runtime_hours: Optional[int] = None
    allow_user_instance_protection: Optional[bool] = None


@strawberry.type
class CreateJunoHubConfigPayload:
    config: Optional[JunoHubConfigType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class UpdateJunoHubConfigPayload:
    config: Optional[JunoHubConfigType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class DeleteJunoHubConfigPayload:
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class GenerateHubTokensPayload:
    tokens: Optional[JSON] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class SyncJunoHubSecretsPayload:
    secrets_arn: Optional[str] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class CreateTerraformProvisionPayload:
    provision: Optional[TerraformProvisionType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class TriggerTerraformProvisionPayload:
    provision: Optional[TerraformProvisionType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class CancelTerraformProvisionPayload:
    success: Optional[bool] = None
    error: Optional[str] = None


def create_junohub_config(info: strawberry.types.Info, organization_id: uuid.UUID, input: CreateJunoHubConfigInput) -> CreateJunoHubConfigPayload:
    if not info.context.request.user.is_authenticated:
        return CreateJunoHubConfigPayload(success=False, error="Authentication required")

    from organization.models import Organization

    try:
        org = Organization.objects.get(id=organization_id)
    except Organization.DoesNotExist:
        return CreateJunoHubConfigPayload(success=False, error="Organization not found")

    # Build config dict from input
    config_data = {
        'organization': org,
        'name': input.name,
    }

    # Optional fields
    field_mappings = [
        'slug', 'description', 'environment', 'platform',
        'jupyterhub_host', 'jupyterhub_public_url', 'jupyterhub_base_url',
        'admin_groups', 'allowed_groups',
        'cognito_domain', 'cognito_region',
        'ecs_cluster', 'ecs_task_definition', 'ecs_security_group',
        'ecs_subnet_ids', 'aws_execution_role_arn',
        'efs_file_system_id', 'efs_access_point_id',
        's3_config_bucket', 's3_env_files_prefix', 's3_vector_bucket',
        'vector_store_s3_enabled',
        'db_host', 'jupyterhub_db_url', 'mysql_demo_host', 'pg_demo_host',
        'sentry_environment', 'sentry_release', 'microsoft_clarity_id',
        'enabled_ai_providers',
        # Instance lifecycle
        'instance_idle_timeout_hours', 'instance_max_runtime_hours',
        'allow_user_instance_protection',
    ]

    for field in field_mappings:
        value = getattr(input, field, None)
        if value is not None:
            config_data[field] = value

    # Handle deployment FK
    if input.deployment_id:
        config_data['deployment_id'] = input.deployment_id

    config = JunoHubConfig.objects.create(**config_data)
    return CreateJunoHubConfigPayload(success=True, config=config)


def update_junohub_config(info: strawberry.types.Info, input: UpdateJunoHubConfigInput) -> UpdateJunoHubConfigPayload:
    if not info.context.request.user.is_authenticated:
        return UpdateJunoHubConfigPayload(success=False, error="Authentication required")

    try:
        config = JunoHubConfig.objects.get(id=input.id)
    except JunoHubConfig.DoesNotExist:
        return UpdateJunoHubConfigPayload(success=False, error="JunoHub config not found")

    # Update fields
    field_mappings = [
        'name', 'description', 'environment', 'platform', 'is_active',
        'jupyterhub_host', 'jupyterhub_public_url', 'jupyterhub_base_url',
        'admin_groups', 'allowed_groups',
        'cognito_domain', 'cognito_region',
        'ecs_cluster', 'ecs_task_definition', 'ecs_security_group',
        'ecs_subnet_ids', 'aws_execution_role_arn',
        'efs_file_system_id', 'efs_access_point_id',
        's3_config_bucket', 's3_env_files_prefix', 's3_vector_bucket',
        'vector_store_s3_enabled',
        'db_host', 'jupyterhub_db_url', 'mysql_demo_host', 'pg_demo_host',
        'sentry_environment', 'sentry_release', 'microsoft_clarity_id',
        'enabled_ai_providers',
        # Instance lifecycle
        'instance_idle_timeout_hours', 'instance_max_runtime_hours',
        'allow_user_instance_protection',
    ]

    for field in field_mappings:
        value = getattr(input, field, None)
        if value is not None:
            setattr(config, field, value)

    config.save()
    return UpdateJunoHubConfigPayload(success=True, config=config)


def delete_junohub_config(info: strawberry.types.Info, id: strawberry.ID) -> DeleteJunoHubConfigPayload:
    if not info.context.request.user.is_authenticated:
        return DeleteJunoHubConfigPayload(success=False, error="Authentication required")

    try:
        config = JunoHubConfig.objects.get(id=id)
        config.delete()
        return DeleteJunoHubConfigPayload(success=True)
    except JunoHubConfig.DoesNotExist:
        return DeleteJunoHubConfigPayload(success=False, error="JunoHub config not found")


def generate_hub_tokens(info: strawberry.types.Info, config_id: strawberry.ID) -> GenerateHubTokensPayload:
    if not info.context.request.user.is_authenticated:
        return GenerateHubTokensPayload(success=False, error="Authentication required")

    try:
        config = JunoHubConfig.objects.get(id=config_id)
        tokens = config.generate_hub_tokens()
        return GenerateHubTokensPayload(success=True, tokens=tokens)
    except JunoHubConfig.DoesNotExist:
        return GenerateHubTokensPayload(success=False, error="JunoHub config not found")


def sync_junohub_secrets(info: strawberry.types.Info, config_id: strawberry.ID, secrets: JSON) -> SyncJunoHubSecretsPayload:
    if not info.context.request.user.is_authenticated:
        return SyncJunoHubSecretsPayload(success=False, error="Authentication required")

    try:
        config = JunoHubConfig.objects.get(id=config_id)
        arn = config.sync_to_aws(secrets)
        return SyncJunoHubSecretsPayload(success=True, secrets_arn=arn)
    except JunoHubConfig.DoesNotExist:
        return SyncJunoHubSecretsPayload(success=False, error="JunoHub config not found")
    except ValueError as e:
        return SyncJunoHubSecretsPayload(success=False, error=str(e))
    except Exception as e:
        return SyncJunoHubSecretsPayload(success=False, error=f"Failed to sync secrets: {str(e)}")


# Terraform Provision mutations

def create_terraform_provision(info: strawberry.types.Info, junohub_config_id: strawberry.ID, trigger_method: Optional[str] = 'webhook', tfvars_overrides: Optional[JSON] = None, auto_trigger: Optional[bool] = False) -> CreateTerraformProvisionPayload:
    if not info.context.request.user.is_authenticated:
        return CreateTerraformProvisionPayload(success=False, error="Authentication required")

    try:
        config = JunoHubConfig.objects.get(id=junohub_config_id)
    except JunoHubConfig.DoesNotExist:
        return CreateTerraformProvisionPayload(success=False, error="JunoHub config not found")

    provision = TerraformProvision.create_for_junohub(
        junohub_config=config,
        trigger_method=trigger_method
    )

    if tfvars_overrides:
        provision.tfvars.update(tfvars_overrides)
        provision.save(update_fields=['tfvars'])

    if auto_trigger:
        provision.trigger()

    return CreateTerraformProvisionPayload(success=True, provision=provision)


def trigger_terraform_provision(info: strawberry.types.Info, provision_id: strawberry.ID) -> TriggerTerraformProvisionPayload:
    if not info.context.request.user.is_authenticated:
        return TriggerTerraformProvisionPayload(success=False, error="Authentication required")

    try:
        provision = TerraformProvision.objects.get(id=provision_id)
    except TerraformProvision.DoesNotExist:
        return TriggerTerraformProvisionPayload(success=False, error="Provision not found")

    if provision.status not in [TerraformProvision.Status.PENDING, TerraformProvision.Status.FAILED]:
        return TriggerTerraformProvisionPayload(
            success=False,
            error=f"Cannot trigger provision in status: {provision.status}"
        )

    success = provision.trigger()
    return TriggerTerraformProvisionPayload(success=success, provision=provision)


def cancel_terraform_provision(info: strawberry.types.Info, provision_id: strawberry.ID) -> CancelTerraformProvisionPayload:
    if not info.context.request.user.is_authenticated:
        return CancelTerraformProvisionPayload(success=False, error="Authentication required")

    try:
        provision = TerraformProvision.objects.get(id=provision_id)
    except TerraformProvision.DoesNotExist:
        return CancelTerraformProvisionPayload(success=False, error="Provision not found")

    if provision.status in [TerraformProvision.Status.COMPLETED, TerraformProvision.Status.CANCELLED]:
        return CancelTerraformProvisionPayload(
            success=False,
            error=f"Cannot cancel provision in status: {provision.status}"
        )

    provision.status = TerraformProvision.Status.CANCELLED
    provision.save(update_fields=['status'])

    return CancelTerraformProvisionPayload(success=True)
