"""
Development settings for Zentinelle.
"""

from .base import *  # noqa: F401, F403

DEBUG = True

ALLOWED_HOSTS = ["*"]

# In development, allow all CORS origins
CORS_ALLOW_ALL_ORIGINS = True

# Use in-memory cache if Redis is not available
# Override by setting REDIS_URL in your .env
CACHES.setdefault("default", {  # noqa: F405
    "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
})
