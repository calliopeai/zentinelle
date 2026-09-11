"""Operator canary for the same model-route admission guard used at runtime."""
import uuid

from django.db import transaction
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
        from zentinelle.models import ModelRouteCanary
        from zentinelle.services.llm_provider import _check_model_route
        trace_id = str(uuid.uuid4())
        try:
            _check_model_route(model, provider, tenant_id)
            allowed = True
            reason = 'Route admission checks passed'
        except RuntimeError as exc:
            allowed = False
            reason = str(exc)
        record = ModelRouteCanary.objects.create(
            tenant_id=tenant_id, provider=provider, model=model,
            status=ModelRouteCanary.Status.PASSED if allowed else ModelRouteCanary.Status.FAILED,
            reason=reason, baseline=payload.get('baseline', {}) if isinstance(payload.get('baseline', {}), dict) else {},
            evidence={'side_effects': False, 'trace_id': trace_id}, actor_id=str(getattr(request.user, 'pk', '') or ''),
        )
        try:
            from zentinelle.models import AuditLog
            AuditLog.log(tenant_id=tenant_id, action='model_route.canary',
                         resource_type='model_route', resource_id=f'{provider}/{model}',
                         ext_user_id=str(getattr(request.user, 'pk', '') or ''),
                         changes={'decision': 'allow' if allowed else 'deny'},
                         metadata={'provider': provider, 'model': model, 'canary': True, 'trace_id': trace_id})
        except Exception:
            pass
        return Response({'id': str(record.id), 'provider': provider, 'model': model, 'allowed': allowed,
                         'decision': 'allow' if allowed else 'deny', 'reason': reason,
                         'side_effects': False, 'rollback_required': not allowed, 'trace_id': trace_id})

    def get(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        from zentinelle.models import ModelRouteCanary
        rows = ModelRouteCanary.objects.filter(tenant_id=tenant_id)[:50]
        return Response({'results': [{'id': str(row.id), 'provider': row.provider, 'model': row.model,
                                      'status': row.status, 'reason': row.reason, 'baseline': row.baseline,
                                      'evidence': row.evidence, 'created_at': row.created_at.isoformat()}
                                     for row in rows]})


class ModelRouteCanaryRollbackView(APIView):
    """Record an operator rollback decision for a route canary."""
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def post(self, request, canary_id):
        tenant_id = get_request_tenant_id(request.user) or ''
        from zentinelle.models import ModelRouteCanary
        try:
            with transaction.atomic():
                record = ModelRouteCanary.objects.select_for_update().get(id=canary_id, tenant_id=tenant_id)
                if record.status == ModelRouteCanary.Status.ROLLED_BACK:
                    return Response({'error': 'Canary is already rolled back'}, status=409)
                actor = str(getattr(request.user, 'pk', '') or '')
                record.status = ModelRouteCanary.Status.ROLLED_BACK
                record.evidence = {**(record.evidence or {}), 'rollback': {'actor_id': actor}}
                record.save(update_fields=['status', 'evidence'])
        except ModelRouteCanary.DoesNotExist:
            return Response({'error': 'Canary not found'}, status=404)
        try:
            from zentinelle.models import AuditLog
            AuditLog.log(tenant_id=tenant_id, action='model_route.rollback',
                         resource_type='model_route_canary', resource_id=str(record.id),
                         ext_user_id=actor,
                         changes={'provider': record.provider, 'model': record.model,
                                  'status': record.status})
        except Exception:
            pass
        return Response({'id': str(record.id), 'provider': record.provider, 'model': record.model,
                         'status': record.status, 'rollback': True, 'evidence': record.evidence})
