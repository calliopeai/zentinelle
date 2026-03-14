"""
JunoHub Config and Terraform Provision GraphQL mutations.
"""
import graphene

from deployments.models import JunoHubConfig, TerraformProvision
from zentinelle.schema.types import JunoHubConfigType, TerraformProvisionType


class CreateJunoHubConfigInput(graphene.InputObjectType):
    """Input for creating a JunoHub configuration."""
    name = graphene.String(required=True)
    slug = graphene.String()
    description = graphene.String()
    deployment_id = graphene.ID()
    environment = graphene.String()
    platform = graphene.String()

    # Hub URLs
    jupyterhub_host = graphene.String()
    jupyterhub_public_url = graphene.String()
    jupyterhub_base_url = graphene.String()

    # Access control
    admin_groups = graphene.List(graphene.String)
    allowed_groups = graphene.List(graphene.String)

    # Cognito
    cognito_domain = graphene.String()
    cognito_region = graphene.String()

    # ECS config
    ecs_cluster = graphene.String()
    ecs_task_definition = graphene.String()
    ecs_security_group = graphene.String()
    ecs_subnet_ids = graphene.List(graphene.String)
    aws_execution_role_arn = graphene.String()

    # Storage
    efs_file_system_id = graphene.String()
    efs_access_point_id = graphene.String()
    s3_config_bucket = graphene.String()
    s3_env_files_prefix = graphene.String()
    s3_vector_bucket = graphene.String()
    vector_store_s3_enabled = graphene.Boolean()

    # Database
    db_host = graphene.String()
    jupyterhub_db_url = graphene.String()
    mysql_demo_host = graphene.String()
    pg_demo_host = graphene.String()

    # Monitoring
    sentry_environment = graphene.String()
    sentry_release = graphene.String()
    microsoft_clarity_id = graphene.String()

    # AI providers
    enabled_ai_providers = graphene.List(graphene.String)

    # Instance lifecycle (compute instance timeout settings)
    instance_idle_timeout_hours = graphene.Int(
        description='Hours of inactivity before instances are terminated (null = default 8h)'
    )
    instance_max_runtime_hours = graphene.Int(
        description='Maximum hours an instance can run (null = no limit)'
    )
    allow_user_instance_protection = graphene.Boolean(
        description='Allow users to protect their instances from auto-termination'
    )


class UpdateJunoHubConfigInput(graphene.InputObjectType):
    """Input for updating a JunoHub configuration."""
    id = graphene.ID(required=True)
    name = graphene.String()
    description = graphene.String()
    environment = graphene.String()
    platform = graphene.String()
    is_active = graphene.Boolean()

    # Hub URLs
    jupyterhub_host = graphene.String()
    jupyterhub_public_url = graphene.String()
    jupyterhub_base_url = graphene.String()

    # Access control
    admin_groups = graphene.List(graphene.String)
    allowed_groups = graphene.List(graphene.String)

    # Cognito
    cognito_domain = graphene.String()
    cognito_region = graphene.String()

    # ECS config
    ecs_cluster = graphene.String()
    ecs_task_definition = graphene.String()
    ecs_security_group = graphene.String()
    ecs_subnet_ids = graphene.List(graphene.String)
    aws_execution_role_arn = graphene.String()

    # Storage
    efs_file_system_id = graphene.String()
    efs_access_point_id = graphene.String()
    s3_config_bucket = graphene.String()
    s3_env_files_prefix = graphene.String()
    s3_vector_bucket = graphene.String()
    vector_store_s3_enabled = graphene.Boolean()

    # Database
    db_host = graphene.String()
    jupyterhub_db_url = graphene.String()
    mysql_demo_host = graphene.String()
    pg_demo_host = graphene.String()

    # Monitoring
    sentry_environment = graphene.String()
    sentry_release = graphene.String()
    microsoft_clarity_id = graphene.String()

    # AI providers
    enabled_ai_providers = graphene.List(graphene.String)

    # Instance lifecycle (compute instance timeout settings)
    instance_idle_timeout_hours = graphene.Int(
        description='Hours of inactivity before instances are terminated (null = default 8h)'
    )
    instance_max_runtime_hours = graphene.Int(
        description='Maximum hours an instance can run (null = no limit)'
    )
    allow_user_instance_protection = graphene.Boolean(
        description='Allow users to protect their instances from auto-termination'
    )


class CreateJunoHubConfig(graphene.Mutation):
    """Create a new JunoHub configuration."""
    class Arguments:
        organization_id = graphene.UUID(required=True)
        input = CreateJunoHubConfigInput(required=True)

    config = graphene.Field(JunoHubConfigType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, organization_id, input):
        if not info.context.user.is_authenticated:
            return CreateJunoHubConfig(success=False, error="Authentication required")

        from organization.models import Organization

        try:
            org = Organization.objects.get(id=organization_id)
        except Organization.DoesNotExist:
            return CreateJunoHubConfig(success=False, error="Organization not found")

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
        return CreateJunoHubConfig(success=True, config=config)


class UpdateJunoHubConfig(graphene.Mutation):
    """Update an existing JunoHub configuration."""
    class Arguments:
        input = UpdateJunoHubConfigInput(required=True)

    config = graphene.Field(JunoHubConfigType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, input):
        if not info.context.user.is_authenticated:
            return UpdateJunoHubConfig(success=False, error="Authentication required")

        try:
            config = JunoHubConfig.objects.get(id=input.id)
        except JunoHubConfig.DoesNotExist:
            return UpdateJunoHubConfig(success=False, error="JunoHub config not found")

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
        return UpdateJunoHubConfig(success=True, config=config)


