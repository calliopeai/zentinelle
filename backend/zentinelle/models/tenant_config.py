"""
TenantConfig — per-tenant settings store.

Holds org name and the settings JSON blob (notifications, agent defaults, etc.).
One row per tenant; created on first write with get_or_create.
"""
from django.db import models


class TenantConfig(models.Model):
    tenant_id = models.CharField(max_length=255, primary_key=True)
    name = models.CharField(max_length=255, default="My Organization")
    settings = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "zentinelle"
        db_table = "zentinelle_tenant_config"

    def get_setting(self, key, default=None):
        return self.settings.get(key, default)

    def __str__(self):
        return f"TenantConfig({self.tenant_id})"
