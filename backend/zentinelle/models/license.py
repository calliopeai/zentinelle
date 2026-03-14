"""
Zentinelle License and Agent Entitlement models.

Standalone licensing models for the Zentinelle service,
decoupled from client-cove organization models.
"""
from django.db import models


class ZentinelleLicense(models.Model):
    tenant_id = models.CharField(max_length=255, db_index=True)
    agent_entitlement_count = models.IntegerField(default=0)
    features = models.JSONField(default=dict)
    valid_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "zentinelle"

    def __str__(self):
        return f"ZentinelleLicense tenant={self.tenant_id}"


class AgentEntitlement(models.Model):
    agent_endpoint = models.ForeignKey(
        "zentinelle.AgentEndpoint",
        on_delete=models.CASCADE,
        related_name="entitlements",
    )
    is_licensed = models.BooleanField(default=False)
    restrictions = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "zentinelle"

    def __str__(self):
        return f"AgentEntitlement endpoint={self.agent_endpoint_id} licensed={self.is_licensed}"
