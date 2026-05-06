"""
AI Key Management GraphQL Mutations.

Handles organization-level and deployment-level AI key management.
"""
import enum
import logging
import uuid
from datetime import datetime
from typing import Optional

import strawberry
from strawberry.scalars import JSON
from graphql_relay import from_global_id

from deployments.models import Deployment
from deployments.models.ai_keys import (
    OrganizationAIAdminKey,
    DeploymentAIKey,
    AIKeyMode,
    AIProvider as AIProviderChoices,
)
from organization.models import Organization
from zentinelle.schema.auth_helpers import user_has_org_access

logger = logging.getLogger(__name__)


def _enum_value(val):
    """Extract plain string value from a Graphene enum member."""
    return val.value if hasattr(val, 'value') else val


@strawberry.enum
class AIProviderEnum(enum.Enum):
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


@strawberry.enum
class AIKeyModeEnum(enum.Enum):
    BYOK = 'byok'
    CALLIOPE_PROVIDED = 'calliope_provided'
    ORG_DEFAULT = 'org_default'


@strawberry.enum
class UpdateDeploymentAIKeyActionEnum(enum.Enum):
    SET = 'set'
    CLEAR = 'clear'
    RESET = 'reset'


@strawberry.type
class OrganizationAIKeyType:
    id: Optional[strawberry.ID] = None
    provider: Optional[str] = None
    provider_display: Optional[str] = None
    name: Optional[str] = None
    key_prefix: Optional[str] = None
    is_active: Optional[bool] = None
    last_validated_at: Optional[datetime] = None
    validation_error: Optional[str] = None
    monthly_budget_usd: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@strawberry.type
class DeploymentAIKeyType:
    id: Optional[strawberry.ID] = None
    provider: Optional[str] = None
    provider_display: Optional[str] = None
    mode: Optional[str] = None
    mode_display: Optional[str] = None
    key_prefix: Optional[str] = None
    is_active: Optional[bool] = None
    last_synced_at: Optional[datetime] = None
    sync_error: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# =============================================================================
# Organization-Level AI Key Mutations
# =============================================================================

@strawberry.input
class SetOrganizationAIKeyInput:
    organization_id: uuid.UUID
    provider: str
    api_key: str
    name: Optional[str] = None
    provider_org_id: Optional[str] = None
    monthly_budget_usd: Optional[float] = None


@strawberry.type
class SetOrganizationAIKeyPayload:
    success: bool
    message: Optional[str] = None
    ai_key: Optional[OrganizationAIKeyType] = None


@strawberry.input
class RemoveOrganizationAIKeyInput:
    organization_id: uuid.UUID
    provider: str


@strawberry.type
class RemoveOrganizationAIKeyPayload:
    success: bool
    message: Optional[str] = None


def set_organization_ai_key(info: strawberry.types.Info, input: SetOrganizationAIKeyInput) -> SetOrganizationAIKeyPayload:
    org_id = input.organization_id
    provider = _enum_value(input.provider)
    api_key = input.api_key
    name = input.name or ''
    provider_org_id = input.provider_org_id or ''
    monthly_budget_usd = input.monthly_budget_usd

    if not info.context.request.user.is_authenticated:
        return SetOrganizationAIKeyPayload(
            success=False,
            message="Authentication required"
        )

    if not user_has_org_access(info.context.request.user, org_id):
        return SetOrganizationAIKeyPayload(
            success=False,
            message="Not authorized to manage this organization's keys"
        )

    try:
        org = Organization.objects.get(id=org_id)
    except Organization.DoesNotExist:
        return SetOrganizationAIKeyPayload(
            success=False,
            message=f"Organization not found: {org_id}"
        )

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

    return SetOrganizationAIKeyPayload(
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
    )


def remove_organization_ai_key(info: strawberry.types.Info, input: RemoveOrganizationAIKeyInput) -> RemoveOrganizationAIKeyPayload:
    org_id = input.organization_id
    provider = _enum_value(input.provider)

    if not info.context.request.user.is_authenticated:
        return RemoveOrganizationAIKeyPayload(
            success=False,
            message="Authentication required"
        )

    if not user_has_org_access(info.context.request.user, org_id):
        return RemoveOrganizationAIKeyPayload(
            success=False,
            message="Not authorized to manage this organization's keys"
        )

    try:
        org = Organization.objects.get(id=org_id)
    except Organization.DoesNotExist:
        return RemoveOrganizationAIKeyPayload(
            success=False,
            message=f"Organization not found: {org_id}"
        )

    try:
        ai_key = OrganizationAIAdminKey.objects.get(organization=org, provider=provider)
        ai_key.delete()
        return RemoveOrganizationAIKeyPayload(
            success=True,
            message=f"Removed {provider} key"
        )
    except OrganizationAIAdminKey.DoesNotExist:
        return RemoveOrganizationAIKeyPayload(
            success=False,
            message=f"No {provider} key found for this organization"
        )


# =============================================================================
# Deployment-Level AI Key Mutations
# =============================================================================

@strawberry.input
class SetDeploymentAIKeyInput:
    deployment_id: strawberry.ID
    provider: str
    api_key: str
    mode: Optional[str] = None


