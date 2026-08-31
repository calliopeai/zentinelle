"""
Django settings for Zentinelle — base configuration.

All environment-specific overrides live in dev.py and prod.py.
"""

import os
from datetime import timedelta
from pathlib import Path

from celery.schedules import crontab
from dotenv import load_dotenv

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

# Load zentinelle.yaml config file (env vars always win over file values).
# Must run before any settings variables are read.
from zentinelle.conf import load_config  # noqa: E402

load_config()

# =============================================================================
# Core
# =============================================================================

SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")

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
    "graphene_django",
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
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

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
AUTH_MODE = os.environ.get("AUTH_MODE", "open")

# Session-based auth (httpOnly cookies — immune to XSS)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 7  # 1 week
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
# GraphQL (Graphene)
# =============================================================================

GRAPHENE = {
    "SCHEMA": "zentinelle.schema.schema",
}

# =============================================================================
# Celery
# =============================================================================

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 60 * 60  # 1 hour
CELERY_TIMEZONE = "UTC"
CELERY_TASK_ALWAYS_EAGER = False

# Every task runs on the default queue, which is the queue the worker services
# consume. Do not add task routes without also giving the workers a matching
# -Q, or the routed tasks are enqueued and never picked up.

# The beat schedule is the single source of truth for periodic work. Beat runs
# with the default scheduler, so this dict is the schedule; there is no
# database scheduler and no seeding step.
#
# This is where Temporal Schedules will replace beat when the time comes
# (#264, recorded in bootstrap.md). Beat is desired_count = 1 by construction:
# if it dies, every job below silently stops, and raising the count splits the
# brain. Its last-run state lives on an ephemeral Fargate filesystem, so a
# restart can re-fire or skip — which is survivable today only because these
# tasks happen to be idempotent, and that is a property to keep deliberately
# rather than by luck.
#
# The event drain does NOT move: tasks.events and tasks.clickhouse_sync are
# high-volume and stateless, and a durable-execution engine is the wrong tool
# for a message queue.
CELERY_BEAT_SCHEDULE = {
    # Retention and registry
    'zentinelle-enforce-retention-policies': {
        'task': 'zentinelle.enforce_retention_policies',
        'schedule': crontab(hour=1, minute=0),
    },
    'zentinelle-sync-model-registry': {
        'task': 'zentinelle.sync_model_registry',
        'schedule': crontab(hour=5, minute=0),
    },
    'zentinelle-cleanup-old-events': {
        'task': 'zentinelle.tasks.scheduled.cleanup_old_events',
        'schedule': crontab(hour=4, minute=0, day_of_week='sunday'),
    },

    # Health
    'zentinelle-check-endpoint-health': {
        'task': 'zentinelle.tasks.scheduled.check_endpoint_health',
        'schedule': timedelta(minutes=15),
    },

    # Billing
    'zentinelle-send-usage-to-stripe': {
        'task': 'zentinelle.tasks.billing.send_usage_to_stripe',
        'schedule': crontab(minute=0),
    },
    # Cross-mode usage export to Calliope AI billing (#245). Every 15 minutes
    # rather than hourly: the batch is small and the receiver dedupes, so a
    # shorter interval mostly reduces how much usage is sitting unexported
    # when something goes wrong. No-ops entirely unless BILLING_EXPORT_ENABLED.
    'zentinelle-export-usage-to-billing': {
        'task': 'zentinelle.tasks.billing.export_usage_to_billing',
        'schedule': timedelta(minutes=15),
    },

    # License compliance
    'zentinelle-detect-license-violations': {
        'task': 'zentinelle.tasks.license_compliance.detect_license_violations_all_orgs',
        'schedule': crontab(hour=2, minute=0),
    },
    'zentinelle-auto-resolve-violations': {
        'task': 'zentinelle.tasks.license_compliance.auto_resolve_violations',
        'schedule': crontab(minute=0, hour='*/6'),
    },
    'zentinelle-weekly-compliance-summaries': {
        'task': 'zentinelle.tasks.license_compliance.generate_weekly_compliance_summaries',
        'schedule': crontab(hour=6, minute=0, day_of_week='monday'),
    },
    'zentinelle-monthly-compliance-reports': {
        'task': 'zentinelle.tasks.license_compliance.generate_monthly_compliance_reports',
        'schedule': crontab(hour=3, minute=0, day_of_month='1'),
    },

    # Compliance monitoring
    'zentinelle-check-compliance-drift': {
        'task': 'zentinelle.tasks.compliance_monitoring.check_compliance_drift',
        'schedule': timedelta(hours=1),
    },
    'zentinelle-monitor-violation-rates': {
        'task': 'zentinelle.tasks.compliance_monitoring.monitor_violation_rates',
        'schedule': timedelta(minutes=30),
    },
    'zentinelle-check-policy-health': {
        'task': 'zentinelle.tasks.compliance_monitoring.check_policy_health',
        'schedule': timedelta(hours=6),
    },
    'zentinelle-detect-usage-anomalies': {
        'task': 'zentinelle.tasks.compliance_monitoring.detect_usage_anomalies',
        'schedule': timedelta(hours=1),
    },
}

# =============================================================================
# Encryption
# =============================================================================

ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY", "")

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
}

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
