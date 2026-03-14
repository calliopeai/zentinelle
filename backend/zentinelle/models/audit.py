import uuid

from django.db import models
from django.conf import settings


class AuditLog(models.Model):
    """
    Audit trail for admin actions in Zentinelle itself.
    Different from Event - this tracks changes to Zentinelle config, not agent activity.
    """

    class Action(models.TextChoices):
        CREATE = 'create', 'Create'
        UPDATE = 'update', 'Update'
        DELETE = 'delete', 'Delete'
        ACCESS = 'access', 'Access'
        LOGIN = 'login', 'Login'
        LOGOUT = 'logout', 'Logout'
        ROTATE_KEY = 'rotate_key', 'Rotate Key'
        SUSPEND = 'suspend', 'Suspend'
        ACTIVATE = 'activate', 'Activate'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Actor
    # TODO: decouple - user FK removed (use ext_user_id instead)
    ext_user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    api_key_prefix = models.CharField(
        max_length=12,
        blank=True,
        help_text='API key prefix if action via API key'
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)

    # Action
    action = models.CharField(max_length=50, choices=Action.choices)

    # Resource affected
    resource_type = models.CharField(
        max_length=50,
        help_text='Model name: endpoint, policy, secret_bundle, deployment'
    )
    resource_id = models.CharField(max_length=100)
    resource_name = models.CharField(max_length=255, blank=True)

    # Change details
    changes = models.JSONField(
        default=dict,
        blank=True,
        help_text='Format: {"field_name": {"old": "value", "new": "value"}}'
    )

    # Additional context
    metadata = models.JSONField(default=dict, blank=True)

    # Timestamp
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['tenant_id', 'timestamp']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['ext_user_id', 'timestamp']),
            models.Index(fields=['action', 'timestamp']),
        ]

    def __str__(self):
        return f"{self.action} {self.resource_type} - {self.timestamp}"

    @classmethod
    def log(
        cls,
        organization,
        action: str,
        resource_type: str,
        resource_id: str,
        resource_name: str = '',
        user=None,
        api_key_prefix: str = '',
        ip_address: str = None,
        user_agent: str = '',
        changes: dict = None,
        metadata: dict = None,
    ) -> 'AuditLog':
        """Factory method to create an audit log entry."""
        return cls.objects.create(
            organization=organization,
            user=user,
            api_key_prefix=api_key_prefix,
            ip_address=ip_address,
            user_agent=user_agent,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            resource_name=resource_name,
            changes=changes or {},
            metadata=metadata or {},
        )

    @classmethod
    def log_from_request(
        cls,
        request,
        organization,
        action: str,
        resource_type: str,
        resource_id: str,
        resource_name: str = '',
        changes: dict = None,
        metadata: dict = None,
    ) -> 'AuditLog':
        """Create audit log from a Django request."""
        # Get IP address
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(',')[0].strip()
        else:
            ip_address = request.META.get('REMOTE_ADDR')

        # Get API key prefix if using API key auth
        api_key_prefix = ''
        auth_header = request.META.get('HTTP_X_ZENTINELLE_KEY', '')
        if auth_header:
            api_key_prefix = auth_header[:12]

        return cls.log(
            organization=organization,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_name=resource_name,
            # user FK removed in standalone mode
            api_key_prefix=api_key_prefix,
            ip_address=ip_address,
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
            changes=changes,
            metadata=metadata,
        )
