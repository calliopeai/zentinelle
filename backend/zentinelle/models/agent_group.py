import uuid
from django.db import models


class AgentGroup(models.Model):
    class Tier(models.TextChoices):
        STANDARD = 'standard', 'Standard'
        RESTRICTED = 'restricted', 'Restricted'   # stricter: block mode default
        TRUSTED = 'trusted', 'Trusted'             # relaxed: audit mode default

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant_id = models.CharField(max_length=255, db_index=True)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    description = models.TextField(blank=True)
    tier = models.CharField(max_length=20, choices=Tier.choices, default=Tier.STANDARD)
    color = models.CharField(max_length=20, default='brand')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'zentinelle'
        unique_together = [('tenant_id', 'slug')]
        ordering = ['name']
