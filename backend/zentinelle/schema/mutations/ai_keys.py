"""
AI Key Management GraphQL Mutations.

Handles organization-level and deployment-level AI key management.
"""
import graphene
from graphene import relay
from graphql import GraphQLError

from deployments.models import Deployment
from deployments.models.ai_keys import (
    OrganizationAIAdminKey,
    DeploymentAIKey,
    AIKeyMode,
    AIProvider as AIProviderChoices,
)
from organization.models import Organization
from zentinelle.schema.auth_helpers import user_has_org_access
from graphql_relay import from_global_id

import logging
logger = logging.getLogger(__name__)


def _enum_value(val):
    """Extract plain string value from a Graphene enum member."""
    return val.value if hasattr(val, 'value') else val


class AIProviderEnum(graphene.Enum):
    """AI Provider enum for GraphQL."""
    OPENAI = 'openai'
    ANTHROPIC = 'anthropic'
    GOOGLE = 'google'
    COHERE = 'cohere'
    AI21 = 'ai21'
    MISTRAL = 'mistral'
    TOGETHER = 'together'
    HUGGINGFACE = 'huggingface'
    NVIDIA = 'nvidia'
    QIANFAN = 'qianfan'


class AIKeyModeEnum(graphene.Enum):
    """AI Key mode enum for GraphQL."""
    BYOK = 'byok'
    CALLIOPE_PROVIDED = 'calliope_provided'
    ORG_DEFAULT = 'org_default'


class OrganizationAIKeyType(graphene.ObjectType):
    """Organization AI Key type (masked for security)."""
    id = graphene.ID()
    provider = graphene.String()
    provider_display = graphene.String()
    name = graphene.String()
    key_prefix = graphene.String()
    is_active = graphene.Boolean()
    last_validated_at = graphene.DateTime()
    validation_error = graphene.String()
    monthly_budget_usd = graphene.Float()
    created_at = graphene.DateTime()
    updated_at = graphene.DateTime()


class DeploymentAIKeyType(graphene.ObjectType):
    """Deployment AI Key type (masked for security)."""
    id = graphene.ID()
    provider = graphene.String()
    provider_display = graphene.String()
    mode = graphene.String()
    mode_display = graphene.String()
    key_prefix = graphene.String()
    is_active = graphene.Boolean()
    last_synced_at = graphene.DateTime()
    sync_error = graphene.String()
    created_at = graphene.DateTime()
    updated_at = graphene.DateTime()


# =============================================================================
# Organization-Level AI Key Mutations
# =============================================================================

