"""Operator canary for the same model-route admission guard used at runtime."""
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAdminAccess
from zentinelle.schema.auth_helpers import get_request_tenant_id


class ModelRouteCanaryView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def post(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        payload = request.data if isinstance(request.data, dict) else {}
        provider = str(payload.get('provider', '')).strip().lower()
        model = str(payload.get('model', '')).strip()
        if not provider or not model or len(provider) > 64 or len(model) > 128:
            return Response({'error': 'provider and model are required bounded strings'}, status=400)
        from zentinelle.services.llm_provider import _check_model_route
        try:
            _check_model_route(model, provider, tenant_id)
            allowed = True
            reason = 'Route admission checks passed'
        except RuntimeError as exc:
            allowed = False
            reason = str(exc)
        try:
            from zentinelle.models import AuditLog
            AuditLog.log(tenant_id=tenant_id, action='model_route.canary',
                         resource_type='model_route', resource_id=f'{provider}/{model}',
                         ext_user_id=str(getattr(request.user, 'pk', '') or ''),
                         changes={'decision': 'allow' if allowed else 'deny'},
                         metadata={'provider': provider, 'model': model, 'canary': True})
        except Exception:
            pass
        return Response({'provider': provider, 'model': model, 'allowed': allowed,
                         'decision': 'allow' if allowed else 'deny', 'reason': reason,
                         'side_effects': False, 'rollback_required': not allowed})
