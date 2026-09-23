"""
WSGI config for Zentinelle.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

from zentinelle.auth.gateway_credential import ensure_local_gateway_credential

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()

# A standalone compose install's gateway reads its credential from a shared
# volume when it starts, so the backend writes it here rather than on demand
# (#380). Anywhere without that volume this does nothing.
ensure_local_gateway_credential()
