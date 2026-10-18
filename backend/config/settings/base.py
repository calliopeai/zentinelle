"""
Django settings for Zentinelle — base configuration.

All environment-specific overrides live in dev.py and prod.py.
"""

import os
from datetime import timedelta
from pathlib import Path

from django.utils.csp import CSP
from dotenv import load_dotenv

# Load zentinelle.yaml config file (env vars always win over file values).
# Must run before any settings variables are read.
from zentinelle.conf import load_config  # noqa: E402

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load .env from project root (one level above backend/)
_dotenv_path = BASE_DIR.parent / ".env"
if _dotenv_path.exists():
    load_dotenv(_dotenv_path)

# Also load .env from backend/ if present
_backend_dotenv = BASE_DIR / ".env"
if _backend_dotenv.exists():
    load_dotenv(_backend_dotenv)


load_config()

# =============================================================================
# Core
# =============================================================================

# An empty value (as .env.example ships) is the placeholder too, so the
# startup guard names it instead of Django failing on first use.
SECRET_KEY = os.environ.get("SECRET_KEY") or "change-me-in-production"

DEBUG = False

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]

ROOT_URLCONF = "config.urls"

WSGI_APPLICATION = "config.wsgi.application"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# =============================================================================
# Applications
# =============================================================================

INSTALLED_APPS = [
    # Django core
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    # Third-party
    "corsheaders",
    "rest_framework",
    "django_filters",
    # Zentinelle
    "zentinelle",
]

# =============================================================================
# Middleware
# =============================================================================

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "zentinelle.api.middleware.SessionIdleTimeoutMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
]

# Every backend response is JSON or the opt-in Django admin, so nothing loads
# from elsewhere, frames it, or posts it anywhere. dev.py drops it while
# debugging, for the GraphiQL IDE's CDN scripts.
SECURE_CSP = {
    "default-src": [CSP.SELF],
    "base-uri": [CSP.SELF],
    "form-action": [CSP.SELF],
    "frame-ancestors": [CSP.NONE],
    "object-src": [CSP.NONE],
}

# =============================================================================
# Templates
# =============================================================================

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# =============================================================================
# Database
# =============================================================================

# Parse DATABASE_URL or fall back to component env vars
_db_url = os.environ.get("DATABASE_URL", "")

if _db_url:
    # Simple URL parsing for postgresql://user:pass@host:port/dbname
    from urllib.parse import urlparse

    _parsed = urlparse(_db_url)
    _db_config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _parsed.path.lstrip("/"),
        "USER": _parsed.username or "",
        "PASSWORD": _parsed.password or "",
        "HOST": _parsed.hostname or "localhost",
        "PORT": str(_parsed.port or 5432),
    }
else:
    _db_config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "zentinelle"),
        "USER": os.environ.get("POSTGRES_USER", "zentinelle"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "zentinelle"),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }

# Connection reuse, for a scaled-out fleet behind RDS Proxy or PgBouncer. The
# default, 0, opens a connection per request as before. DB_CONN_MAX_AGE keeps
# each gunicorn worker's connection that many seconds, health-checked before
# reuse, so the fleet holds (tasks x workers x three aliases) connections and
# the pooler bounds what reaches the database. DB_DISABLE_SERVER_SIDE_CURSORS
# keeps .iterator() from declaring cursors, which pin a session in RDS Proxy
# and break PgBouncer transaction pooling. Each alias picks its schema with the
# libpq `options` startup parameter below, so a pooler must honour that: check
# one with the schema query in docs/scale-out.md before pointing DATABASE_URL
# at it.
_db_config["CONN_MAX_AGE"] = int(os.environ.get("DB_CONN_MAX_AGE", "0"))
_db_config["CONN_HEALTH_CHECKS"] = _db_config["CONN_MAX_AGE"] != 0
_db_config["DISABLE_SERVER_SIDE_CURSORS"] = (
    os.environ.get("DB_DISABLE_SERVER_SIDE_CURSORS", "false").lower() in ("1", "true", "yes")
)

