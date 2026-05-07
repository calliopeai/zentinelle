"""
Platform health and readiness endpoints for Kubernetes probes.

GET /api/zentinelle/v1/health  — liveness (process alive)
GET /api/zentinelle/v1/ready   — readiness (DB + Redis connected)
"""
from django.http import JsonResponse
from django.views import View


class HealthView(View):
    def get(self, request):
        return JsonResponse({'status': 'ok'})


class ReadyView(View):
    def get(self, request):
        checks = {}

        try:
            from django.db import connections
            conn = connections['zentinelle']
            conn.ensure_connection()
            checks['database'] = 'ok'
        except Exception as e:
            checks['database'] = str(e)

        try:
            from django.core.cache import cache
            cache.set('_ready_check', '1', timeout=5)
            val = cache.get('_ready_check')
            checks['cache'] = 'ok' if val == '1' else 'miss'
        except Exception as e:
            checks['cache'] = str(e)

        all_ok = all(v == 'ok' for v in checks.values())
        return JsonResponse(
            {'status': 'ok' if all_ok else 'degraded', 'checks': checks},
            status=200 if all_ok else 503,
        )
