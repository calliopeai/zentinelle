"""
OpenRouter API key management.

Docs: https://openrouter.ai/docs
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


class OpenRouterKeyManager(BaseKeyManager):
    """
    OpenRouter API key management.

    OpenRouter is a multi-provider router with good key management,
    per-key usage tracking, and credit limits.
    """

    provider_slug = 'openrouter'
    supports_rotation = True  # Via create-then-revoke
    supports_limits = True

    BASE_URL = 'https://openrouter.ai/api/v1'

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
        """Make authenticated request to OpenRouter API."""
        try:
            response = self.client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            error_body = e.response.text
            logger.error(f"OpenRouter API error: {e.response.status_code} - {error_body}")
            raise KeyManagerError(f"OpenRouter API error: {error_body}")
        except httpx.RequestError as e:
            logger.error(f"OpenRouter request failed: {e}")
            raise KeyManagerError(f"Failed to connect to OpenRouter: {e}")

    def create_key(
        self,
        name: str,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Create a new API key via OpenRouter.

        Args:
            name: Key name/label
            project_id: Not used
            rate_limit: Rate limit (requests per minute)
            budget_limit: Credit limit in USD
        """
        try:
            payload = {
                'name': name,
            }

            if budget_limit is not None:
                payload['limit'] = budget_limit

            data = self._request('POST', '/keys', json=payload)

            return ProviderKeyInfo(
                key_id=data['id'],
                key_value=data['key'],
                name=data.get('name', name),
                created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                    if 'created_at' in data else None,
                budget_limit=data.get('limit'),
            )

        except KeyManagerError:
            raise
        except Exception as e:
            logger.error(f"Failed to create OpenRouter key: {e}")
            raise KeyCreationError(f"Failed to create key: {e}")

    def revoke_key(self, key_id: str) -> bool:
        """
        Revoke/delete an API key.
        """
        try:
            self._request('DELETE', f'/keys/{key_id}')
            return True
        except KeyManagerError as e:
            raise KeyRevocationError(f"Failed to revoke key: {e}")

    def list_keys(self) -> list[dict]:
        """
        List all API keys.
        """
        data = self._request('GET', '/keys')
        keys = data.get('data', data) if isinstance(data, dict) else data

        return [
            {
                'id': k['id'],
                'name': k.get('name', ''),
                'created_at': k.get('created_at'),
                'limit': k.get('limit'),
                'usage': k.get('usage'),
                'is_free_tier': k.get('is_free_tier', False),
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

        OpenRouter provides per-key usage tracking.
        """
        try:
            # Get key details which include usage
            data = self._request('GET', f'/keys/{key_id}')

            return {
                'key_id': key_id,
                'usage_usd': data.get('usage', 0),
                'limit_usd': data.get('limit'),
                'remaining_usd': (data.get('limit', 0) - data.get('usage', 0))
                    if data.get('limit') else None,
                'is_free_tier': data.get('is_free_tier', False),
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
        Update credit limit on an existing key.
        """
        try:
            payload = {}
            if budget_limit is not None:
                payload['limit'] = budget_limit

            if payload:
                self._request('PATCH', f'/keys/{key_id}', json=payload)

            return True
        except Exception as e:
            logger.error(f"Failed to update key limits: {e}")
            return False

    def get_credits(self) -> dict:
        """
        Get account credit balance.
        """
        try:
            data = self._request('GET', '/credits')
            return {
                'credits': data.get('credits', 0),
                'credits_used': data.get('credits_used', 0),
            }
        except Exception as e:
            logger.error(f"Failed to get credits: {e}")
            return {'error': str(e)}