class SetOrganizationAIKeyResult(graphene.ObjectType):
    """Result of setting an organization AI key."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    ai_key = graphene.Field(OrganizationAIKeyType)


class SetOrganizationAIKey(relay.ClientIDMutation):
    """
    Set an AI provider key at the organization level.

    This key will be used by all deployments unless overridden.
    """

    class Input:
        organization_id = graphene.UUID(required=True)
        provider = AIProviderEnum(required=True)
        api_key = graphene.String(required=True, description="The API key (will be stored encrypted)")
        name = graphene.String(description="Friendly name for this key")
        provider_org_id = graphene.String(description="Provider's org/project ID if required")
        monthly_budget_usd = graphene.Float(description="Optional monthly budget cap in USD")

    result = graphene.Field(SetOrganizationAIKeyResult)

    @classmethod
    def mutate_and_get_payload(cls, root, info, **input):
        org_id = input.get('organization_id')
        provider = _enum_value(input.get('provider'))
        api_key = input.get('api_key')
        name = input.get('name', '')
        provider_org_id = input.get('provider_org_id', '')
        monthly_budget_usd = input.get('monthly_budget_usd')

        # Authorization check
        if not info.context.user.is_authenticated:
            return cls(result=SetOrganizationAIKeyResult(
                success=False,
                message="Authentication required"
            ))

        if not user_has_org_access(info.context.user, org_id):
            return cls(result=SetOrganizationAIKeyResult(
                success=False,
                message="Not authorized to manage this organization's keys"
            ))

        try:
            org = Organization.objects.get(id=org_id)
        except Organization.DoesNotExist:
            return cls(result=SetOrganizationAIKeyResult(
                success=False,
                message=f"Organization not found: {org_id}"
            ))

        # Get or create the key
        ai_key, created = OrganizationAIAdminKey.objects.get_or_create(
            organization=org,
            provider=provider,
            defaults={
                'name': name or f"{org.name} - {provider}",
            }
        )

        # Update the key
        ai_key.set_admin_key(api_key)
        if name:
            ai_key.name = name
        if provider_org_id:
            ai_key.provider_org_id = provider_org_id
        if monthly_budget_usd is not None:
            ai_key.monthly_budget_usd = monthly_budget_usd
        ai_key.is_active = True
        ai_key.save()

        return cls(result=SetOrganizationAIKeyResult(
            success=True,
            message="Created" if created else "Updated",
            ai_key=OrganizationAIKeyType(
                id=ai_key.id,
                provider=ai_key.provider,
                provider_display=ai_key.get_provider_display(),
                name=ai_key.name,
                key_prefix=ai_key.admin_key_prefix,
                is_active=ai_key.is_active,
                last_validated_at=ai_key.last_validated_at,
                validation_error=ai_key.validation_error,
                monthly_budget_usd=float(ai_key.monthly_budget_usd) if ai_key.monthly_budget_usd else None,
                created_at=ai_key.created_at,
                updated_at=ai_key.updated_at,
            )
        ))


class RemoveOrganizationAIKeyResult(graphene.ObjectType):
    """Result of removing an organization AI key."""
    success = graphene.Boolean(required=True)
    message = graphene.String()


class RemoveOrganizationAIKey(relay.ClientIDMutation):
    """Remove an AI provider key from the organization."""

    class Input:
        organization_id = graphene.UUID(required=True)
        provider = AIProviderEnum(required=True)

    result = graphene.Field(RemoveOrganizationAIKeyResult)

    @classmethod
    def mutate_and_get_payload(cls, root, info, **input):
        org_id = input.get('organization_id')
        provider = _enum_value(input.get('provider'))

        # Authorization check
        if not info.context.user.is_authenticated:
            return cls(result=RemoveOrganizationAIKeyResult(
                success=False,
                message="Authentication required"
            ))

        if not user_has_org_access(info.context.user, org_id):
            return cls(result=RemoveOrganizationAIKeyResult(
                success=False,
                message="Not authorized to manage this organization's keys"
            ))

        try:
            org = Organization.objects.get(id=org_id)
        except Organization.DoesNotExist:
            return cls(result=RemoveOrganizationAIKeyResult(
                success=False,
                message=f"Organization not found: {org_id}"
            ))

        try:
            ai_key = OrganizationAIAdminKey.objects.get(organization=org, provider=provider)
            ai_key.delete()
            return cls(result=RemoveOrganizationAIKeyResult(
                success=True,
                message=f"Removed {provider} key"
            ))
        except OrganizationAIAdminKey.DoesNotExist:
            return cls(result=RemoveOrganizationAIKeyResult(
                success=False,
                message=f"No {provider} key found for this organization"
            ))


# =============================================================================
# Deployment-Level AI Key Mutations
# =============================================================================

class SetDeploymentAIKeyResult(graphene.ObjectType):
    """Result of setting a deployment AI key."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    ai_key = graphene.Field(DeploymentAIKeyType)


class SetDeploymentAIKey(relay.ClientIDMutation):
    """
    Set an AI provider key override for a specific deployment.

    Use this to override the organization default with a BYOK key.
    """

    class Input:
        deployment_id = graphene.ID(required=True)
        provider = AIProviderEnum(required=True)
        api_key = graphene.String(required=True, description="The API key (will be stored encrypted)")
        mode = AIKeyModeEnum(description="Key mode (defaults to BYOK)")

    result = graphene.Field(SetDeploymentAIKeyResult)

    @classmethod
    def mutate_and_get_payload(cls, root, info, **input):
        raw_id = input.get('deployment_id')
        try:
            _, deployment_id = from_global_id(raw_id)
        except Exception:
            deployment_id = raw_id
        provider = _enum_value(input.get('provider'))
        api_key = input.get('api_key')
        mode = _enum_value(input.get('mode', AIKeyMode.BYOK))

        # Authorization check
        if not info.context.user.is_authenticated:
            return cls(result=SetDeploymentAIKeyResult(
                success=False,
                message="Authentication required"
            ))

        try:
            deployment = Deployment.objects.get(id=deployment_id)
        except Deployment.DoesNotExist:
            return cls(result=SetDeploymentAIKeyResult(
                success=False,
                message=f"Deployment not found: {deployment_id}"
            ))

        # Allow staff to manage any deployment (especially internal ones)
        # Allow users to manage their own organization's deployments
        user = info.context.user
        is_staff = getattr(user, 'is_staff', False)
        is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

        if not is_staff and not is_own_org:
            return cls(result=SetDeploymentAIKeyResult(
                success=False,
                message="Not authorized to manage this deployment's keys"
            ))

        # Get or create the key
        ai_key, created = DeploymentAIKey.objects.get_or_create(
            deployment=deployment,
            provider=provider,
            defaults={
                'mode': mode,
            }
        )

        # Update the key
        ai_key.set_key(api_key)
        ai_key.mode = mode
        ai_key.is_active = True
        ai_key.save()

        return cls(result=SetDeploymentAIKeyResult(
            success=True,
            message="Created" if created else "Updated",
            ai_key=DeploymentAIKeyType(
                id=ai_key.id,
                provider=ai_key.provider,
                provider_display=ai_key.get_provider_display(),
                mode=ai_key.mode,
                mode_display=ai_key.get_mode_display(),
                key_prefix=ai_key.key_prefix,
                is_active=ai_key.is_active,
                last_synced_at=ai_key.last_synced_at,
                sync_error=ai_key.sync_error,
                created_at=ai_key.created_at,
                updated_at=ai_key.updated_at,
            )
        ))


