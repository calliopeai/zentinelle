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

# On ECS, the load balancer health-checks a task by its own private IP, so the
# Host header on that request is an address and never the deployment's
# hostname. Django rejects it with 400 DisallowedHost before any view runs, the
# target group reports Target.ResponseCodeMismatch, and the task is killed and
# replaced — forever, while the same endpoint answers 200 through the load
# balancer. The first Zentinelle install died exactly there.
#
# So the task's own address is added to ALLOWED_HOSTS, read from the metadata
# endpoint every ECS task has. This is narrow on purpose: one address, this
# task's, discovered rather than configured. The alternative on offer was
# ALLOWED_HOSTS = ["*"], which turns off Host validation for every deployment
# to satisfy a health check.
#
# Failures here are swallowed deliberately. Outside ECS the variable is absent
# and nothing happens; inside it, a metadata endpoint that is slow or missing
# must not stop the application from booting, because the only thing lost is a
# health check that was already failing.
_metadata_url = os.environ.get("ECS_CONTAINER_METADATA_URI_V4") or os.environ.get(
    "ECS_CONTAINER_METADATA_URI"
)
if _metadata_url:
    try:
        import json
        import urllib.request

        with urllib.request.urlopen(_metadata_url, timeout=2) as _response:  # noqa: S310
            _networks = json.load(_response).get("Networks") or []
        for _network in _networks:
            for _address in _network.get("IPv4Addresses") or []:
                if _address and _address not in ALLOWED_HOSTS:
                    ALLOWED_HOSTS.append(_address)
    except Exception:  # noqa: BLE001 - see above: booting matters more
        pass

# ──────────────────────────────────────────────────────────────────────────
# HTTPS / Security headers
# ──────────────────────────────────────────────────────────────────────────

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "true").lower() == "true"

# The health and readiness probes are exempt from that redirect, because the
# thing performing them speaks plain HTTP to the container and cannot follow a
# 301. A load balancer health check carries no X-Forwarded-Proto — it is not
# proxying anything, it is asking the container directly — so SECURE_SSL_REDIRECT
# answered it 301, the target group scored that as a failure, and ECS replaced
# the task on a loop. Kubernetes liveness and readiness probes behave the same
# way, so this is not one platform's quirk.
#
# Exempting these two paths costs nothing: they carry no credentials, set no
# cookies, and return no tenant data. Every other path still redirects, and real
# traffic arrives through the load balancer with X-Forwarded-Proto set, so it is
# never redirected in the first place.
#
# Matched without the leading slash, which is what SecurityMiddleware compares
# against.
SECURE_REDIRECT_EXEMPT = [
    r"^api/zentinelle/v1/health$",
    r"^api/zentinelle/v1/ready$",
]
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
