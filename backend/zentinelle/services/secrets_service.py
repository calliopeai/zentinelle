"""
Secrets Service - Multi-account AWS Secrets Manager wrapper.

Handles two deployment models:
1. Full AWS Deploy: Client has dedicated AWS account in our org
   - Secrets live in client's account
   - Access via cross-account role assumption

2. Zentinelle-Only: Client uses Zentinelle SaaS without full AWS deploy
   - Secrets live in Calliope's shared account
   - Isolated via namespace prefix: /zentinelle/{org_slug}/
"""
import json
import logging
from typing import Dict, Optional, TYPE_CHECKING

import boto3
from django.conf import settings

if TYPE_CHECKING:
    from organization.models import Organization

logger = logging.getLogger(__name__)


# Namespace prefix for zentinelle-only secrets in shared account
ZENTINELLE_SECRETS_PREFIX = 'zentinelle'


class SecretsAccountRouter:
    """
    Determines which AWS account and credentials to use for secrets operations.

    Routes based on Organization.deployment_model:
    - ZENTINELLE_ONLY: Use shared Calliope account with namespacing
    - FULL_DEPLOY: Use client's dedicated AWS account
    - BYOC: Use client's own AWS account (they manage)
    """

    def __init__(self, organization: 'Organization'):
        self.organization = organization
        self._aws_config = None

    @property
    def deployment_model(self) -> str:
        """Get the organization's deployment model."""
        return getattr(self.organization, 'deployment_model', 'sentinel_only')

    @property
    def aws_config(self):
        """Get organization's AWS configuration if it exists."""
        if self._aws_config is None:
            try:
                # Try new multi-cloud config first
                from organization.models import AWSCloudConfiguration
                self._aws_config = AWSCloudConfiguration.objects.filter(
                    organization=self.organization,
                    is_active=True,
                    is_default=True,
                ).first()

                # Fall back to legacy aws_config
                if not self._aws_config:
                    self._aws_config = getattr(self.organization, 'aws_config', None)
            except Exception:
                self._aws_config = None
        return self._aws_config

    @property
    def has_dedicated_account(self) -> bool:
        """Check if org has a dedicated AWS account (not shared)."""
        # Explicit check based on deployment model
        if self.deployment_model == 'sentinel_only':
            return False
        # FULL_DEPLOY and BYOC have their own accounts
        return bool(self.organization.primary_aws_account_id or (
            self.aws_config and self.aws_config.aws_account_id
        ))

    @property
    def account_id(self) -> Optional[str]:
        """Get the AWS account ID for secrets."""
        if self.has_dedicated_account:
            # Prefer explicit org-level field, fall back to config
            return (
                self.organization.primary_aws_account_id or
                (self.aws_config.aws_account_id if self.aws_config else None)
            )
        # Return platform account (for zentinelle-only)
        return getattr(settings, 'AWS_ACCOUNT_ID', None)

    def get_secrets_client(self):
        """
        Get a Secrets Manager client for the appropriate account.

        Returns:
            boto3 secretsmanager client configured for the right account
        """
        if self.has_dedicated_account and self.aws_config:
            # Use client's account via role assumption
            session = self.aws_config.get_boto3_session()
            return session.client('secretsmanager')
        else:
            # Use platform account (default credentials)
            return boto3.client('secretsmanager')

    def get_secret_name(self, base_name: str) -> str:
        """
        Get the full secret name with appropriate namespace.

        For zentinelle-only: zentinelle/{org_slug}/{base_name}
        For dedicated account: {base_name} (no prefix needed)
        """
        if self.has_dedicated_account:
            return base_name
        else:
            # Namespace in shared account
            return f"{ZENTINELLE_SECRETS_PREFIX}/{self.organization.slug}/{base_name}"


