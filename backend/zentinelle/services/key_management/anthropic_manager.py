"""
Anthropic Admin API key management.

Docs: https://docs.anthropic.com/en/api/admin-api
"""
import logging
import httpx
from datetime import datetime
from typing import Optional

from .base import (
    BaseKeyManager,
    ProviderKeyInfo,
    KeyCreationError,
    KeyRevocationError,
    KeyManagerError,
)

logger = logging.getLogger(__name__)


class AnthropicKeyManager(BaseKeyManager):
    """
    Anthropic Admin API key management.

    Requires an admin API key with workspace management permissions.
    """

    provider_slug = 'anthropic'
    supports_rotation = True
    supports_limits = True

    BASE_URL = 'https://api.anthropic.com/v1'

    def __init__(self, admin_api_key: str, organization_id: str = None):
        super().__init__(admin_api_key, organization_id)
        self.client = httpx.Client(
            base_url=self.BASE_URL,
            headers={
                'x-api-key': admin_api_key,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            timeout=30.0,
        )

    def _request(self, method: str, path: str, **kwargs) -> dict:
        """Make authenticated request to Anthropic Admin API."""
        try:
            response = self.client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            error_body = e.response.text
            logger.error(f"Anthropic API error: {e.response.status_code} - {error_body}")
            raise KeyManagerError(f"Anthropic API error: {error_body}")
        except httpx.RequestError as e:
            logger.error(f"Anthropic request failed: {e}")
            raise KeyManagerError(f"Failed to connect to Anthropic: {e}")

    def create_key(
        self,
        name: str,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Create a new API key via Anthropic Admin API.

        Anthropic supports:
        - Workspace-scoped keys
        - Per-workspace rate limits and budgets
        """
        try:
            payload = {
                'name': name,
            }

            # Anthropic uses workspaces instead of projects
            if project_id:
                payload['workspace_id'] = project_id

            # Admin endpoint for key creation
            data = self._request('POST', '/admin/api_keys', json=payload)

            return ProviderKeyInfo(
                key_id=data['id'],
                key_value=data['key'],  # Only available on creation!
                name=data.get('name', name),
                created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                    if 'created_at' in data else None,
                project_id=project_id,
            )

        except KeyManagerError:
            raise
        except Exception as e:
            logger.error(f"Failed to create Anthropic key: {e}")
            raise KeyCreationError(f"Failed to create key: {e}")

    def revoke_key(self, key_id: str) -> bool:
        """
        Revoke/delete an API key.
        """
        try:
            self._request('DELETE', f'/admin/api_keys/{key_id}')
            return True
        except KeyManagerError as e:
            raise KeyRevocationError(f"Failed to revoke key: {e}")

    def list_keys(self) -> list[dict]:
        """
        List all API keys in the organization.
        """
        data = self._request('GET', '/admin/api_keys')
        keys = data.get('data', [])

        return [
            {
                'id': k['id'],
                'name': k.get('name', ''),
                'created_at': k.get('created_at'),
                'status': k.get('status', 'active'),
                'workspace_id': k.get('workspace_id'),
            }
            for k in keys
        ]

    def get_key_usage(
        self,
        key_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> dict:
        """
        Get usage for a specific API key.

        Note: Anthropic may have usage data delays.
        """
        params = {
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'api_key_id': key_id,
        }

        try:
            data = self._request('GET', '/admin/usage', params=params)

            usage_items = data.get('data', [])
            total_input_tokens = sum(item.get('input_tokens', 0) for item in usage_items)
            total_output_tokens = sum(item.get('output_tokens', 0) for item in usage_items)
            total_cost = sum(item.get('cost_usd', 0) for item in usage_items)

            return {
                'key_id': key_id,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'input_tokens': total_input_tokens,
                'output_tokens': total_output_tokens,
                'total_tokens': total_input_tokens + total_output_tokens,
                'cost_usd': total_cost,
            }

        except Exception as e:
            logger.error(f"Failed to get usage for key {key_id}: {e}")
            return {
                'key_id': key_id,
                'error': str(e),
            }

    def create_workspace(self, name: str) -> str:
        """
        Create a new workspace for key isolation.

        Returns:
            Workspace ID
        """
        try:
            data = self._request('POST', '/admin/workspaces', json={'name': name})
            return data.get('id')
        except Exception as e:
            logger.error(f"Failed to create workspace: {e}")
            raise KeyManagerError(f"Failed to create workspace: {e}")

    def set_workspace_limits(
        self,
        workspace_id: str,
        spend_limit_usd: float = None,
    ) -> bool:
        """
        Set spend limit on a workspace.

        All keys in the workspace share this limit.
        """
        try:
            payload = {}
            if spend_limit_usd is not None:
                payload['spend_limit_usd'] = spend_limit_usd

            if payload:
                self._request('PATCH', f'/admin/workspaces/{workspace_id}', json=payload)

            return True
        except Exception as e:
            logger.error(f"Failed to set workspace limits: {e}")
            return False

    def get_workspaces(self) -> list[dict]:
        """List all workspaces."""
        data = self._request('GET', '/admin/workspaces')
        return data.get('data', [])