class DeleteJunoHubConfig(graphene.Mutation):
    """Delete a JunoHub configuration."""
    class Arguments:
        id = graphene.ID(required=True)

    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, id):
        if not info.context.user.is_authenticated:
            return DeleteJunoHubConfig(success=False, error="Authentication required")

        try:
            config = JunoHubConfig.objects.get(id=id)
            config.delete()
            return DeleteJunoHubConfig(success=True)
        except JunoHubConfig.DoesNotExist:
            return DeleteJunoHubConfig(success=False, error="JunoHub config not found")


class GenerateHubTokens(graphene.Mutation):
    """Generate new hub tokens (API token, crypt key, proxy token) for a JunoHub config."""
    class Arguments:
        config_id = graphene.ID(required=True)

    tokens = graphene.JSONString()
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, config_id):
        if not info.context.user.is_authenticated:
            return GenerateHubTokens(success=False, error="Authentication required")

        try:
            config = JunoHubConfig.objects.get(id=config_id)
            tokens = config.generate_hub_tokens()
            return GenerateHubTokens(success=True, tokens=tokens)
        except JunoHubConfig.DoesNotExist:
            return GenerateHubTokens(success=False, error="JunoHub config not found")


class SyncJunoHubSecrets(graphene.Mutation):
    """Sync secrets to AWS Secrets Manager."""
    class Arguments:
        config_id = graphene.ID(required=True)
        secrets = graphene.JSONString(required=True)

    secrets_arn = graphene.String()
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, config_id, secrets):
        if not info.context.user.is_authenticated:
            return SyncJunoHubSecrets(success=False, error="Authentication required")

        try:
            config = JunoHubConfig.objects.get(id=config_id)
            arn = config.sync_to_aws(secrets)
            return SyncJunoHubSecrets(success=True, secrets_arn=arn)
        except JunoHubConfig.DoesNotExist:
            return SyncJunoHubSecrets(success=False, error="JunoHub config not found")
        except ValueError as e:
            return SyncJunoHubSecrets(success=False, error=str(e))
        except Exception as e:
            return SyncJunoHubSecrets(success=False, error=f"Failed to sync secrets: {str(e)}")


# Terraform Provision mutations

class CreateTerraformProvision(graphene.Mutation):
    """Create a Terraform provision request for a JunoHub config."""
    class Arguments:
        junohub_config_id = graphene.ID(required=True)
        trigger_method = graphene.String()
        tfvars_overrides = graphene.JSONString()
        auto_trigger = graphene.Boolean()

    provision = graphene.Field(TerraformProvisionType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, junohub_config_id, trigger_method='webhook', tfvars_overrides=None, auto_trigger=False):
        if not info.context.user.is_authenticated:
            return CreateTerraformProvision(success=False, error="Authentication required")

        try:
            config = JunoHubConfig.objects.get(id=junohub_config_id)
        except JunoHubConfig.DoesNotExist:
            return CreateTerraformProvision(success=False, error="JunoHub config not found")

        provision = TerraformProvision.create_for_junohub(
            junohub_config=config,
            trigger_method=trigger_method
        )

        if tfvars_overrides:
            provision.tfvars.update(tfvars_overrides)
            provision.save(update_fields=['tfvars'])

        if auto_trigger:
            provision.trigger()

        return CreateTerraformProvision(success=True, provision=provision)


class TriggerTerraformProvision(graphene.Mutation):
    """Trigger a pending Terraform provision."""
    class Arguments:
        provision_id = graphene.ID(required=True)

    provision = graphene.Field(TerraformProvisionType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, provision_id):
        if not info.context.user.is_authenticated:
            return TriggerTerraformProvision(success=False, error="Authentication required")

        try:
            provision = TerraformProvision.objects.get(id=provision_id)
        except TerraformProvision.DoesNotExist:
            return TriggerTerraformProvision(success=False, error="Provision not found")

        if provision.status not in [TerraformProvision.Status.PENDING, TerraformProvision.Status.FAILED]:
            return TriggerTerraformProvision(
                success=False,
                error=f"Cannot trigger provision in status: {provision.status}"
            )

        success = provision.trigger()
        return TriggerTerraformProvision(success=success, provision=provision)


class CancelTerraformProvision(graphene.Mutation):
    """Cancel a pending or running Terraform provision."""
    class Arguments:
        provision_id = graphene.ID(required=True)

    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, provision_id):
        if not info.context.user.is_authenticated:
            return CancelTerraformProvision(success=False, error="Authentication required")

        try:
            provision = TerraformProvision.objects.get(id=provision_id)
        except TerraformProvision.DoesNotExist:
            return CancelTerraformProvision(success=False, error="Provision not found")

        if provision.status in [TerraformProvision.Status.COMPLETED, TerraformProvision.Status.CANCELLED]:
            return CancelTerraformProvision(
                success=False,
                error=f"Cannot cancel provision in status: {provision.status}"
            )

        provision.status = TerraformProvision.Status.CANCELLED
        provision.save(update_fields=['status'])

        return CancelTerraformProvision(success=True)
