"""
Development settings for Zentinelle.
"""

from .base import *  # noqa: F401, F403

DEBUG = True

ALLOWED_HOSTS = ["*"]

# In development, allow localhost origins with credentials
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3002",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_CREDENTIALS = True

# Use in-memory cache if Redis is not available
# Override by setting REDIS_URL in your .env
CACHES.setdefault("default", {  # noqa: F405
    "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
})
