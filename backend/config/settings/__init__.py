from .base import *  # noqa: F401, F403

# Import environment-specific overrides based on DJANGO_SETTINGS_MODULE.
# When DJANGO_SETTINGS_MODULE is "config.settings" (default), this file
# loads base settings. For dev or prod, set DJANGO_SETTINGS_MODULE to
# "config.settings.dev" or "config.settings.prod" respectively.
