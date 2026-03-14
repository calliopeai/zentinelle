"""
Hugging Face token management.

Docs: https://huggingface.co/docs/hub/api#access-tokens
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


class HuggingFaceKeyManager(BaseKeyManager):
    """
    Hugging Face access token management.

    Creates and manages HF access tokens for Inference API and Hub access.
    """

    provider_slug = 'huggingface'
    supports_rotation = True  # Via create-then-revoke
    supports_limits = False

    BASE_URL = 'https://huggingface.co/api'

    def __init__(self, admin_api_key: str, organization_id: str = None):
        """
        Initialize HuggingFace manager.

        Args:
            admin_api_key: HF access token with token management permissions
            organization_id: HF organization name (optional)
        """
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
        """Make authenticated request to HuggingFace API."""
        try:
            response = self.client.request(method, path, **kwargs)
            response.raise_for_status()
            if response.content:
                return response.json()
            return {}
        except httpx.HTTPStatusError as e:
            error_body = e.response.text
            logger.error(f"HuggingFace API error: {e.response.status_code} - {error_body}")
            raise KeyManagerError(f"HuggingFace API error: {error_body}")
        except httpx.RequestError as e:
            logger.error(f"HuggingFace request failed: {e}")
            raise KeyManagerError(f"Failed to connect to HuggingFace: {e}")

    def create_key(
        self,
        name: str,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Create a new HuggingFace access token.

        Args:
            name: Token name/description
            project_id: Not used
            rate_limit: Not supported
            budget_limit: Not supported
        """
        try:
            payload = {
                'name': name,
                'canReadGatedRepos': True,
                'canWriteRepos': False,
                'role': 'read',  # read, write, or admin
            }

            # If org specified, create org token
            if self.organization_id:
                payload['organizationId'] = self.organization_id

            data = self._request('POST', '/settings/tokens', json=payload)

            return ProviderKeyInfo(
                key_id=data.get('id', data.get('_id', '')),
                key_value=data['token'],
                name=name,
                created_at=datetime.fromisoformat(data['createdAt'].replace('Z', '+00:00'))
                    if 'createdAt' in data else None,
            )

        except KeyManagerError:
            raise
        except Exception as e:
            logger.error(f"Failed to create HuggingFace token: {e}")
            raise KeyCreationError(f"Failed to create token: {e}")

    def revoke_key(self, key_id: str) -> bool:
        """
        Revoke/delete an access token.
        """
        try:
            self._request('DELETE', f'/settings/tokens/{key_id}')
            return True
        except KeyManagerError as e:
            raise KeyRevocationError(f"Failed to revoke token: {e}")

    def list_keys(self) -> list[dict]:
        """
        List all access tokens.
        """
        data = self._request('GET', '/settings/tokens')
        tokens = data if isinstance(data, list) else data.get('tokens', [])

        return [
            {
                'id': t.get('id', t.get('_id', '')),
                'name': t.get('name', ''),
                'created_at': t.get('createdAt'),
                'role': t.get('role'),
            }
            for t in tokens
        ]

    def get_key_usage(
        self,
        key_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> dict:
        """
        HuggingFace doesn't provide per-token usage API.
        """
        return {
            'key_id': key_id,
            'note': 'HuggingFace does not provide per-token usage statistics',
        }
