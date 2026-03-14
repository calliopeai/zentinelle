"""
Fireworks AI API key management.

Docs: https://docs.fireworks.ai/
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


class FireworksKeyManager(BaseKeyManager):
    """
    Fireworks AI API key management.

    Fireworks supports creating and deleting API keys programmatically.
    Also supports per-key rate limits and usage tracking.
    """

    provider_slug = 'fireworks'
    supports_rotation = True  # Via create-then-revoke
    supports_limits = True

    BASE_URL = 'https://api.fireworks.ai/v1'

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
        """Make authenticated request to Fireworks API."""
        try:
            response = self.client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            error_body = e.response.text
            logger.error(f"Fireworks API error: {e.response.status_code} - {error_body}")
            raise KeyManagerError(f"Fireworks API error: {error_body}")
        except httpx.RequestError as e:
            logger.error(f"Fireworks request failed: {e}")
            raise KeyManagerError(f"Failed to connect to Fireworks: {e}")

    def create_key(
        self,
        name: str,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Create a new API key via Fireworks API.

        Args:
            name: Human-readable name for the key
            project_id: Account/project scope (if supported)
            rate_limit: Requests per minute limit
            budget_limit: Monthly spend limit in USD
        """
        try:
            payload = {
                'name': name,
            }

            # Add limits if supported
            if rate_limit:
                payload['rate_limit_rpm'] = rate_limit
            if budget_limit:
                payload['monthly_budget_usd'] = budget_limit

            data = self._request('POST', '/api-keys', json=payload)

            return ProviderKeyInfo(
                key_id=data['id'],
                key_value=data['key'],
                name=data.get('name', name),
                created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                    if 'created_at' in data else None,
                rate_limit=data.get('rate_limit_rpm'),
                budget_limit=data.get('monthly_budget_usd'),
            )

        except KeyManagerError:
            raise
        except Exception as e:
            logger.error(f"Failed to create Fireworks key: {e}")
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
        keys = data if isinstance(data, list) else data.get('data', data.get('api_keys', []))

        return [
            {
                'id': k['id'],
                'name': k.get('name', ''),
                'created_at': k.get('created_at'),
                'last_used_at': k.get('last_used_at'),
                'rate_limit_rpm': k.get('rate_limit_rpm'),
                'monthly_budget_usd': k.get('monthly_budget_usd'),
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
            'api_key_id': key_id,
        }

        try:
            data = self._request('GET', '/usage', params=params)

            usage_items = data if isinstance(data, list) else data.get('data', [])

            total_tokens = 0
            total_cost = 0.0

            for item in usage_items:
                total_tokens += item.get('total_tokens', 0)
                total_cost += item.get('cost_usd', 0)

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

    def update_key_limits(
        self,
        key_id: str,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> bool:
        """
        Update limits on an existing key.

        Fireworks supports updating key limits.
        """
        try:
            payload = {}
            if rate_limit is not None:
                payload['rate_limit_rpm'] = rate_limit
            if budget_limit is not None:
                payload['monthly_budget_usd'] = budget_limit

            if payload:
                self._request('PATCH', f'/api-keys/{key_id}', json=payload)

            return True
        except Exception as e:
            logger.error(f"Failed to update key limits: {e}")
            return False
