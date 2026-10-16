"""
Development settings for Zentinelle.
"""

import os

from .base import *  # noqa: F401, F403

# DEBUG follows the environment: compose sets DEBUG=false unless asked, and
# a bare `manage.py runserver` still debugs. Only a debugging process
# accepts any Host; otherwise ALLOWED_HOSTS from the environment, plus the
# compose service name the gateway and frontend call the backend by.
DEBUG = os.environ.get("DEBUG", "true").strip().lower() in ("1", "true", "yes")

ALLOWED_HOSTS = ["*"] if DEBUG else [*ALLOWED_HOSTS, "backend"]  # noqa: F405

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
