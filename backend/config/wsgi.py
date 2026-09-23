"""
WSGI config for Zentinelle.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

from zentinelle.auth.gateway_token import gateway_token

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()

# Mint the gateway token now rather than on the first lookup: the gateway
# reads it when it starts, and would otherwise wait for a file nobody has
# written yet (#380).
gateway_token()
