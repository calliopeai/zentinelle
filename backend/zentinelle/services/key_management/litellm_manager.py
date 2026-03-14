"""
LiteLLM Proxy key management.

Docs: https://docs.litellm.ai/docs/proxy/virtual_keys

LiteLLM is a self-hosted proxy that provides key management,
rate limiting, and usage tracking across multiple providers.
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


class LiteLLMKeyManager(BaseKeyManager):
    """
    LiteLLM Proxy virtual key management.

    LiteLLM provides full key lifecycle management via its Admin API,
    including per-key rate limits, budgets, and usage tracking.
    """

    provider_slug = 'litellm'
    supports_rotation = True
    supports_limits = True

    def __init__(
        self,
        admin_api_key: str,
        organization_id: str = None,
        base_url: str = None,
    ):
        """
        Initialize LiteLLM manager.

        Args:
            admin_api_key: LiteLLM master key for admin operations
            organization_id: Optional team/org identifier
            base_url: LiteLLM proxy URL (e.g., http://localhost:4000)
        """
        super().__init__(admin_api_key, organization_id)

        if not base_url:
            raise KeyManagerError("LiteLLM requires base_url for self-hosted proxy")

        self.base_url = base_url.rstrip('/')
        self.client = httpx.Client(
            base_url=self.base_url,
            headers={
                'Authorization': f'Bearer {admin_api_key}',
                'Content-Type': 'application/json',
            },
            timeout=30.0,
        )

    def _request(self, method: str, path: str, **kwargs) -> dict:
        """Make authenticated request to LiteLLM API."""
        try:
            response = self.client.request(method, path, **kwargs)
            response.raise_for_status()
            if response.content:
                return response.json()
            return {}
        except httpx.HTTPStatusError as e:
            error_body = e.response.text
            logger.error(f"LiteLLM API error: {e.response.status_code} - {error_body}")
            raise KeyManagerError(f"LiteLLM API error: {error_body}")
        except httpx.RequestError as e:
            logger.error(f"LiteLLM request failed: {e}")
            raise KeyManagerError(f"Failed to connect to LiteLLM: {e}")

    def create_key(
        self,
        name: str,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Create a new virtual key via LiteLLM.

        Args:
            name: Key alias/name
            project_id: Team ID to assign key to
            rate_limit: Requests per minute (rpm)
            budget_limit: Max budget in USD
        """
        try:
            payload = {
                'key_alias': name,
            }

            # Team assignment
            if project_id or self.organization_id:
                payload['team_id'] = project_id or self.organization_id

            # Rate limiting
            if rate_limit:
                payload['rpm_limit'] = rate_limit

            # Budget limit
            if budget_limit:
                payload['max_budget'] = budget_limit

            data = self._request('POST', '/key/generate', json=payload)

            return ProviderKeyInfo(
                key_id=data.get('token', data.get('key', '')),  # LiteLLM uses token as ID
                key_value=data.get('key', data.get('token', '')),
                name=name,
                created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                    if 'created_at' in data else datetime.now(),
                rate_limit=data.get('rpm_limit'),
                budget_limit=data.get('max_budget'),
            )

        except KeyManagerError:
            raise
        except Exception as e:
            logger.error(f"Failed to create LiteLLM key: {e}")
            raise KeyCreationError(f"Failed to create key: {e}")

    def revoke_key(self, key_id: str) -> bool:
        """
        Revoke/delete a virtual key.

        Args:
            key_id: The key token to revoke
        """
        try:
            self._request('POST', '/key/delete', json={'keys': [key_id]})
            return True
        except KeyManagerError as e:
            raise KeyRevocationError(f"Failed to revoke key: {e}")

    def list_keys(self) -> list[dict]:
        """
        List all virtual keys.
        """
        data = self._request('GET', '/key/list')
        keys = data if isinstance(data, list) else data.get('keys', [])

        return [
            {
                'id': k.get('token', ''),
                'name': k.get('key_alias', k.get('key_name', '')),
                'created_at': k.get('created_at'),
                'expires': k.get('expires'),
                'rpm_limit': k.get('rpm_limit'),
                'tpm_limit': k.get('tpm_limit'),
                'max_budget': k.get('max_budget'),
                'spend': k.get('spend', 0),
                'team_id': k.get('team_id'),
                'models': k.get('models', []),
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
        Get usage for a specific key.

        LiteLLM tracks spend and usage per key.
        """
        try:
            # Get key info which includes spend
            data = self._request('GET', '/key/info', params={'key': key_id})

            return {
                'key_id': key_id,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'spend_usd': data.get('spend', 0),
                'max_budget': data.get('max_budget'),
                'remaining_budget': (data.get('max_budget', 0) - data.get('spend', 0))
                    if data.get('max_budget') else None,
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
        """
        try:
            payload = {'key': key_id}

            if rate_limit is not None:
                payload['rpm_limit'] = rate_limit
            if budget_limit is not None:
                payload['max_budget'] = budget_limit

            self._request('POST', '/key/update', json=payload)
            return True

        except Exception as e:
            logger.error(f"Failed to update key limits: {e}")
            return False

    def rotate_key(
        self,
        old_key_id: str,
        name: str = None,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Rotate a key - LiteLLM has native key regeneration.
        """
        try:
            # Get existing key info
            existing = self._request('GET', '/key/info', params={'key': old_key_id})

            # Use existing values as defaults
            payload = {
                'key': old_key_id,
            }

            # Preserve or update settings
            if name:
                payload['key_alias'] = name
            if rate_limit is not None:
                payload['rpm_limit'] = rate_limit
            elif existing.get('rpm_limit'):
                payload['rpm_limit'] = existing['rpm_limit']
            if budget_limit is not None:
                payload['max_budget'] = budget_limit
            elif existing.get('max_budget'):
                payload['max_budget'] = existing['max_budget']

            # Regenerate key
            data = self._request('POST', '/key/regenerate', json=payload)

            return ProviderKeyInfo(
                key_id=data.get('token', data.get('key', '')),
                key_value=data.get('key', data.get('token', '')),
                name=name or existing.get('key_alias', ''),
                created_at=datetime.now(),
                rate_limit=data.get('rpm_limit'),
                budget_limit=data.get('max_budget'),
            )

        except KeyManagerError:
            raise
        except Exception as e:
            logger.error(f"Failed to rotate LiteLLM key: {e}")
            raise KeyManagerError(f"Failed to rotate key: {e}")

    def create_team(self, team_alias: str, budget: float = None) -> dict:
        """
        Create a team for organizing keys.

        Teams allow grouping keys and sharing budgets.
        """
        try:
            payload = {'team_alias': team_alias}
            if budget:
                payload['max_budget'] = budget

            data = self._request('POST', '/team/new', json=payload)
            return {
                'team_id': data.get('team_id'),
                'team_alias': team_alias,
            }

        except Exception as e:
            logger.error(f"Failed to create team: {e}")
            raise KeyManagerError(f"Failed to create team: {e}")

    def test_connection(self) -> bool:
        """Test connection to LiteLLM proxy."""
        try:
            self._request('GET', '/health')
            return True
        except Exception as e:
            logger.error(f"LiteLLM connection test failed: {e}")
            return False