class RemoveDeploymentAIKeyResult(graphene.ObjectType):
    """Result of removing a deployment AI key."""
    success = graphene.Boolean(required=True)
    message = graphene.String()


class RemoveDeploymentAIKey(relay.ClientIDMutation):
    """Remove an AI provider key override from a deployment (reverts to org default)."""

    class Input:
        deployment_id = graphene.ID(required=True)
        provider = AIProviderEnum(required=True)

    result = graphene.Field(RemoveDeploymentAIKeyResult)

    @classmethod
    def mutate_and_get_payload(cls, root, info, **input):
        raw_id = input.get('deployment_id')
        try:
            _, deployment_id = from_global_id(raw_id)
        except Exception:
            deployment_id = raw_id
        provider = _enum_value(input.get('provider'))

        # Authorization check
        if not info.context.user.is_authenticated:
            return cls(result=RemoveDeploymentAIKeyResult(
                success=False,
                message="Authentication required"
            ))

        try:
            deployment = Deployment.objects.get(id=deployment_id)
        except Deployment.DoesNotExist:
            return cls(result=RemoveDeploymentAIKeyResult(
                success=False,
                message=f"Deployment not found: {deployment_id}"
            ))

        # Allow staff to manage any deployment (especially internal ones)
        # Allow users to manage their own organization's deployments
        user = info.context.user
        is_staff = getattr(user, 'is_staff', False)
        is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

        if not is_staff and not is_own_org:
            return cls(result=RemoveDeploymentAIKeyResult(
                success=False,
                message="Not authorized to manage this deployment's keys"
            ))

        try:
            ai_key = DeploymentAIKey.objects.get(deployment=deployment, provider=provider)
            ai_key.delete()
            return cls(result=RemoveDeploymentAIKeyResult(
                success=True,
                message=f"Removed {provider} key override (will use org default)"
            ))
        except DeploymentAIKey.DoesNotExist:
            return cls(result=RemoveDeploymentAIKeyResult(
                success=False,
                message=f"No {provider} key override found for this deployment"
            ))


# =============================================================================
# Sync Keys to Deployment
# =============================================================================