DATABASES = {
    "default": {
        **_db_config,
        "OPTIONS": {"options": "-c search_path=public"},
    },
    "zentinelle": {
        **_db_config,
        "OPTIONS": {"options": "-c search_path=zentinelle"},
    },
    "analytics": {
        **_db_config,
        "OPTIONS": {"options": "-c search_path=zentinelle_analytics,zentinelle"},
    },
}

DATABASE_ROUTERS = ["zentinelle.db_router.ZentinelleRouter"]

# =============================================================================
# Cache (Redis)
# =============================================================================

_redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": _redis_url,
    },
}

# =============================================================================
# Auth
# =============================================================================

# Auth modes:
#   open       — no login required, everyone is admin (internal/dev deployments)
#   local      — built-in username/password with session cookies
#   sso        — OIDC/SAML via external provider (Google, Okta, Cognito, etc.)
#   standalone — alias for "local" (backward compat)
AUTH_MODE = os.environ.get("AUTH_MODE", "local").lower()
if AUTH_MODE not in {"open", "local", "standalone", "sso", "client_cove"}:
    raise ValueError("Invalid AUTH_MODE")

# Session-based auth (httpOnly cookies — immune to XSS)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 7  # 1 week, however active
# Signed out after this long without a request (SessionIdleTimeoutMiddleware).
SESSION_IDLE_TIMEOUT_SECONDS = int(os.environ.get("SESSION_IDLE_TIMEOUT_SECONDS", str(30 * 60)))
SESSION_COOKIE_NAME = "zentinelle_session"
CSRF_COOKIE_HTTPONLY = False  # frontend needs to read CSRF token
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CSRF_TRUSTED_ORIGINS", "http://localhost:3002").split(",")
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# =============================================================================
# Internationalization
# =============================================================================

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# =============================================================================
# Static files
# =============================================================================

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# =============================================================================
# CORS
# =============================================================================

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    h.strip()
    for h in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:3002").split(",")
    if h.strip()
]
CORS_ALLOW_CREDENTIALS = True

# =============================================================================
# Temporal
# =============================================================================

# One Temporal server is shared across Calliope AI apps; Zentinelle has its own
# namespace and task queue. The temporal_worker command is the only consumer:
# it runs every task as an activity and owns the schedules below. An empty
# TEMPORAL_ADDRESS makes enqueues a no-op (tests, or prod before Temporal
# exists; see prod.py).
TEMPORAL_ADDRESS = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
TEMPORAL_NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "zentinelle")
TEMPORAL_TASK_QUEUE = os.environ.get("TEMPORAL_TASK_QUEUE", "zentinelle")

# On SIGTERM the worker stops polling and its running activities get this long
# to finish before they are cut (a task with retries then runs again on another
# worker). 25 fits the 30 seconds ECS and compose give a container to stop;
# raise both together.
TEMPORAL_WORKER_DRAIN_SECONDS = int(os.environ.get("TEMPORAL_WORKER_DRAIN_SECONDS", "25"))
# How often the worker publishes its task queue's backlog for the autoscaler,
# as CloudWatch embedded metric format lines in TEMPORAL_BACKLOG_METRIC_NAMESPACE
# (zentinelle/temporal/backlog.py). 0 turns it off.
TEMPORAL_BACKLOG_METRIC_SECONDS = int(os.environ.get("TEMPORAL_BACKLOG_METRIC_SECONDS", "60"))
TEMPORAL_BACKLOG_METRIC_NAMESPACE = os.environ.get("TEMPORAL_BACKLOG_METRIC_NAMESPACE", "Zentinelle/Temporal")

