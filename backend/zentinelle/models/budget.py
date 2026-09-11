"""Conservative pre-execution charges; telemetry cannot release admitted spend."""
import uuid

from django.db import models


class BudgetAccount(models.Model):
    tenant_id = models.CharField(max_length=255, db_index=True)
    policy_id_ext = models.UUIDField()
    period = models.DateField()
    committed_usd = models.DecimalField(max_digits=20, decimal_places=8, default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['tenant_id', 'policy_id_ext', 'period'], name='unique_budget_account')]


class BudgetCharge(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    endpoint_id_ext = models.UUIDField()
    request_id = models.CharField(max_length=255)
    amount_usd = models.DecimalField(max_digits=20, decimal_places=8)
    account_ids = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    actual_usd = models.DecimalField(max_digits=20, decimal_places=8, null=True, blank=True)
    reconciled_at = models.DateTimeField(null=True, blank=True)
    reconciliation_source = models.CharField(max_length=64, blank=True, default='')
    pricing_version = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['tenant_id', 'endpoint_id_ext', 'request_id'], name='unique_budget_request')]