class SecretsService:
    """
    Service for managing secrets in AWS Secrets Manager.

    Handles multi-account routing and namespace isolation automatically.

    Usage:
        # For organization-scoped secrets
        service = SecretsService(organization=org)
        arn = service.create_secret('api-keys', {'openai': 'sk-...'})

        # For platform-level secrets (no organization)
        service = SecretsService()
        value = service.get_secret_value('platform/config', 'database_url')
    """

    def __init__(self, organization: 'Organization' = None):
        """
        Initialize secrets service.

        Args:
            organization: Organization for scoped secrets. If None, uses platform account.
        """
        self.organization = organization
        self._router = None
        self._client = None

    @property
    def router(self) -> Optional[SecretsAccountRouter]:
        """Get account router for organization."""
        if self.organization and self._router is None:
            self._router = SecretsAccountRouter(self.organization)
        return self._router

    @property
    def client(self):
        """Get the appropriate Secrets Manager client."""
        if self._client is None:
            if self.router:
                self._client = self.router.get_secrets_client()
            else:
                # Platform-level (no organization)
                self._client = boto3.client('secretsmanager')
        return self._client

    def _get_full_secret_name(self, name: str) -> str:
        """Get full secret name with namespace if needed."""
        if self.router:
            return self.router.get_secret_name(name)
        return name

    def _extract_secret_name(self, arn_or_name: str) -> str:
        """Extract secret name from ARN or return as-is."""
        if arn_or_name.startswith('arn:aws:secretsmanager:'):
            # Format: arn:aws:secretsmanager:region:account:secret:name-suffix
            parts = arn_or_name.split(':')
            if len(parts) >= 7:
                # Return everything after 'secret:'
                return ':'.join(parts[6:])
        return arn_or_name

    def get_secrets(self, secrets_manager_arn: str) -> Dict[str, str]:
        """
        Fetch secrets from AWS Secrets Manager by ARN.

        Args:
            secrets_manager_arn: Full ARN or secret name

        Returns:
            Dictionary of secret key-value pairs
        """
        try:
            secret_name = self._extract_secret_name(secrets_manager_arn)
            response = self.client.get_secret_value(SecretId=secret_name)

            secret_string = response.get('SecretString', '{}')

            try:
                return json.loads(secret_string)
            except json.JSONDecodeError:
                return {'value': secret_string}

        except Exception as e:
            logger.error(f"Failed to fetch secrets from {secrets_manager_arn}: {e}")
            raise

    def get_secret_value(self, secrets_manager_arn: str, key: str) -> Optional[str]:
        """
        Get a specific secret value by key.

        Args:
            secrets_manager_arn: Full ARN or secret name
            key: The key within the secret JSON

        Returns:
            The secret value or None if not found
        """
        secrets = self.get_secrets(secrets_manager_arn)
        return secrets.get(key)

    def create_secret(
        self,
        name: str,
        secret_value: Dict[str, str],
        description: str = '',
        tags: Dict[str, str] = None,
    ) -> str:
        """
        Create a new secret in AWS Secrets Manager.

        Automatically routes to the correct account and applies namespace.

        Args:
            name: Base secret name (namespace applied automatically)
            secret_value: Dictionary of key-value pairs
            description: Optional description
            tags: Optional tags (org tags added automatically)

        Returns:
            ARN of created secret
        """
        full_name = self._get_full_secret_name(name)

        # Build tags
        secret_tags = [
            {'Key': 'ManagedBy', 'Value': 'Zentinelle'},
        ]
        if self.organization:
            secret_tags.extend([
                {'Key': 'Organization', 'Value': self.organization.slug},
                {'Key': 'OrganizationId', 'Value': str(self.organization.id)},
            ])
        if tags:
            secret_tags.extend([{'Key': k, 'Value': v} for k, v in tags.items()])

        response = self.client.create_secret(
            Name=full_name,
            Description=description or f"Managed by Zentinelle for {self.organization.name if self.organization else 'platform'}",
            SecretString=json.dumps(secret_value),
            Tags=secret_tags,
        )

        logger.info(f"Created secret: {full_name} (org: {self.organization.slug if self.organization else 'platform'})")
        return response['ARN']

    def update_secret(
        self,
        secrets_manager_arn: str,
        secret_value: Dict[str, str],
    ) -> None:
        """
        Update an existing secret.

        Args:
            secrets_manager_arn: Full ARN or secret name
            secret_value: New secret value
        """
        secret_name = self._extract_secret_name(secrets_manager_arn)

        self.client.put_secret_value(
            SecretId=secret_name,
            SecretString=json.dumps(secret_value),
        )

        logger.info(f"Updated secret: {secret_name}")

    def update_secret_key(
        self,
        secrets_manager_arn: str,
        key: str,
        value: str,
    ) -> None:
        """
        Update a single key in a secret.

        Args:
            secrets_manager_arn: Full ARN or secret name
            key: Key to update
            value: New value
        """
        secrets = self.get_secrets(secrets_manager_arn)
        secrets[key] = value
        self.update_secret(secrets_manager_arn, secrets)

    def delete_secret(
        self,
        secrets_manager_arn: str,
        force: bool = False,
    ) -> None:
        """
        Delete a secret.

        Args:
            secrets_manager_arn: Full ARN or secret name
            force: If True, immediately delete. If False, schedule for deletion.
        """
        secret_name = self._extract_secret_name(secrets_manager_arn)

        if force:
            self.client.delete_secret(
                SecretId=secret_name,
                ForceDeleteWithoutRecovery=True,
            )
        else:
            # Schedule deletion (30-day recovery window)
            self.client.delete_secret(
                SecretId=secret_name,
                RecoveryWindowInDays=30,
            )

        logger.info(f"Deleted secret: {secret_name} (force={force})")

    def rotate_secret(self, secrets_manager_arn: str) -> None:
        """
        Trigger secret rotation.

        Note: Requires a rotation Lambda to be configured.

        Args:
            secrets_manager_arn: Full ARN or secret name
        """
        secret_name = self._extract_secret_name(secrets_manager_arn)
        self.client.rotate_secret(SecretId=secret_name)
        logger.info(f"Triggered rotation for secret: {secret_name}")

    def list_secrets(self, name_prefix: str = None) -> list:
        """
        List secrets for this organization.

        Args:
            name_prefix: Optional additional prefix filter

        Returns:
            List of secret metadata dicts
        """
        # Build filters
        filters = []

        if self.organization and not self.router.has_dedicated_account:
            # In shared account, filter by org namespace
            org_prefix = f"{ZENTINELLE_SECRETS_PREFIX}/{self.organization.slug}/"
            if name_prefix:
                org_prefix += name_prefix
            filters.append({'Key': 'name', 'Values': [org_prefix]})
        elif name_prefix:
            filters.append({'Key': 'name', 'Values': [name_prefix]})

        # Also filter by org tag
        if self.organization:
            filters.append({
                'Key': 'tag-key',
                'Values': ['OrganizationId']
            })
            filters.append({
                'Key': 'tag-value',
                'Values': [str(self.organization.id)]
            })

        paginator = self.client.get_paginator('list_secrets')
        secrets = []

        for page in paginator.paginate(Filters=filters if filters else []):
            for secret in page.get('SecretList', []):
                secrets.append({
                    'arn': secret['ARN'],
                    'name': secret['Name'],
                    'description': secret.get('Description', ''),
                    'created_at': secret.get('CreatedDate'),
                    'last_accessed': secret.get('LastAccessedDate'),
                    'last_rotated': secret.get('LastRotatedDate'),
                    'tags': {t['Key']: t['Value'] for t in secret.get('Tags', [])},
                })

        return secrets


# Convenience functions for common operations
def get_secret_for_org(organization: 'Organization', arn: str) -> Dict[str, str]:
    """Get secrets for an organization."""
    service = SecretsService(organization=organization)
    return service.get_secrets(arn)


def create_secret_for_org(
    organization: 'Organization',
    name: str,
    value: Dict[str, str],
    description: str = '',
) -> str:
    """Create a secret for an organization."""
    service = SecretsService(organization=organization)
    return service.create_secret(name, value, description)


def update_secret_value(secret_arn: str, new_value: str, organization: 'Organization' = None) -> None:
    """
    Update a single-value secret.

    Used by key rotation to update the key value.
    """
    service = SecretsService(organization=organization)
    service.update_secret(secret_arn, {'value': new_value})
