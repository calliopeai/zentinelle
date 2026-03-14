"""
AWS Bedrock IAM credential management.

Bedrock uses IAM authentication, not API keys. This manager handles:
- IAM user creation with Bedrock-scoped permissions
- IAM access key rotation
- Usage tracking via CloudWatch

Requires AWS credentials with IAM admin permissions.
"""
import logging
from datetime import datetime
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from .base import (
    BaseKeyManager,
    ProviderKeyInfo,
    KeyCreationError,
    KeyRevocationError,
    KeyManagerError,
    KeyNotSupportedError,
)

logger = logging.getLogger(__name__)


# IAM policy for Bedrock access
BEDROCK_POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
                "bedrock:ListFoundationModels",
                "bedrock:GetFoundationModel",
            ],
            "Resource": "*"
        }
    ]
}


class BedrockKeyManager(BaseKeyManager):
    """
    AWS Bedrock IAM credential management.

    Creates IAM users with Bedrock permissions and manages their access keys.
    Supports key rotation via IAM access key rotation.
    """

    provider_slug = 'aws_bedrock'
    supports_rotation = True
    supports_limits = False  # Limits managed via AWS budgets/quotas

    def __init__(
        self,
        admin_api_key: str = None,  # Not used - uses AWS credentials
        organization_id: str = None,
        aws_access_key_id: str = None,
        aws_secret_access_key: str = None,
        aws_region: str = 'us-east-1',
        iam_path: str = '/zentinelle/',
    ):
        """
        Initialize Bedrock manager.

        Args:
            admin_api_key: Not used (kept for interface compatibility)
            organization_id: AWS account ID or org identifier
            aws_access_key_id: AWS access key with IAM permissions
            aws_secret_access_key: AWS secret key
            aws_region: AWS region for Bedrock
            iam_path: IAM path prefix for created users
        """
        super().__init__(admin_api_key or '', organization_id)

        self.aws_region = aws_region
        self.iam_path = iam_path

        # Initialize AWS clients
        session_kwargs = {}
        if aws_access_key_id and aws_secret_access_key:
            session_kwargs['aws_access_key_id'] = aws_access_key_id
            session_kwargs['aws_secret_access_key'] = aws_secret_access_key

        self.session = boto3.Session(**session_kwargs, region_name=aws_region)
        self.iam = self.session.client('iam')
        self.cloudwatch = self.session.client('cloudwatch')

    def _get_policy_arn(self, policy_name: str) -> Optional[str]:
        """Get ARN for a policy by name, or None if not exists."""
        try:
            paginator = self.iam.get_paginator('list_policies')
            for page in paginator.paginate(Scope='Local', PathPrefix=self.iam_path):
                for policy in page['Policies']:
                    if policy['PolicyName'] == policy_name:
                        return policy['Arn']
            return None
        except ClientError as e:
            logger.error(f"Failed to list policies: {e}")
            return None

    def _ensure_bedrock_policy(self) -> str:
        """Ensure Bedrock access policy exists and return its ARN."""
        policy_name = 'ZentinelleBedrockAccess'

        # Check if policy exists
        existing_arn = self._get_policy_arn(policy_name)
        if existing_arn:
            return existing_arn

        # Create policy
        try:
            import json
            response = self.iam.create_policy(
                PolicyName=policy_name,
                Path=self.iam_path,
                PolicyDocument=json.dumps(BEDROCK_POLICY),
                Description='Bedrock access policy for Zentinelle managed users',
            )
            return response['Policy']['Arn']
        except ClientError as e:
            logger.error(f"Failed to create Bedrock policy: {e}")
            raise KeyManagerError(f"Failed to create IAM policy: {e}")

    def create_key(
        self,
        name: str,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Create IAM user with Bedrock access and generate access key.

        Args:
            name: User identifier (will be sanitized for IAM)
            project_id: Optional tag for organization
            rate_limit: Not supported (use AWS quotas)
            budget_limit: Not supported (use AWS budgets)

        Returns:
            ProviderKeyInfo with IAM access key credentials
        """
        # Sanitize name for IAM (alphanumeric, +=,.@-_ only)
        import re
        iam_username = re.sub(r'[^a-zA-Z0-9+=,.@_-]', '_', name)[:64]
        iam_username = f"zentinelle-{iam_username}"

        try:
            # Ensure Bedrock policy exists
            policy_arn = self._ensure_bedrock_policy()

            # Create IAM user
            self.iam.create_user(
                UserName=iam_username,
                Path=self.iam_path,
                Tags=[
                    {'Key': 'ManagedBy', 'Value': 'Zentinelle'},
                    {'Key': 'Purpose', 'Value': 'Bedrock Access'},
                ] + ([{'Key': 'Project', 'Value': project_id}] if project_id else []),
            )

            # Attach Bedrock policy
            self.iam.attach_user_policy(
                UserName=iam_username,
                PolicyArn=policy_arn,
            )

            # Create access key
            key_response = self.iam.create_access_key(UserName=iam_username)
            access_key = key_response['AccessKey']

            return ProviderKeyInfo(
                key_id=access_key['AccessKeyId'],
                key_value=access_key['SecretAccessKey'],
                name=iam_username,
                created_at=access_key['CreateDate'],
                project_id=project_id,
            )

        except ClientError as e:
            logger.error(f"Failed to create Bedrock IAM user: {e}")
            # Cleanup on failure
            try:
                self.iam.delete_user(UserName=iam_username)
            except Exception:
                pass
            raise KeyCreationError(f"Failed to create IAM credentials: {e}")

    def revoke_key(self, key_id: str) -> bool:
        """
        Revoke IAM access key and optionally delete user.

        Args:
            key_id: IAM Access Key ID
        """
        try:
            # Find the user for this access key
            # We need to list users to find which one owns this key
            username = self._find_user_for_key(key_id)

            if not username:
                logger.warning(f"Could not find user for key {key_id}")
                return False

            # Delete the access key
            self.iam.delete_access_key(
                UserName=username,
                AccessKeyId=key_id,
            )

            # Check if user has other keys
            keys_response = self.iam.list_access_keys(UserName=username)
            if not keys_response['AccessKeyMetadata']:
                # No more keys - delete the user
                self._delete_user(username)

            return True

        except ClientError as e:
            logger.error(f"Failed to revoke key {key_id}: {e}")
            raise KeyRevocationError(f"Failed to revoke IAM key: {e}")

    def _find_user_for_key(self, access_key_id: str) -> Optional[str]:
        """Find IAM username that owns an access key."""
        try:
            paginator = self.iam.get_paginator('list_users')
            for page in paginator.paginate(PathPrefix=self.iam_path):
                for user in page['Users']:
                    keys = self.iam.list_access_keys(UserName=user['UserName'])
                    for key in keys['AccessKeyMetadata']:
                        if key['AccessKeyId'] == access_key_id:
                            return user['UserName']
            return None
        except ClientError as e:
            logger.error(f"Failed to find user for key: {e}")
            return None

    def _delete_user(self, username: str):
        """Delete IAM user and all associated resources."""
        try:
            # Detach policies
            policies = self.iam.list_attached_user_policies(UserName=username)
            for policy in policies['AttachedPolicies']:
                self.iam.detach_user_policy(
                    UserName=username,
                    PolicyArn=policy['PolicyArn'],
                )

            # Delete inline policies
            inline = self.iam.list_user_policies(UserName=username)
            for policy_name in inline['PolicyNames']:
                self.iam.delete_user_policy(
                    UserName=username,
                    PolicyName=policy_name,
                )

            # Delete access keys
            keys = self.iam.list_access_keys(UserName=username)
            for key in keys['AccessKeyMetadata']:
                self.iam.delete_access_key(
                    UserName=username,
                    AccessKeyId=key['AccessKeyId'],
                )

            # Delete user
            self.iam.delete_user(UserName=username)
            logger.info(f"Deleted IAM user {username}")

        except ClientError as e:
            logger.error(f"Failed to delete user {username}: {e}")

    def rotate_key(
        self,
        old_key_id: str,
        name: str = None,
        project_id: str = None,
        rate_limit: int = None,
        budget_limit: float = None,
    ) -> ProviderKeyInfo:
        """
        Rotate IAM access key for existing user.

        Creates new key, returns it, then deletes old key.
        """
        try:
            username = self._find_user_for_key(old_key_id)
            if not username:
                raise KeyManagerError(f"Could not find user for key {old_key_id}")

            # Create new access key
            key_response = self.iam.create_access_key(UserName=username)
            new_key = key_response['AccessKey']

            # Delete old key
            self.iam.delete_access_key(
                UserName=username,
                AccessKeyId=old_key_id,
            )

            return ProviderKeyInfo(
                key_id=new_key['AccessKeyId'],
                key_value=new_key['SecretAccessKey'],
                name=username,
                created_at=new_key['CreateDate'],
                project_id=project_id,
            )

        except ClientError as e:
            logger.error(f"Failed to rotate key {old_key_id}: {e}")
            raise KeyManagerError(f"Failed to rotate IAM key: {e}")

    def list_keys(self) -> list[dict]:
        """
        List all Zentinelle-managed IAM users and their keys.
        """
        keys = []
        try:
            paginator = self.iam.get_paginator('list_users')
            for page in paginator.paginate(PathPrefix=self.iam_path):
                for user in page['Users']:
                    user_keys = self.iam.list_access_keys(UserName=user['UserName'])
                    for key in user_keys['AccessKeyMetadata']:
                        keys.append({
                            'id': key['AccessKeyId'],
                            'name': user['UserName'],
                            'created_at': key['CreateDate'].isoformat(),
                            'status': key['Status'],
                        })
            return keys
        except ClientError as e:
            logger.error(f"Failed to list keys: {e}")
            return []

    def get_key_usage(
        self,
        key_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> dict:
        """
        Get usage metrics from CloudWatch.

        Note: Bedrock usage is tracked via CloudWatch metrics.
        """
        try:
            # Query CloudWatch for Bedrock invocations
            response = self.cloudwatch.get_metric_statistics(
                Namespace='AWS/Bedrock',
                MetricName='Invocations',
                StartTime=start_date,
                EndTime=end_date,
                Period=86400,  # Daily
                Statistics=['Sum'],
            )

            total_invocations = sum(
                dp['Sum'] for dp in response.get('Datapoints', [])
            )

            return {
                'key_id': key_id,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'invocations': int(total_invocations),
                'note': 'Bedrock usage is at account level, not per-key',
            }

        except Exception as e:
            logger.error(f"Failed to get Bedrock usage: {e}")
            return {
                'key_id': key_id,
                'error': str(e),
            }

    def test_connection(self) -> bool:
        """Test AWS credentials are valid."""
        try:
            self.iam.get_user()
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == 'AccessDenied':
                # May not have GetUser permission but creds are valid
                try:
                    self.iam.list_users(MaxItems=1)
                    return True
                except Exception:
                    pass
            logger.error(f"AWS connection test failed: {e}")
            return False