# The schedule is the single source of truth for periodic work. The worker
# upserts every entry as a Temporal Schedule at start (schedule id = key) and
# deletes `zentinelle-` schedules that are no longer listed, so a redeploy never
# duplicates one and a second worker replica never splits the brain the way a
# second beat did. Overlapping runs are skipped (the Temporal default): a job
# still running when its next slot comes up does not get a twin. All cron
# expressions are UTC. Each entry has `task` plus `every` or `cron`.
TEMPORAL_SCHEDULES = {
    'zentinelle-dispatch-event-outbox': {
        'task': 'zentinelle.tasks.events.dispatch_event_outbox',
        'every': timedelta(minutes=1),
    },
    # Not in the beat schedule: request paths now start event processing
    # without waiting, so a start dropped during a Temporal outage leaves the
    # event PENDING, and this sweep is what picks it back up.
    'zentinelle-retry-failed-events': {
        'task': 'zentinelle.tasks.scheduled.retry_failed_events',
        'every': timedelta(minutes=5),
    },
    # Retention and registry
    'zentinelle-enforce-retention-policies': {
        'task': 'zentinelle.enforce_retention_policies',
        'cron': '0 1 * * *',
    },
    'zentinelle-sync-model-registry': {
        'task': 'zentinelle.sync_model_registry',
        'cron': '0 5 * * *',
    },
    'zentinelle-cleanup-old-events': {
        'task': 'zentinelle.tasks.scheduled.cleanup_old_events',
        'cron': '0 4 * * 0',
    },

    # Health
    'zentinelle-check-endpoint-health': {
        'task': 'zentinelle.tasks.scheduled.check_endpoint_health',
        'every': timedelta(minutes=15),
    },

    # Billing
    'zentinelle-send-usage-to-stripe': {
        'task': 'zentinelle.tasks.billing.send_usage_to_stripe',
        'cron': '0 * * * *',
    },
    # Cross-mode usage export to Calliope AI billing (#245). Every 15 minutes
    # rather than hourly: the batch is small and the receiver dedupes, so a
    # shorter interval mostly reduces how much usage is sitting unexported
    # when something goes wrong. No-ops entirely unless BILLING_EXPORT_ENABLED.
    'zentinelle-export-usage-to-billing': {
        'task': 'zentinelle.tasks.billing.export_usage_to_billing',
        'every': timedelta(minutes=15),
    },

    # License compliance
    'zentinelle-detect-license-violations': {
        'task': 'zentinelle.tasks.license_compliance.detect_license_violations_all_orgs',
        'cron': '0 2 * * *',
    },
    'zentinelle-auto-resolve-violations': {
        'task': 'zentinelle.tasks.license_compliance.auto_resolve_violations',
        'cron': '0 */6 * * *',
    },
    'zentinelle-weekly-compliance-summaries': {
        'task': 'zentinelle.tasks.license_compliance.generate_weekly_compliance_summaries',
        'cron': '0 6 * * 1',
    },
    'zentinelle-monthly-compliance-reports': {
        'task': 'zentinelle.tasks.license_compliance.generate_monthly_compliance_reports',
        'cron': '0 3 1 * *',
    },

    # Compliance monitoring
    'zentinelle-check-compliance-drift': {
        'task': 'zentinelle.tasks.compliance_monitoring.check_compliance_drift',
        'every': timedelta(hours=1),
    },
    'zentinelle-monitor-violation-rates': {
        'task': 'zentinelle.tasks.compliance_monitoring.monitor_violation_rates',
        'every': timedelta(minutes=30),
    },
    'zentinelle-check-policy-health': {
        'task': 'zentinelle.tasks.compliance_monitoring.check_policy_health',
        'every': timedelta(hours=6),
    },
    'zentinelle-detect-usage-anomalies': {
        'task': 'zentinelle.tasks.compliance_monitoring.detect_usage_anomalies',
        'every': timedelta(hours=1),
    },
}

# =============================================================================
# Encryption
# =============================================================================

ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")

# The longest an agent key that an Astrolift install mints for one of its
# tasks or boxes keeps working after its mint, however often it is renewed
# (#400). A run that needs longer gets a fresh key.
ASTROLIFT_AGENT_KEY_MAX_LIFETIME_SECONDS = int(
    os.environ.get("ASTROLIFT_AGENT_KEY_MAX_LIFETIME_SECONDS", str(7 * 24 * 3600))
)

# =============================================================================
# REST Framework
# =============================================================================

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    # How many reverse proxies in front of the backend append to
    # X-Forwarded-For (compose nginx: 1; an ALB to the task: 1; ALB plus
    # nginx: 2). Throttles take the client address that many entries from the
    # right. 0 trusts no header and uses the socket address; DRF's own
    # default (None) would trust whatever the client put in the header.
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "0")),
}