class SyncDeploymentAIKeysResult(graphene.ObjectType):
    """Result of syncing AI keys to a deployment."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    synced_providers = graphene.List(graphene.String)
    errors = graphene.List(graphene.String)


class SyncDeploymentAIKeys(relay.ClientIDMutation):
    """
    Sync all configured AI keys to a deployment's secrets.

    Pushes org-level keys and any deployment overrides to AWS Secrets Manager.
    """

    class Input:
        deployment_id = graphene.ID(required=True)
        providers = graphene.List(AIProviderEnum, description="Specific providers to sync (all if empty)")

    result = graphene.Field(SyncDeploymentAIKeysResult)

    @classmethod
    def mutate_and_get_payload(cls, root, info, **input):
        from deployments.services.deployment_manager import get_deployment_manager

        raw_id = input.get('deployment_id')
        try:
            _, deployment_id = from_global_id(raw_id)
        except Exception:
            deployment_id = raw_id
        providers = [_enum_value(p) for p in input.get('providers', [])]

        # Authorization check
        if not info.context.user.is_authenticated:
            return cls(result=SyncDeploymentAIKeysResult(
                success=False,
                message="Authentication required",
                synced_providers=[],
                errors=[]
            ))

        try:
            deployment = Deployment.objects.get(id=deployment_id)
        except Deployment.DoesNotExist:
            return cls(result=SyncDeploymentAIKeysResult(
                success=False,
                message=f"Deployment not found: {deployment_id}",
                synced_providers=[],
                errors=[]
            ))

        # Allow staff to manage any deployment (especially internal ones)
        # Allow users to manage their own organization's deployments
        user = info.context.user
        is_staff = getattr(user, 'is_staff', False)
        is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

        if not is_staff and not is_own_org:
            return cls(result=SyncDeploymentAIKeysResult(
                success=False,
                message="Not authorized to manage this deployment",
                synced_providers=[],
                errors=[]
            ))

        manager = get_deployment_manager()
        synced = []
        errors = []

        # Get all providers to sync
        if providers:
            providers_to_sync = providers
        else:
            # Sync all configured providers
            providers_to_sync = list(AIProviderChoices.values)

        for provider in providers_to_sync:
            try:
                success = manager.sync_ai_key(deployment, provider)
                if success:
                    synced.append(provider)
                else:
                    errors.append(f"{provider}: No key configured")
            except Exception as e:
                errors.append(f"{provider}: {str(e)}")

        return cls(result=SyncDeploymentAIKeysResult(
            success=len(synced) > 0,
            message=f"Synced {len(synced)} providers" if synced else "No providers synced",
            synced_providers=synced,
            errors=errors
        ))


# =============================================================================
# Import Keys from Existing Secrets
# =============================================================================

class ImportDeploymentAIKeysResult(graphene.ObjectType):
    """Result of importing AI keys from existing secrets."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    imported_providers = graphene.List(graphene.String)
    skipped = graphene.List(graphene.String)
    errors = graphene.List(graphene.String)


class ImportDeploymentAIKeys(relay.ClientIDMutation):
    """
    Import AI keys from existing AWS Secrets for adopted deployments.

    Detects AI provider API keys in existing secrets and creates
    DeploymentAIKey records for them.
    """

    class Input:
        deployment_id = graphene.ID(required=True)

    result = graphene.Field(ImportDeploymentAIKeysResult)

    @classmethod
    def mutate_and_get_payload(cls, root, info, **input):
        from deployments.services.deployment_manager import get_deployment_manager

        raw_id = input.get('deployment_id')
        try:
            _, deployment_id = from_global_id(raw_id)
        except Exception:
            deployment_id = raw_id

        # Authorization check
        if not info.context.user.is_authenticated:
            return cls(result=ImportDeploymentAIKeysResult(
                success=False,
                message="Authentication required",
                imported_providers=[],
                skipped=[],
                errors=[]
            ))

        try:
            deployment = Deployment.objects.get(id=deployment_id)
        except Deployment.DoesNotExist:
            return cls(result=ImportDeploymentAIKeysResult(
                success=False,
                message=f"Deployment not found: {deployment_id}",
                imported_providers=[],
                skipped=[],
                errors=[]
            ))

        # Allow staff to manage any deployment (especially internal ones)
        # Allow users to manage their own organization's deployments
        user = info.context.user
        is_staff = getattr(user, 'is_staff', False)
        is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

        if not is_staff and not is_own_org:
            return cls(result=ImportDeploymentAIKeysResult(
                success=False,
                message="Not authorized to manage this deployment",
                imported_providers=[],
                skipped=[],
                errors=[]
            ))

        manager = get_deployment_manager()
        result = manager.import_ai_keys_from_secrets(deployment)

        imported = result.get('imported', [])
        skipped = result.get('skipped', [])
        errors = result.get('errors', [])

        return cls(result=ImportDeploymentAIKeysResult(
            success=len(imported) > 0 or (len(skipped) > 0 and len(errors) == 0),
            message=f"Imported {len(imported)} providers" if imported else "No new providers to import",
            imported_providers=imported,
            skipped=skipped,
            errors=errors
        ))


# =============================================================================
# Update AI Key in AWS Secrets Manager
# =============================================================================

class UpdateDeploymentAIKeyResult(graphene.ObjectType):
    """Result of updating an AI key in AWS Secrets Manager."""
    success = graphene.Boolean(required=True)
    message = graphene.String()
    provider = graphene.String()
    key_prefix = graphene.String()
    action = graphene.String()


class UpdateDeploymentAIKeyActionEnum(graphene.Enum):
    """Action to perform on an AI key."""
    SET = 'set'        # Set a custom BYOK key
    CLEAR = 'clear'    # Clear/disable the key
    RESET = 'reset'    # Reset to org-level managed key


