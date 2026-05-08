"""
Production settings for Zentinelle.

Required env vars:
- SECRET_KEY              — Django session/CSRF signing key
- ZENTINELLE_SECRET_KEY   — Fernet key for encrypting LLM provider API keys
- ALLOWED_HOSTS           — comma-separated list of allowed hostnames
- DATABASE_URL            — postgres connection string

Optional but recommended:
- CORS_ALLOWED_ORIGINS    — comma-separated list (default: empty, lockdown)
- SECURE_SSL_REDIRECT     — default true; set false behind a TLS-terminating LB
- ZENTINELLE_BOOTSTRAP_SECRET — for HMAC bootstrap tokens
"""

import os

from .base import *  # noqa: F401, F403

DEBUG = False

# ──────────────────────────────────────────────────────────────────────────
# Required production secrets
# ──────────────────────────────────────────────────────────────────────────

if SECRET_KEY == "change-me-in-production":  # noqa: F405
    raise ValueError(
        "SECRET_KEY must be set in production. "
        "Generate one: python -c \"from django.core.management.utils import "
        "get_random_secret_key; print(get_random_secret_key())\""
    )

if not os.environ.get("ZENTINELLE_SECRET_KEY"):
    raise ValueError(
        "ZENTINELLE_SECRET_KEY must be set in production for LLM key "
        "encryption. Generate: python -c \"from cryptography.fernet "
        "import Fernet; print(Fernet.generate_key().decode())\""
    )

if not os.environ.get("ZENTINELLE_BOOTSTRAP_SECRET"):
    raise ValueError(
        "ZENTINELLE_BOOTSTRAP_SECRET must be set in production for "
        "agent bootstrap tokens. Generate: python -c \"import secrets; "
        "print(secrets.token_hex(32))\""
    )

# ──────────────────────────────────────────────────────────────────────────
# Hostnames — must be explicit in production
# ──────────────────────────────────────────────────────────────────────────

_allowed = os.environ.get("ALLOWED_HOSTS", "").strip()
if not _allowed:
    raise ValueError(
        "ALLOWED_HOSTS must be set in production "
        "(comma-separated list, e.g. 'zentinelle.example.com,api.example.com')"
    )
ALLOWED_HOSTS = [h.strip() for h in _allowed.split(",") if h.strip()]

# ──────────────────────────────────────────────────────────────────────────
# HTTPS / Security headers
# ──────────────────────────────────────────────────────────────────────────

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "true").lower() == "true"
SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "31536000"))  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"

# ──────────────────────────────────────────────────────────────────────────
# CORS — explicit allowlist in production
# ──────────────────────────────────────────────────────────────────────────

CORS_ALLOW_ALL_ORIGINS = False
_cors = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors.split(",") if o.strip()]
CORS_ALLOW_CREDENTIALS = True

# ──────────────────────────────────────────────────────────────────────────
# Auth mode — must NOT be 'open' in production
# ──────────────────────────────────────────────────────────────────────────

if AUTH_MODE == "open":  # noqa: F405
    raise ValueError(
        "AUTH_MODE=open is not allowed in production. "
        "Set AUTH_MODE to 'local' (built-in auth) or 'sso' (OIDC/SAML)."
    )

# ──────────────────────────────────────────────────────────────────────────
# Logging — JSON to stderr, INFO level
# ──────────────────────────────────────────────────────────────────────────

LOGGING.setdefault("loggers", {})["zentinelle"] = {  # noqa: F405
    "handlers": ["console"],
    "level": os.environ.get("LOG_LEVEL", "INFO"),
    "propagate": False,
}
