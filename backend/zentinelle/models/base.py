"""
Base model classes for Zentinelle standalone service.

Replaces client-cove's core.models.common.Tracking with a standalone
abstract base model that provides created_at/updated_at timestamps
without requiring external FK dependencies (AUTH_USER_MODEL, etc.).
"""

from django.db import models


class Tracking(models.Model):
    """
    Abstract base model with version tracking and timestamps.

    Standalone equivalent of client-cove's core.models.common.Tracking.
    Removed FK dependencies on AUTH_USER_MODEL (created_by, updated_by,
    deleted_by) since those don't exist in standalone mode.
    """

    class Meta:
        abstract = True

    version = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        self.version = self.version + 1
        super().save(*args, **kwargs)
