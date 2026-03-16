"""
Django settings for Zentinelle — base configuration.

All environment-specific overrides live in dev.py and prod.py.
"""

import os
from pathlib import Path

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

AUTH_MODE = os.environ.get("AUTH_MODE", "standalone")

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

CELERY_TASK_ROUTES = {
    "zentinelle.tasks.*": {"queue": "zentinelle-events"},
    "zentinelle.services.*": {"queue": "zentinelle-events"},
}

CELERY_BEAT_SCHEDULE = {
    'zentinelle-enforce-retention-policies': {
        'task': 'zentinelle.enforce_retention_policies',
        'schedule': 86400,  # once per day (24 hours in seconds)
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
