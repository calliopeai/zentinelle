"""
Tool Configuration Service - Manage tool configs and secret access.

Handles:
1. Syncing tool configs for a deployment (post-provisioning)
2. Getting secrets accessible to a specific tool
3. Building environment variables for tool secret injection
4. Managing AI key mode inheritance
"""
import logging
from typing import Dict, List, Optional, Any

from django.utils import timezone

# TODO: decouple - external models not available in standalone mode
# These are lazy-loaded when used by the client-cove integration layer
try:
    from deployments.models import (
        Deployment,
        DeploymentToolConfig,
        ToolSecretAccess,
        SecretBundle,
    )
    from billing.models import ToolRegistry
except ImportError:
    Deployment = None
    DeploymentToolConfig = None
    ToolSecretAccess = None
    SecretBundle = None
    ToolRegistry = None
from zentinelle.services.secrets_service import SecretsService

logger = logging.getLogger(__name__)


class ToolConfigService:
    """
    Service for managing deployment tool configurations.
    """

    def __init__(self, secrets_service: SecretsService = None):
        self.secrets_service = secrets_service or SecretsService()

    def sync_tool_configs(self, deployment: Deployment) -> List[DeploymentToolConfig]:
        """
        Sync all tool configs for a deployment.

        Ensures all tool types have configs (with defaults) for a deployment.
        This should be called after provisioning or when new tool types are added.

        Args:
            deployment: The deployment to sync tool configs for

        Returns:
            List of created tool configs (empty if all already existed)
        """
        created_configs = []
        # Get active tools from the registry
        active_tools = ToolRegistry.objects.filter(is_active=True)
        for tool in active_tools:
            config, created = DeploymentToolConfig.objects.get_or_create(
                deployment=deployment,
                tool_type=tool.tool_id,
                defaults={
                    'enabled': tool.default_enabled,
                    'ai_key_mode': None,  # Inherit from deployment
                    'settings': tool.default_settings or self._get_default_tool_settings(tool.tool_id),
                    'priority': tool.sort_order,
                }
            )
            if created:
                created_configs.append(config)
                logger.info(f"Created tool config: {deployment.name}/{tool.tool_id}")

        return created_configs

    def get_tool_config(
        self,
        deployment: Deployment,
        tool_type: str
    ) -> Optional[DeploymentToolConfig]:
        """
        Get or create a tool config for a deployment.

        Args:
            deployment: The deployment
            tool_type: The tool type (e.g., 'jupyter', 'data_agent')

        Returns:
            The tool config
        """
        config, _ = DeploymentToolConfig.objects.get_or_create(
            deployment=deployment,
            tool_type=tool_type,
            defaults={
                'enabled': True,
                'settings': self._get_default_tool_settings(tool_type),
                'priority': self._get_default_tool_priority(tool_type),
            }
        )
        return config

    def get_enabled_tools(self, deployment: Deployment) -> List[DeploymentToolConfig]:
        """
        Get all enabled AND entitled tool configs for a deployment.

        A tool must be both:
        1. Enabled in DeploymentToolConfig
        2. Entitled via the organization's subscription

        Args:
            deployment: The deployment

        Returns:
            List of enabled and entitled tool configs
        """
        from billing.entitlement_service import entitlement_service

        # Get base enabled tools
        configs = list(DeploymentToolConfig.objects.filter(
            deployment=deployment,
            enabled=True
        ).order_by('-priority', 'tool_type'))

        # Filter by entitlements
        try:
            entitlements = entitlement_service.get_entitlements(
                deployment.organization
            )

            return [
                config for config in configs
                if entitlements.has_tool(config.tool_type)
            ]
        except Exception as e:
            # On error, return all enabled (permissive fallback)
            logger.warning(
                f"Failed to check entitlements for {deployment.id}: {e}. "
                f"Returning all enabled tools."
            )
            return configs

    def get_tool_secrets(
        self,
        deployment_id: str,
        tool_type: str,
        include_expired: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get secrets accessible to a specific tool.

        Args:
            deployment_id: The deployment ID
            tool_type: The tool type (e.g., 'jupyter', 'data_agent')
            include_expired: Whether to include expired access grants

        Returns:
            List of accessible secrets with access info
        """
        try:
            tool_config = DeploymentToolConfig.objects.get(
                deployment_id=deployment_id,
                tool_type=tool_type
            )
        except DeploymentToolConfig.DoesNotExist:
            logger.warning(f"Tool config not found: {deployment_id}/{tool_type}")
            return []

        accessible_secrets = []
        for access in tool_config.secret_access.select_related('secret_bundle').all():
            # Skip expired unless requested
            if not include_expired and access.is_expired:
                continue

            accessible_secrets.append({
                'secret_bundle': access.secret_bundle,
                'access_level': access.access_level,
                'allowed_keys': access.allowed_keys,
                'expires_at': access.expires_at,
                'is_expired': access.is_expired,
            })

        return accessible_secrets

    def resolve_tool_env_vars(
        self,
        deployment_id: str,
        tool_type: str,
    ) -> Dict[str, str]:
        """
        Resolve environment variables to inject for a tool.

        This is called at spawn time to get secrets that should be
        injected into the tool's environment.

        Args:
            deployment_id: The deployment ID
            tool_type: The tool type

        Returns:
            Dictionary of environment variable name -> value
        """
        env_vars = {}

        accessible = self.get_tool_secrets(deployment_id, tool_type)

        for access_info in accessible:
            secret_bundle = access_info['secret_bundle']
            allowed_keys = access_info['allowed_keys']

            try:
                # Fetch secrets from AWS
                if not secret_bundle.secrets_manager_arn:
                    continue

                secrets = self.secrets_service.get_secrets(
                    secret_bundle.secrets_manager_arn
                )

                # Get env var mapping from provider configs
                for provider, config in secret_bundle.provider_configs.items():
                    key_name = config.get('key_name')
                    env_var = config.get('env_var')

                    if not key_name or not env_var:
                        continue

                    # Check if this key is allowed (empty = all allowed)
                    if allowed_keys and key_name not in allowed_keys:
                        continue

                    if key_name in secrets:
                        env_vars[env_var] = secrets[key_name]

            except Exception as e:
                logger.error(
                    f"Failed to fetch secrets for tool {tool_type} "
                    f"from bundle {secret_bundle.name}: {e}"
                )
                # Continue with other bundles

        return env_vars

    def get_effective_ai_key_mode(
        self,
        deployment: Deployment,
        tool_type: str
    ) -> str:
        """
        Get the effective AI key mode for a tool.

        Returns the tool-specific mode if set, otherwise returns
        the deployment's default mode.

        Args:
            deployment: The deployment
            tool_type: The tool type

        Returns:
            The effective AI key mode ('byok', 'managed', or 'platform')
        """
        tool_config = self.get_tool_config(deployment, tool_type)
        return tool_config.effective_ai_key_mode

    def _get_default_tool_settings(self, tool_type: str) -> Dict[str, Any]:
        """
        Get default settings for a tool type.

        Falls back to hardcoded defaults if ToolRegistry doesn't have settings.

        Args:
            tool_type: The tool type (e.g., 'jupyter', 'chat')

        Returns:
            Default settings dictionary
        """
        # Hardcoded fallback defaults for common tools
        defaults = {
            'jupyter': {
                'default_kernel': 'python3',
                'max_memory_gb': 4,
                'allow_terminal': True,
            },
            'data_agent': {
                'default_model': 'gpt-4',
                'allow_web_search': False,
                'max_iterations': 10,
            },
            'langflow': {
                'max_flows': 10,
                'enable_custom_components': False,
            },
            'chat': {
                'default_model': 'gpt-4',
                'enable_history': True,
                'max_context_tokens': 8000,
            },
            'browser': {
                'allow_downloads': False,
                'allowed_domains': [],
                'blocked_domains': [],
            },
            'agentic_browser': {
                'allow_downloads': False,
                'max_concurrent_sessions': 1,
            },
            'ide': {
                'default_extensions': [],
                'allow_terminal': True,
            },
            'agterm': {
                'max_agents': 3,
            },
        }
        return defaults.get(tool_type, {})

    def _get_default_tool_priority(self, tool_type: str) -> int:
        """
        Get default priority for a tool type.

        Falls back to hardcoded priorities if ToolRegistry doesn't have sort_order.
        Higher priority tools appear first in the UI.

        Args:
            tool_type: The tool type (e.g., 'jupyter', 'chat')

        Returns:
            Default priority (0-100)
        """
        # Hardcoded fallback priorities (higher = first in UI)
        priorities = {
            'jupyter': 100,
            'chat': 90,
            'ide': 80,
            'agterm': 70,
            'data_agent': 60,
            'browser': 50,
            'agentic_browser': 40,
            'langflow': 30,
        }
        return priorities.get(tool_type, 0)

    def grant_bulk_secret_access(
        self,
        deployment: Deployment,
        secret_bundle: SecretBundle,
        tool_types: Optional[List[str]] = None,
        access_level: str = 'read',
        granted_by=None,
        granted_reason: str = '',
    ) -> List[ToolSecretAccess]:
        """
        Grant multiple tools access to a secret bundle.

        Useful when adding a new secret that multiple tools need.

        Args:
            deployment: The deployment
            secret_bundle: The secret bundle to grant access to
            tool_types: List of tool types to grant (None = all enabled tools)
            access_level: The access level ('read' or 'read_write')
            granted_by: The user granting access
            granted_reason: Reason for granting access

        Returns:
            List of created access grants
        """
        if tool_types is None:
            # Grant to all enabled tools
            tool_configs = self.get_enabled_tools(deployment)
        else:
            tool_configs = DeploymentToolConfig.objects.filter(
                deployment=deployment,
                tool_type__in=tool_types
            )

        created_accesses = []
        for tool_config in tool_configs:
            # Skip if already exists
            if ToolSecretAccess.objects.filter(
                tool_config=tool_config,
                secret_bundle=secret_bundle
            ).exists():
                continue

            access = ToolSecretAccess.objects.create(
                tool_config=tool_config,
                secret_bundle=secret_bundle,
                access_level=access_level,
                granted_by=granted_by,
                granted_reason=granted_reason,
            )
            created_accesses.append(access)
            logger.info(
                f"Granted {access_level} access to {secret_bundle.name} "
                f"for tool {tool_config.tool_type}"
            )

        return created_accesses


# Singleton instance for easy import
tool_config_service = ToolConfigService()
