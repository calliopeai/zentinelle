"""
OpenAI Admin API key management.

Docs: https://platform.openai.com/docs/api-reference/api-keys
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


class OpenAIKeyManager(BaseKeyManager):
    """
    OpenAI Admin API key management.

    Requires an admin API key with 'api_keys:write' scope.
    """

    provider_slug = 'openai'
    supports_rotation = True
    supports_limits = True

    BASE_URL = 'https://api.openai.com/v1/organization'

    def __init__(self, admin_api_key: str, organization_id: str = None):
        super().__init__(admin_api_key, organization_id)
        self.client = httpx.Client(
            base_url=self.BASE_URL,
            headers={
                'Authorization': f'Bearer {admin_api_key}',
                'Content-Type': 'application/json',
            },
            timeout=30.0,
        )

    def _request(self, method: str, path: str, **kwargs) -> dict:
        """Make authenticated request to OpenAI Admin API."""
        try:
            response = self.client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            error_body = e.response.text
            logger.error(f"OpenAI API error: {e.response.status_code} - {error_body}")
            raise KeyManagerError(f"OpenAI API error: {error_body}")
        except httpx.RequestError as e:
            logger.error(f"OpenAI request failed: {e}")
            raise KeyManagerError(f"Failed to connect to OpenAI: {e}")

    def create_key(
        self,
        name: str,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Create a new API key via OpenAI Admin API.

        OpenAI supports:
        - Project-scoped keys
        - Per-key rate limits (via project settings)
        """
        try:
            payload = {
                'name': name,
            }

            # If project specified, create project-scoped key
            if project_id:
                # Create key in specific project
                data = self._request(
                    'POST',
                    f'/projects/{project_id}/api_keys',
                    json=payload,
                )
            else:
                # Create organization-level key
                data = self._request('POST', '/api_keys', json=payload)

            # OpenAI returns the key value only on creation
            key_data = data.get('data', data)

            return ProviderKeyInfo(
                key_id=key_data['id'],
                key_value=key_data['key'],  # Only available on creation!
                name=key_data.get('name', name),
                created_at=datetime.fromisoformat(key_data['created_at'].replace('Z', '+00:00'))
                    if 'created_at' in key_data else None,
                project_id=project_id,
            )

        except KeyManagerError:
            raise
        except Exception as e:
            logger.error(f"Failed to create OpenAI key: {e}")
            raise KeyCreationError(f"Failed to create key: {e}")

    def revoke_key(self, key_id: str) -> bool:
        """
        Revoke/delete an API key.
        """
        try:
            self._request('DELETE', f'/api_keys/{key_id}')
            return True
        except KeyManagerError as e:
            raise KeyRevocationError(f"Failed to revoke key: {e}")

    def list_keys(self) -> list[dict]:
        """
        List all API keys in the organization.
        """
        data = self._request('GET', '/api_keys')
        keys = data.get('data', [])

        return [
            {
                'id': k['id'],
                'name': k.get('name', ''),
                'created_at': k.get('created_at'),
                'last_used_at': k.get('last_used_at'),
                'prefix': k.get('key', '')[:10] + '...' if k.get('key') else None,
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

        Note: OpenAI usage API may have delays (5-60 minutes).
        """
        params = {
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
        }

        try:
            # OpenAI usage endpoint
            data = self._request(
                'GET',
                '/usage',
                params=params,
            )

            # Filter for specific key if available in response
            # Note: OpenAI may not provide per-key breakdown in all endpoints
            usage_data = data.get('data', [])

            total_tokens = 0
            total_cost = 0.0

            for item in usage_data:
                if 'api_key_id' in item and item['api_key_id'] == key_id:
                    total_tokens += item.get('n_context_tokens_total', 0)
                    total_tokens += item.get('n_generated_tokens_total', 0)
                    # Cost calculation would need pricing data

            return {
                'key_id': key_id,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'total_tokens': total_tokens,
                'estimated_cost_usd': total_cost,
            }

        except Exception as e:
            logger.error(f"Failed to get usage for key {key_id}: {e}")
            return {
                'key_id': key_id,
                'error': str(e),
            }

    def create_project(self, name: str) -> str:
        """
        Create a new project for key isolation.

        Returns:
            Project ID
        """
        try:
            data = self._request('POST', '/projects', json={'name': name})
            return data.get('id')
        except Exception as e:
            logger.error(f"Failed to create project: {e}")
            raise KeyManagerError(f"Failed to create project: {e}")

    def set_project_limits(
        self,
        project_id: str,
        rate_limit_rpm: int = None,
        rate_limit_tpm: int = None,
        budget_limit_usd: float = None,
    ) -> bool:
        """
        Set rate/budget limits on a project.

        All keys in the project inherit these limits.
        """
        try:
            payload = {}
            if rate_limit_rpm is not None:
                payload['rate_limit_rpm'] = rate_limit_rpm
            if rate_limit_tpm is not None:
                payload['rate_limit_tpm'] = rate_limit_tpm
            if budget_limit_usd is not None:
                payload['monthly_budget_usd'] = budget_limit_usd

            if payload:
                self._request('PATCH', f'/projects/{project_id}', json=payload)

            return True
        except Exception as e:
            logger.error(f"Failed to set project limits: {e}")
            return False
