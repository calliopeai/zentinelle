"""Structured MITRE ATLAS control mappings for the portal threat view."""
import json
from pathlib import Path

from django.conf import settings
from django.http import JsonResponse
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAdminAccess
from zentinelle.models import ControlEvidence
from zentinelle.schema.auth_helpers import get_request_tenant_id


class AtlasControlMapView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def get(self, request):
        mapping_path = Path(settings.BASE_DIR).parent / 'docs' / 'atlas-guardrails.json'
        with mapping_path.open(encoding='utf-8') as source:
            mapping = json.load(source)
        tenant_id = get_request_tenant_id(request.user) or ''
        for technique in mapping.get('techniques', []):
            control_id = technique.get('id') or technique['name']
            evidence = ControlEvidence.objects.filter(
                tenant_id=tenant_id, control_id=control_id,
            ).first()
            technique['evidence_status'] = evidence.effective_status if evidence else 'unverified'
            technique['evidence_captured_at'] = evidence.captured_at.isoformat() if evidence else None
            technique['evidence_id'] = str(evidence.id) if evidence else None
        return JsonResponse(mapping)
