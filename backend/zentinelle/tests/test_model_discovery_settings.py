from django.test import TestCase

from zentinelle.models import TenantConfig
from zentinelle.services.llm_model_discovery import _cache_ttl_seconds


class ModelDiscoverySettingsTests(TestCase):
    def test_tenant_refresh_interval_controls_cache_ttl(self):
        TenantConfig.objects.create(tenant_id='tenant-a', settings={'discovery_refresh_seconds': 900})
        self.assertEqual(_cache_ttl_seconds('tenant-a'), 900)

    def test_invalid_refresh_interval_uses_safe_default(self):
        TenantConfig.objects.create(tenant_id='tenant-a', settings={'discovery_refresh_seconds': 1})
        self.assertEqual(_cache_ttl_seconds('tenant-a'), 3600)
