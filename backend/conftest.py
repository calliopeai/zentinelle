"""
conftest.py — pytest-django test configuration.

Flattens the multi-schema database routing so all models land in the
default test database with public search_path. Without this, the
ZentinelleRouter sends zentinelle models to a 'zentinelle' DB alias
with its own schema, which prevents the test runner from creating
tables in the right place.
"""
import django.conf


def pytest_configure(config):
    """Override DATABASES to use a single search_path and no router for tests."""
    settings = django.conf.settings

    # Flatten all schemas into public so the test runner creates all tables
    # in one test database.
    if hasattr(settings, 'DATABASES'):
        for alias in list(settings.DATABASES):
            db = settings.DATABASES[alias]
            if 'OPTIONS' in db and 'options' in db['OPTIONS']:
                db['OPTIONS']['options'] = '-c search_path=public'
            # Mirror non-default aliases to default so Django uses one test DB
            if alias != 'default':
                db.setdefault('TEST', {})['MIRROR'] = 'default'

    # Disable the DB router so all models go to 'default'
    settings.DATABASE_ROUTERS = []

    # Use in-memory cache for tests (avoid Redis dependency)
    settings.CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'zentinelle-test',
        }
    }