@strawberry.type
class SetDeploymentAIKeyPayload:
    success: bool
    message: Optional[str] = None
    ai_key: Optional[DeploymentAIKeyType] = None


@strawberry.input
class RemoveDeploymentAIKeyInput:
    deployment_id: strawberry.ID
    provider: str


@strawberry.type
class RemoveDeploymentAIKeyPayload:
    success: bool
    message: Optional[str] = None


def set_deployment_ai_key(info: strawberry.types.Info, input: SetDeploymentAIKeyInput) -> SetDeploymentAIKeyPayload:
    raw_id = input.deployment_id
    try:
        _, deployment_id = from_global_id(raw_id)
    except Exception:
        deployment_id = raw_id
    provider = _enum_value(input.provider)
    api_key = input.api_key
    mode = _enum_value(input.mode) if input.mode else AIKeyMode.BYOK

    if not info.context.request.user.is_authenticated:
        return SetDeploymentAIKeyPayload(
            success=False,
            message="Authentication required"
        )

    try:
        deployment = Deployment.objects.get(id=deployment_id)
    except Deployment.DoesNotExist:
        return SetDeploymentAIKeyPayload(
            success=False,
            message=f"Deployment not found: {deployment_id}"
        )

    # Allow staff to manage any deployment (especially internal ones)
    # Allow users to manage their own organization's deployments
    user = info.context.request.user
    is_staff = getattr(user, 'is_staff', False)
    is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

    if not is_staff and not is_own_org:
        return SetDeploymentAIKeyPayload(
            success=False,
            message="Not authorized to manage this deployment's keys"
        )

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

    return SetDeploymentAIKeyPayload(
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
    )


def remove_deployment_ai_key(info: strawberry.types.Info, input: RemoveDeploymentAIKeyInput) -> RemoveDeploymentAIKeyPayload:
    raw_id = input.deployment_id
    try:
        _, deployment_id = from_global_id(raw_id)
    except Exception:
        deployment_id = raw_id
    provider = _enum_value(input.provider)

    if not info.context.request.user.is_authenticated:
        return RemoveDeploymentAIKeyPayload(
            success=False,
            message="Authentication required"
        )

    try:
        deployment = Deployment.objects.get(id=deployment_id)
    except Deployment.DoesNotExist:
        return RemoveDeploymentAIKeyPayload(
            success=False,
            message=f"Deployment not found: {deployment_id}"
        )

    # Allow staff to manage any deployment (especially internal ones)
    # Allow users to manage their own organization's deployments
    user = info.context.request.user
    is_staff = getattr(user, 'is_staff', False)
    is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

    if not is_staff and not is_own_org:
        return RemoveDeploymentAIKeyPayload(
            success=False,
            message="Not authorized to manage this deployment's keys"
        )

    try:
        ai_key = DeploymentAIKey.objects.get(deployment=deployment, provider=provider)
        ai_key.delete()
        return RemoveDeploymentAIKeyPayload(
            success=True,
            message=f"Removed {provider} key override (will use org default)"
        )
    except DeploymentAIKey.DoesNotExist:
        return RemoveDeploymentAIKeyPayload(
            success=False,
            message=f"No {provider} key override found for this deployment"
        )


# =============================================================================
# Sync Keys to Deployment
# =============================================================================

@strawberry.input
class SyncDeploymentAIKeysInput:
    deployment_id: strawberry.ID
    providers: Optional[list[str]] = None


@strawberry.type
class SyncDeploymentAIKeysPayload:
    success: bool
    message: Optional[str] = None
    synced_providers: Optional[list[str]] = None
    errors: Optional[list[str]] = None


def sync_deployment_ai_keys(info: strawberry.types.Info, input: SyncDeploymentAIKeysInput) -> SyncDeploymentAIKeysPayload:
    from deployments.services.deployment_manager import get_deployment_manager

    raw_id = input.deployment_id
    try:
        _, deployment_id = from_global_id(raw_id)
    except Exception:
        deployment_id = raw_id
    providers = [_enum_value(p) for p in (input.providers or [])]

    if not info.context.request.user.is_authenticated:
        return SyncDeploymentAIKeysPayload(
            success=False,
            message="Authentication required",
            synced_providers=[],
            errors=[]
        )

    try:
        deployment = Deployment.objects.get(id=deployment_id)
    except Deployment.DoesNotExist:
        return SyncDeploymentAIKeysPayload(
            success=False,
            message=f"Deployment not found: {deployment_id}",
            synced_providers=[],
            errors=[]
        )

    # Allow staff to manage any deployment (especially internal ones)
    # Allow users to manage their own organization's deployments
    user = info.context.request.user
    is_staff = getattr(user, 'is_staff', False)
    is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

    if not is_staff and not is_own_org:
        return SyncDeploymentAIKeysPayload(
            success=False,
            message="Not authorized to manage this deployment",
            synced_providers=[],
            errors=[]
        )

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

    return SyncDeploymentAIKeysPayload(
        success=len(synced) > 0,
        message=f"Synced {len(synced)} providers" if synced else "No providers synced",
        synced_providers=synced,
        errors=errors
    )


