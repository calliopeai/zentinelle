"""
Production settings for Zentinelle.
"""

import os

from .base import *  # noqa: F401, F403

DEBUG = False

# In production, SECRET_KEY must be set via environment
if SECRET_KEY == "change-me-in-production":  # noqa: F405
    raise ValueError("SECRET_KEY must be set in production")

# HTTPS settings
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "true").lower() == "true"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# CORS: restrict in production
CORS_ALLOW_ALL_ORIGINS = False
