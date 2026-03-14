"""
Together AI API key management.

Docs: https://docs.together.ai/reference/api-keys
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


class TogetherKeyManager(BaseKeyManager):
    """
    Together AI API key management.

    Together AI supports creating and deleting API keys programmatically.
    No native rotation - uses create-then-revoke pattern.
    """

    provider_slug = 'together'
    supports_rotation = True  # Via create-then-revoke
    supports_limits = True

    BASE_URL = 'https://api.together.xyz/v1'

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
        """Make authenticated request to Together API."""
        try:
            response = self.client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            error_body = e.response.text
            logger.error(f"Together API error: {e.response.status_code} - {error_body}")
            raise KeyManagerError(f"Together API error: {error_body}")
        except httpx.RequestError as e:
            logger.error(f"Together request failed: {e}")
            raise KeyManagerError(f"Failed to connect to Together: {e}")

    def create_key(
        self,
        name: str,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Create a new API key via Together API.

        Args:
            name: Human-readable name for the key
            project_id: Not used (Together doesn't support project isolation)
            rate_limit: Rate limit (if supported)
            budget_limit: Budget limit (if supported)
        """
        try:
            payload = {
                'name': name,
            }

            data = self._request('POST', '/api-keys', json=payload)

            return ProviderKeyInfo(
                key_id=data['id'],
                key_value=data['key'],
                name=data.get('name', name),
                created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                    if 'created_at' in data else None,
            )

        except KeyManagerError:
            raise
        except Exception as e:
            logger.error(f"Failed to create Together key: {e}")
            raise KeyCreationError(f"Failed to create key: {e}")

    def revoke_key(self, key_id: str) -> bool:
        """
        Revoke/delete an API key.
        """
        try:
            self._request('DELETE', f'/api-keys/{key_id}')
            return True
        except KeyManagerError as e:
            raise KeyRevocationError(f"Failed to revoke key: {e}")

    def list_keys(self) -> list[dict]:
        """
        List all API keys.
        """
        data = self._request('GET', '/api-keys')
        keys = data if isinstance(data, list) else data.get('data', data.get('keys', []))

        return [
            {
                'id': k['id'],
                'name': k.get('name', ''),
                'created_at': k.get('created_at'),
                'last_used_at': k.get('last_used_at'),
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
        """
        params = {
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
        }

        try:
            data = self._request('GET', '/usage', params=params)

            # Together may return usage broken down by key
            usage_items = data if isinstance(data, list) else data.get('data', [])

            total_tokens = 0
            total_cost = 0.0

            for item in usage_items:
                if item.get('api_key_id') == key_id or not item.get('api_key_id'):
                    total_tokens += item.get('total_tokens', 0)
                    total_cost += item.get('cost', 0)

            return {
                'key_id': key_id,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'total_tokens': total_tokens,
                'cost_usd': total_cost,
            }

        except Exception as e:
            logger.error(f"Failed to get usage for key {key_id}: {e}")
            return {
                'key_id': key_id,
                'error': str(e),
            }