# =============================================================================
# Import Keys from Existing Secrets
# =============================================================================

@strawberry.input
class ImportDeploymentAIKeysInput:
    deployment_id: strawberry.ID


@strawberry.type
class ImportDeploymentAIKeysPayload:
    success: bool
    message: Optional[str] = None
    imported_providers: Optional[list[str]] = None
    skipped: Optional[list[str]] = None
    errors: Optional[list[str]] = None


def import_deployment_ai_keys(info: strawberry.types.Info, input: ImportDeploymentAIKeysInput) -> ImportDeploymentAIKeysPayload:
    from deployments.services.deployment_manager import get_deployment_manager

    raw_id = input.deployment_id
    try:
        _, deployment_id = from_global_id(raw_id)
    except Exception:
        deployment_id = raw_id

    if not info.context.request.user.is_authenticated:
        return ImportDeploymentAIKeysPayload(
            success=False,
            message="Authentication required",
            imported_providers=[],
            skipped=[],
            errors=[]
        )

    try:
        deployment = Deployment.objects.get(id=deployment_id)
    except Deployment.DoesNotExist:
        return ImportDeploymentAIKeysPayload(
            success=False,
            message=f"Deployment not found: {deployment_id}",
            imported_providers=[],
            skipped=[],
            errors=[]
        )

    # Allow staff to manage any deployment (especially internal ones)
    # Allow users to manage their own organization's deployments
    user = info.context.request.user
    is_staff = getattr(user, 'is_staff', False)
    is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

    if not is_staff and not is_own_org:
        return ImportDeploymentAIKeysPayload(
            success=False,
            message="Not authorized to manage this deployment",
            imported_providers=[],
            skipped=[],
            errors=[]
        )

    manager = get_deployment_manager()
    result = manager.import_ai_keys_from_secrets(deployment)

    imported = result.get('imported', [])
    skipped = result.get('skipped', [])
    errors = result.get('errors', [])

    return ImportDeploymentAIKeysPayload(
        success=len(imported) > 0 or (len(skipped) > 0 and len(errors) == 0),
        message=f"Imported {len(imported)} providers" if imported else "No new providers to import",
        imported_providers=imported,
        skipped=skipped,
        errors=errors
    )


# =============================================================================
# Update AI Key in AWS Secrets Manager
# =============================================================================

@strawberry.input
class UpdateDeploymentAIKeyInput:
    deployment_id: strawberry.ID
    provider: str
    action: str
    api_key: Optional[str] = None


@strawberry.type
class UpdateDeploymentAIKeyPayload:
    success: bool
    message: Optional[str] = None
    provider: Optional[str] = None
    key_prefix: Optional[str] = None
    action: Optional[str] = None


def update_deployment_ai_key(info: strawberry.types.Info, input: UpdateDeploymentAIKeyInput) -> UpdateDeploymentAIKeyPayload:
    import asyncio
    from deployments.services.deployment_manager import get_deployment_manager

    raw_id = input.deployment_id
    try:
        _, deployment_id = from_global_id(raw_id)
    except Exception:
        deployment_id = raw_id
    provider = _enum_value(input.provider)
    action = _enum_value(input.action)
    api_key = input.api_key

    if not info.context.request.user.is_authenticated:
        return UpdateDeploymentAIKeyPayload(
            success=False,
            message="Authentication required"
        )

    try:
        deployment = Deployment.objects.get(id=deployment_id)
    except Deployment.DoesNotExist:
        return UpdateDeploymentAIKeyPayload(
            success=False,
            message=f"Deployment not found: {deployment_id}"
        )

    # Allow staff to manage any deployment (especially internal ones)
    # Allow users to manage their own organization's deployments
    user = info.context.request.user
    is_staff = getattr(user, 'is_staff', False)
    is_own_org = str(deployment.organization_id) == str(getattr(user, 'organization_id', None))

    if not is_staff and not is_own_org:
        return UpdateDeploymentAIKeyPayload(
            success=False,
            message="Not authorized to manage this deployment"
        )

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
        return UpdateDeploymentAIKeyPayload(
            success=False,
            message=f"Unknown provider: {provider}"
        )

    try:
        manager = get_deployment_manager()

        if action == 'set':
            if not api_key:
                return UpdateDeploymentAIKeyPayload(
                    success=False,
                    message="API key required for SET action"
                )
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
                return UpdateDeploymentAIKeyPayload(
                    success=False,
                    message=f"No organization-level key configured for {provider}"
                )

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
            return UpdateDeploymentAIKeyPayload(
                success=True,
                message=f"Successfully updated {provider} key",
                provider=provider,
                key_prefix=key_prefix if action != 'clear' else None,
                action=action
            )
        else:
            return UpdateDeploymentAIKeyPayload(
                success=False,
                message=result.get("error", "Failed to write secrets via provisioner")
            )

    except Exception as e:
        logger.error(f"Failed to update AI key for deployment {deployment_id}: {e}")
        return UpdateDeploymentAIKeyPayload(
            success=False,
            message=f"Error: {str(e)}"
        )