class UpdateDeploymentAIKey(relay.ClientIDMutation):
    """
    Update an AI provider key directly in AWS Secrets Manager.

    Actions:
    - SET: Set a custom BYOK key
    - CLEAR: Remove the key (disable provider)
    - RESET: Reset to organization-level managed key
    """

    class Input:
        deployment_id = graphene.ID(required=True)
        provider = AIProviderEnum(required=True)
        action = UpdateDeploymentAIKeyActionEnum(required=True)
        api_key = graphene.String(description="Required for SET action")

    result = graphene.Field(UpdateDeploymentAIKeyResult)

    @classmethod
    def mutate_and_get_payload(cls, root, info, **input):
        import asyncio
        from deployments.services.deployment_manager import get_deployment_manager

        raw_id = input.get('deployment_id')
        try:
            _, deployment_id = from_global_id(raw_id)
        except Exception:
            deployment_id = raw_id
        provider = _enum_value(input.get('provider'))
        action = _enum_value(input.get('action'))
        api_key = input.get('api_key')

        # Authorization check
        if not info.context.user.is_authenticated:
            return cls(result=UpdateDeploymentAIKeyResult(
                success=False,
                message="Authentication required"
            ))

        try:
            deployment = Deployment.objects.get(id=deployment_id)
        except Deployment.DoesNotExist:
            return cls(result=UpdateDeploymentAIKeyResult(
                success=False,
                message=f"Deployment not found: {deployment_id}"
            ))

        # Allow staff to manage any deployment (especially internal ones)
        # Allow users to manage their own organization's deployments
        user = info.context.user
        is_staff = getattr(user, 'is_staff', False)
        is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

        if not is_staff and not is_own_org:
            return cls(result=UpdateDeploymentAIKeyResult(
                success=False,
                message="Not authorized to manage this deployment"
            ))

        # Provider env var mapping
        provider_to_key = {
            'openai': 'OPENAI_API_KEY',
            'anthropic': 'ANTHROPIC_API_KEY',
            'google': 'GOOGLE_API_KEY',
            'cohere': 'COHERE_API_KEY',
            'ai21': 'AI21_API_KEY',
            'mistral': 'MISTRAL_API_KEY',
            'together': 'TOGETHER_API_KEY',
            'huggingface': 'HUGGINGFACEHUB_API_TOKEN',
            'nvidia': 'NVIDIA_API_KEY',
            'qianfan': 'QIANFAN_AK',
        }

        env_var = provider_to_key.get(provider)
        if not env_var:
            return cls(result=UpdateDeploymentAIKeyResult(
                success=False,
                message=f"Unknown provider: {provider}"
            ))

        try:
            manager = get_deployment_manager()

            if action == 'set':
                if not api_key:
                    return cls(result=UpdateDeploymentAIKeyResult(
                        success=False,
                        message="API key required for SET action"
                    ))
                key_value = api_key
                key_prefix = f"{api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else f"{api_key[:4]}..."

            elif action == 'clear':
                key_value = ''
                key_prefix = None

            elif action == 'reset':
                # Try to get org-level key
                org_key = OrganizationAIAdminKey.objects.filter(
                    organization=deployment.organization,
                    provider=provider,
                    is_active=True
                ).first()

                if org_key and org_key.admin_key:
                    key_value = org_key.admin_key
                    key_prefix = org_key.admin_key_prefix
                else:
                    return cls(result=UpdateDeploymentAIKeyResult(
                        success=False,
                        message=f"No organization-level key configured for {provider}"
                    ))

            # Push the single key update via provisioner (merge=True preserves other keys)
            creds = manager._get_provisioner_credentials(deployment)
            client = manager._get_provisioner_client()
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(client.push_secrets(
                    customer_name=creds["customer_name"],
                    ai_keys={env_var: key_value},
                    merge=True,
                    account_id=creds.get("account_id"),
                    aws_region=creds.get("aws_region", "us-west-2"),
                    role_arn=creds.get("role_arn"),
                    external_id=creds.get("external_id"),
                ))
            finally:
                loop.close()

            if result.get("success"):
                return cls(result=UpdateDeploymentAIKeyResult(
                    success=True,
                    message=f"Successfully updated {provider} key",
                    provider=provider,
                    key_prefix=key_prefix if action != 'clear' else None,
                    action=action
                ))
            else:
                return cls(result=UpdateDeploymentAIKeyResult(
                    success=False,
                    message=result.get("error", "Failed to write secrets via provisioner")
                ))

        except Exception as e:
            logger.error(f"Failed to update AI key for deployment {deployment_id}: {e}")
            return cls(result=UpdateDeploymentAIKeyResult(
                success=False,
                message=f"Error: {str(e)}"
            ))
