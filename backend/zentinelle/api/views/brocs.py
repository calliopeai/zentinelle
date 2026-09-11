"""BROCS diagnostic mapping with tenant evidence attachment."""
import json
from pathlib import Path

from django.conf import settings
from django.http import JsonResponse
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAdminAccess
from zentinelle.models import ControlEvidence
from zentinelle.schema.auth_helpers import get_request_tenant_id


class BrocsControlMapView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def get(self, request):
        path = Path(settings.BASE_DIR).parent / 'docs' / 'brocs-control-map.json'
        mapping = json.loads(path.read_text(encoding='utf-8'))
        tenant_id = get_request_tenant_id(request.user) or ''
        for domain in mapping.get('domains', []):
            evidence = ControlEvidence.objects.filter(tenant_id=tenant_id, control_id=domain['id']).first()
            domain['evidence_status'] = evidence.effective_status if evidence else 'unknown'
            domain['evidence_id'] = str(evidence.id) if evidence else None
            domain['evidence_captured_at'] = evidence.captured_at.isoformat() if evidence else None
        return JsonResponse(mapping)
