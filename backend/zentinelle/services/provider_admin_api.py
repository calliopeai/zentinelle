"""
Provider Admin API Services - Manage API keys via provider Admin APIs.

Supports:
- OpenAI: Create/delete/list API keys, get usage per key
- Anthropic: Create/delete/list API keys, get usage
- Together AI: Create/delete API keys
- Fireworks: Create/delete API keys

For providers in MANAGED mode, this service handles:
1. Creating per-user API keys when user is provisioned
2. Revoking keys when user is offboarded
3. Rotating keys on schedule
4. Querying per-key usage stats
"""
import logging
from abc import ABC, abstractmethod
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


class ProviderAdminClient(ABC):
    """Abstract base class for provider admin API clients."""

    def __init__(self, admin_api_key: str):
        self.admin_api_key = admin_api_key

    @abstractmethod
    def create_api_key(
        self,
        name: str,
        permissions: List[str] = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> Dict[str, Any]:
        """
        Create a new API key.

        Returns:
            {
                'key_id': 'provider-key-id',
                'key_value': 'sk-...',  # The actual key (only returned once)
                'key_prefix': 'sk-abc...',
                'name': 'key-name',
                'created_at': datetime,
            }
        """
        pass

    @abstractmethod
    def delete_api_key(self, key_id: str) -> bool:
        """Delete/revoke an API key."""
        pass

    @abstractmethod
    def list_api_keys(self) -> List[Dict[str, Any]]:
        """List all API keys."""
        pass

    @abstractmethod
    def get_key_usage(
        self,
        key_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        """
        Get usage statistics for a specific key.

        Returns:
            {
                'requests': int,
                'input_tokens': int,
                'output_tokens': int,
                'cost_usd': float,
            }
        """
        pass

    @abstractmethod
    def get_total_usage(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        """Get total usage across all keys."""
        pass


class OpenAIAdminClient(ProviderAdminClient):
    """
    OpenAI Admin API client.

    Docs: https://platform.openai.com/docs/api-reference/organization
    """

    BASE_URL = 'https://api.openai.com/v1'

    def create_api_key(
        self,
        name: str,
        permissions: List[str] = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> Dict[str, Any]:
        import requests

        # OpenAI uses project-based API keys
        # First, we may need to create a project or use an existing one

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
            'Content-Type': 'application/json',
            'OpenAI-Organization': self._get_org_id(),
        }

        # Create API key
        payload = {
            'name': name,
        }

        if permissions:
            payload['permissions'] = permissions

        response = requests.post(
            f'{self.BASE_URL}/organization/api_keys',
            json=payload,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return {
            'key_id': data['id'],
            'key_value': data.get('key'),  # Only returned on creation
            'key_prefix': data.get('redacted_key', data.get('key', '')[:10] + '...'),
            'name': data['name'],
            'created_at': datetime.fromisoformat(data['created_at'].replace('Z', '+00:00')),
        }

    def delete_api_key(self, key_id: str) -> bool:
        import requests

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
            'OpenAI-Organization': self._get_org_id(),
        }

        response = requests.delete(
            f'{self.BASE_URL}/organization/api_keys/{key_id}',
            headers=headers,
            timeout=30,
        )

        return response.status_code == 200

    def list_api_keys(self) -> List[Dict[str, Any]]:
        import requests

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
            'OpenAI-Organization': self._get_org_id(),
        }

        response = requests.get(
            f'{self.BASE_URL}/organization/api_keys',
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return [
            {
                'key_id': key['id'],
                'name': key['name'],
                'key_prefix': key.get('redacted_key', ''),
                'created_at': datetime.fromisoformat(key['created_at'].replace('Z', '+00:00')),
            }
            for key in data.get('data', [])
        ]

    def get_key_usage(
        self,
        key_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        import requests

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
            'OpenAI-Organization': self._get_org_id(),
        }

        params = {
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'api_key_id': key_id,
        }

        response = requests.get(
            f'{self.BASE_URL}/organization/usage',
            params=params,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        # Aggregate usage data
        total_requests = 0
        total_input_tokens = 0
        total_output_tokens = 0
        total_cost = 0.0

        for bucket in data.get('data', []):
            total_requests += bucket.get('n_requests', 0)
            total_input_tokens += bucket.get('n_context_tokens_total', 0)
            total_output_tokens += bucket.get('n_generated_tokens_total', 0)
            total_cost += bucket.get('cost_in_major_unit', 0.0)

        return {
            'requests': total_requests,
            'input_tokens': total_input_tokens,
            'output_tokens': total_output_tokens,
            'cost_usd': total_cost,
        }

    def get_total_usage(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        import requests

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
            'OpenAI-Organization': self._get_org_id(),
        }

        params = {
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
        }

        response = requests.get(
            f'{self.BASE_URL}/organization/usage',
            params=params,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        total_requests = 0
        total_input_tokens = 0
        total_output_tokens = 0
        total_cost = 0.0

        for bucket in data.get('data', []):
            total_requests += bucket.get('n_requests', 0)
            total_input_tokens += bucket.get('n_context_tokens_total', 0)
            total_output_tokens += bucket.get('n_generated_tokens_total', 0)
            total_cost += bucket.get('cost_in_major_unit', 0.0)

        return {
            'requests': total_requests,
            'input_tokens': total_input_tokens,
            'output_tokens': total_output_tokens,
            'cost_usd': total_cost,
        }

    def _get_org_id(self) -> str:
        """Get OpenAI organization ID from settings or key."""
        return getattr(settings, 'OPENAI_ORG_ID', '')


class AnthropicAdminClient(ProviderAdminClient):
    """
    Anthropic Admin API client.

    Docs: https://docs.anthropic.com/en/api/admin-api
    """

    BASE_URL = 'https://api.anthropic.com/v1'

    def create_api_key(
        self,
        name: str,
        permissions: List[str] = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> Dict[str, Any]:
        import requests

        headers = {
            'x-api-key': self.admin_api_key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        }

        payload = {
            'name': name,
        }

        # Anthropic supports workspace-level limits
        if rate_limit:
            payload['rate_limit'] = rate_limit
        if budget_limit:
            payload['spend_limit'] = budget_limit

        response = requests.post(
            f'{self.BASE_URL}/admin/api_keys',
            json=payload,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return {
            'key_id': data['id'],
            'key_value': data.get('key'),
            'key_prefix': data.get('partial_key', data.get('key', '')[:15] + '...'),
            'name': data['name'],
            'created_at': datetime.fromisoformat(data['created_at'].replace('Z', '+00:00')),
        }

    def delete_api_key(self, key_id: str) -> bool:
        import requests

        headers = {
            'x-api-key': self.admin_api_key,
            'anthropic-version': '2023-06-01',
        }

        response = requests.delete(
            f'{self.BASE_URL}/admin/api_keys/{key_id}',
            headers=headers,
            timeout=30,
        )

        return response.status_code in (200, 204)

    def list_api_keys(self) -> List[Dict[str, Any]]:
        import requests

        headers = {
            'x-api-key': self.admin_api_key,
            'anthropic-version': '2023-06-01',
        }

        response = requests.get(
            f'{self.BASE_URL}/admin/api_keys',
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return [
            {
                'key_id': key['id'],
                'name': key['name'],
                'key_prefix': key.get('partial_key', ''),
                'created_at': datetime.fromisoformat(key['created_at'].replace('Z', '+00:00')),
            }
            for key in data.get('data', [])
        ]

    def get_key_usage(
        self,
        key_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        import requests

        headers = {
            'x-api-key': self.admin_api_key,
            'anthropic-version': '2023-06-01',
        }

        params = {
            'start_time': start_date.isoformat(),
            'end_time': end_date.isoformat(),
            'api_key_id': key_id,
        }

        response = requests.get(
            f'{self.BASE_URL}/admin/usage',
            params=params,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return {
            'requests': data.get('request_count', 0),
            'input_tokens': data.get('input_tokens', 0),
            'output_tokens': data.get('output_tokens', 0),
            'cost_usd': data.get('cost', 0.0),
        }

    def get_total_usage(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        import requests

        headers = {
            'x-api-key': self.admin_api_key,
            'anthropic-version': '2023-06-01',
        }

        params = {
            'start_time': start_date.isoformat(),
            'end_time': end_date.isoformat(),
        }

        response = requests.get(
            f'{self.BASE_URL}/admin/usage',
            params=params,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return {
            'requests': data.get('request_count', 0),
            'input_tokens': data.get('input_tokens', 0),
            'output_tokens': data.get('output_tokens', 0),
            'cost_usd': data.get('cost', 0.0),
        }


class TogetherAIAdminClient(ProviderAdminClient):
    """
    Together AI API client for key management.

    Docs: https://docs.together.ai/reference
    """

    BASE_URL = 'https://api.together.xyz/v1'

    def create_api_key(
        self,
        name: str,
        permissions: List[str] = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> Dict[str, Any]:
        import requests

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
            'Content-Type': 'application/json',
        }

        payload = {'name': name}

        response = requests.post(
            f'{self.BASE_URL}/api-keys',
            json=payload,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return {
            'key_id': data['id'],
            'key_value': data.get('key'),
            'key_prefix': data.get('key', '')[:10] + '...',
            'name': data['name'],
            'created_at': timezone.now(),
        }

    def delete_api_key(self, key_id: str) -> bool:
        import requests

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
        }

        response = requests.delete(
            f'{self.BASE_URL}/api-keys/{key_id}',
            headers=headers,
            timeout=30,
        )

        return response.status_code in (200, 204)

    def list_api_keys(self) -> List[Dict[str, Any]]:
        import requests

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
        }

        response = requests.get(
            f'{self.BASE_URL}/api-keys',
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return [
            {
                'key_id': key['id'],
                'name': key['name'],
                'key_prefix': key.get('prefix', ''),
                'created_at': timezone.now(),
            }
            for key in data.get('data', [])
        ]

    def get_key_usage(
        self,
        key_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        # Together AI usage API - query by key
        import requests

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
        }

        params = {
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'api_key_id': key_id,
        }

        response = requests.get(
            f'{self.BASE_URL}/usage',
            params=params,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return {
            'requests': data.get('requests', 0),
            'input_tokens': data.get('prompt_tokens', 0),
            'output_tokens': data.get('completion_tokens', 0),
            'cost_usd': data.get('cost', 0.0),
        }

    def get_total_usage(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        import requests

        headers = {
            'Authorization': f'Bearer {self.admin_api_key}',
        }

        params = {
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
        }

        response = requests.get(
            f'{self.BASE_URL}/usage',
            params=params,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        return {
            'requests': data.get('requests', 0),
            'input_tokens': data.get('prompt_tokens', 0),
            'output_tokens': data.get('completion_tokens', 0),
            'cost_usd': data.get('cost', 0.0),
        }


# =============================================================================
# Factory and Service Layer
# =============================================================================

def get_provider_client(provider_slug: str, admin_api_key: str) -> Optional[ProviderAdminClient]:
    """
    Factory function to get the appropriate provider client.
    """
    clients = {
        'openai': OpenAIAdminClient,
        'anthropic': AnthropicAdminClient,
        'together': TogetherAIAdminClient,
    }

    client_class = clients.get(provider_slug)
    if client_class:
        return client_class(admin_api_key)

    logger.warning(f"No admin client available for provider: {provider_slug}")
    return None
