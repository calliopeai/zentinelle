"""
Astrolift integration routes.

Mounted at /integrations/ rather than under /api/zentinelle/v1/ because the
target URL is fixed on the Astrolift side: its subscription template ships
`https://{zentinelle_url}/integrations/astrolift/v1/audit`. Changing the prefix
here would require a matching change there, so the namespace follows the
already-published contract.
"""
from django.urls import path

from zentinelle.integrations.astrolift_audit import astrolift_audit_webhook

urlpatterns = [
    path("astrolift/v1/audit", astrolift_audit_webhook, name="astrolift-audit"),
]
