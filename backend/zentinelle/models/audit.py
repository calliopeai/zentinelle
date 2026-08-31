import uuid

from django.db import models
from django.utils import timezone


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
    # `default`, not `auto_now_add`. auto_now_add assigns the value during the
    # INSERT, which is after the hash would have to be computed — so the record
    # would hash a timestamp of None and then be stored with a real one, and
    # every verification would fail. The value still cannot be chosen by a
    # caller in practice: nothing passes it, and altering it after the fact
    # breaks the hash, which is the point of the chain.
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    # Tamper-evident hash chain fields
    entry_hash = models.CharField(
        max_length=64,
        blank=True,
        default='',
        help_text='SHA-256 of this record content',
    )
    chain_hash = models.CharField(
        max_length=64,
        blank=True,
        default='',
        help_text='SHA-256(prev_chain_hash + entry_hash) — links to previous record',
    )
    chain_sequence = models.BigIntegerField(
        default=0,
        db_index=True,
        help_text='Monotonically increasing per-tenant sequence number',
    )

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['tenant_id', 'timestamp']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['ext_user_id', 'timestamp']),
            models.Index(fields=['action', 'timestamp']),
            models.Index(fields=['tenant_id', 'chain_sequence']),
        ]
        constraints = [
            # What actually prevents two concurrent writers producing two
            # records at the same point in one tenant's chain. Scoped to
            # sequences the chain writer allocates, so the rows written before
            # any of this existed — all of which sit at 0 — do not collide.
            models.UniqueConstraint(
                fields=['tenant_id', 'chain_sequence'],
                condition=models.Q(chain_sequence__gt=0),
                name='unique_audit_chain_sequence_per_tenant',
            ),
        ]

    def __str__(self):
        return f"{self.action} {self.resource_type} - {self.timestamp}"

    def compute_hashes(self, using=None):
        """Fill in this record's hashes from a locked chain head.

        Only meaningful inside the transaction `save()` opens: the head must be
        locked before the sequence is read, or two writers read the same one.
        """
        from zentinelle.services.audit_chain import _compute_entry_hash, compute_chain_hash

        head = self._locked_head(using=using)
        self.chain_sequence = head.last_sequence + 1
        self.entry_hash = _compute_entry_hash(self)
        self.chain_hash = compute_chain_hash(head.last_chain_hash, self.entry_hash)
        return head

    def _locked_head(self, using=None):
        """This tenant's chain head, locked for the rest of the transaction."""
        from django.db import IntegrityError, transaction

        try:
            return AuditChainHead.objects.select_for_update().get(tenant_id=self.tenant_id)
        except AuditChainHead.DoesNotExist:
            pass

        # First record for this tenant. Two writers can reach here together;
        # one creates the row, the other is told it already exists, and both
        # then take the lock on it.
        #
        # Inside its own savepoint, because a failed INSERT aborts the
        # enclosing transaction: Postgres refuses every subsequent statement
        # in it, and Django reports that as TransactionManagementError rather
        # than as the collision it was. The savepoint confines the failure to
        # the statement that caused it.
        try:
            with transaction.atomic(using=using):
                AuditChainHead.objects.create(tenant_id=self.tenant_id)
        except IntegrityError:
            pass
        return AuditChainHead.objects.select_for_update().get(tenant_id=self.tenant_id)

    def save(self, *args, **kwargs):
        """Write the record, hashed and chained when it is a new one.

        `self._state.adding`, not `not self.pk`. `id` is a UUIDField with
        `default=uuid.uuid4`, so `pk` is set the moment the instance is
        constructed and the old guard was never true — which is why no record
        in any deployment has ever carried a hash (#281). The chain the product
        sells as tamper-evident held empty strings.

        Allocating the sequence, hashing, inserting and advancing the head all
        happen under one lock on the tenant's head row, so appends to a chain
        are serialised per tenant. The unique constraint on
        (tenant_id, chain_sequence) stays as the backstop that makes a fork
        impossible even if this were bypassed.
        """
        if not self._state.adding:
            return super().save(*args, **kwargs)

        from django.db import router, transaction

        if self.timestamp is None:
            self.timestamp = timezone.now()

        using = kwargs.get('using') or router.db_for_write(type(self))

        with transaction.atomic(using=using):
            head = self.compute_hashes(using=using)
            result = super().save(*args, **kwargs)
            head.last_sequence = self.chain_sequence
            head.last_chain_hash = self.chain_hash
            head.save(using=using, update_fields=['last_sequence', 'last_chain_hash', 'updated_at'])
            return result

    @classmethod
    def log(
        cls,
        tenant_id: str,
        action: str,
        resource_type: str,
        resource_id: str,
        resource_name: str = '',
        ext_user_id: str = '',
        api_key_prefix: str = '',
        ip_address: str = None,
        user_agent: str = '',
        changes: dict = None,
        metadata: dict = None,
        # Legacy kwarg — maps to tenant_id for backward compatibility
        organization=None,
    ) -> 'AuditLog':
        """Factory method to create an audit log entry."""
        tid = tenant_id or (str(organization) if organization else '')
        return cls.objects.create(
            tenant_id=tid,
            ext_user_id=ext_user_id,
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
            tenant_id=str(organization) if organization else '',
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_name=resource_name,
            api_key_prefix=api_key_prefix,
            ip_address=ip_address,
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
            changes=changes,
            metadata=metadata,
        )


class AuditChainHead(models.Model):
    """Where one tenant's audit chain currently ends.

    One row per tenant, and the thing every appender takes a lock on. It exists
    because the obvious approach does not work: reading `MAX(chain_sequence)`
    and adding one lets two concurrent writers read the same maximum, and
    locking the last audit record does not help either, because the row a
    second writer would need to see has not been inserted yet when it takes its
    snapshot. Retrying on the resulting collision only converts the race into a
    thundering herd — every loser recomputes the same next sequence and
    collides again, which is exactly what the concurrency test showed.

    A lock on a row that always exists serialises appends per tenant, which is
    the honest shape of an append-only chain. Contention is per tenant and each
    holder does one insert.

    The head also carries the previous chain hash, so appending needs no query
    against the audit table at all.
    """

    tenant_id = models.CharField(max_length=255, primary_key=True)
    last_sequence = models.BigIntegerField(default=0)
    last_chain_hash = models.CharField(max_length=64, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'audit chain head'
        verbose_name_plural = 'audit chain heads'

    def __str__(self):
        return f"{self.tenant_id} @ {self.last_sequence}"
