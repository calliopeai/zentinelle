"""Durable policy actions, delivered over the minting install's channel."""
import uuid

from django.db import models


class AstroliftEnforcement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    install = models.ForeignKey('zentinelle.AstroliftInstall', on_delete=models.PROTECT)
    endpoint = models.ForeignKey('zentinelle.AgentEndpoint', on_delete=models.PROTECT)
    evidence_id = models.CharField(max_length=255)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default='pending')
    outcome = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'zentinelle'
        constraints = [models.UniqueConstraint(fields=['tenant_id', 'install', 'evidence_id'],
                                               name='unique_astrolift_enforcement_evidence')]