# Hosts an endpoint's config.hub_identity.api_url may name although they
# resolve to a private address (an in-cluster JupyterHub). Others must
# resolve to public addresses only (T13).
HUB_IDENTITY_ALLOWED_HOSTS = frozenset(
    h.strip().lower() for h in os.environ.get("HUB_IDENTITY_ALLOWED_HOSTS", "").split(",") if h.strip())

# Django admin is a second password login beside the portal, with none of
# the portal login's throttling. Off unless an operator turns it on.
ENABLE_DJANGO_ADMIN = os.environ.get("ENABLE_DJANGO_ADMIN", "false").lower() in ("1", "t", "true")

# =============================================================================
# Logging
# =============================================================================

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
        "zentinelle": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}

# ---------------------------------------------------------------------------
# Usage export to Calliope AI billing (#245)
#
# The BYOK / on-prem path: the customer runs Zentinelle over their own keys and
# infrastructure, and is billed for the governance control plane rather than for
# their tokens.
#
# Off by default, and that default is deliberate. A standalone or self-hosted
# deployment must not start posting its usage anywhere because it upgraded; an
# operator turns this on.
# ---------------------------------------------------------------------------
BILLING_EXPORT_ENABLED = os.environ.get(
    "BILLING_EXPORT_ENABLED", "false"
).lower() in ("1", "true", "yes")

# Where the batches go. The Client Cove billing ingest, which reconciles them
# into the same AIUsage ledger the Managed path feeds.
BILLING_EXPORT_URL = os.environ.get("BILLING_EXPORT_URL", "")
BILLING_EXPORT_TOKEN = os.environ.get("BILLING_EXPORT_TOKEN", "")
BILLING_EXPORT_TIMEOUT = int(os.environ.get("BILLING_EXPORT_TIMEOUT", "30"))

# governance_only: report counts, bill for the control plane, never mark up
#                  tokens the customer already paid their own provider for.
# resale:          the Managed path, where the tokens are ours to price.
#
# The default is the one that under-bills if wrong. Charging a BYOK customer
# for tokens they bought themselves is not a recoverable mistake.
BILLING_MODE = os.environ.get("BILLING_MODE", "governance_only")

# Where a standalone compose install's backend writes the local gateway's
# credential (#380): a volume the gateway also mounts. When the file is missing
# and its directory exists, the web process registers a gateway named `local`,
# scoped to the standalone tenant, and writes a fresh credential there. Every
# other gateway is registered by an operator (manage.py gateway_credential).
# Empty disables it. See zentinelle/auth/gateway_credential.py.
ZENTINELLE_GATEWAY_CREDENTIAL_FILE = os.environ.get(
    "ZENTINELLE_GATEWAY_CREDENTIAL_FILE", "/var/run/zentinelle/gateway-credential")

# The Django proxy injects the install's env provider keys (MANAGED_*, then
# OPENAI/ANTHROPIC/GOOGLE_API_KEY) for a tenant with no stored LLMProviderKey
# only when this is set. Single-tenant only: an env key is one account's key,
# and every tenant without a stored key would run on it. The gateway reads the
# same variable for its own env keys.
ALLOW_ENV_PROVIDER_KEYS = os.environ.get(
    "ALLOW_ENV_PROVIDER_KEYS", "false"
).lower() in ("1", "t", "true")

# Metadata-only by default; full prompt capture requires an explicit operator choice.
CONTENT_CAPTURE_MODE = os.environ.get("CONTENT_CAPTURE_MODE", "metadata").lower()
AUDIT_CHECKPOINT_SIGNING_KEY = os.environ.get("AUDIT_CHECKPOINT_SIGNING_KEY", SECRET_KEY)

# The portal assistant is a Zentinelle support surface, not a general-purpose
# chatbot. Product-level scope is enforced before a provider call; tenants can
# add terms through their ai_guardrail policy without weakening injection checks.
ASSISTANT_ALLOWED_TOPICS = tuple(
    term.strip() for term in os.environ.get('ASSISTANT_ALLOWED_TOPICS', '').split(',')
    if term.strip()
)
