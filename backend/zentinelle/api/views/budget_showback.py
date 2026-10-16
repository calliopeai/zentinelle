"""Trusted budget showback and anomaly reporting."""
from decimal import Decimal

from django.db.models import Count, Sum
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess
from zentinelle.models import BudgetCharge
from zentinelle.schema.auth_helpers import get_request_tenant_id


class BudgetShowbackView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def get(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        requested = request.GET.get('group_by', 'endpoint')
        dimensions = {
            'endpoint': 'endpoint_id_ext',
            'team': 'team_id_ext',
            'app': 'app_id_ext',
            'session': 'session_id_ext',
            'task': 'task_id_ext'}
        dimension = dimensions.get(requested, 'endpoint_id_ext')
        rows = BudgetCharge.objects.filter(
            tenant_id=tenant_id).values(dimension).annotate(
            requests=Count('id'),
            committed=Sum('amount_usd'),
            actual=Sum('actual_usd'),
        ).order_by('-committed')
        entries = []
        for row in rows:
            committed = row['committed'] or Decimal('0')
            actual = row['actual']
            actual_value = actual or Decimal('0')
            # Settled to an actual cost; a charge with only reported usage
            # on a budget that keeps its reservations is still unreconciled.
            unreconciled = BudgetCharge.objects.filter(tenant_id=tenant_id, **{dimension: row[dimension]},
                                                       reconciled_at__isnull=True).count()
            entries.append({
                'dimension': requested, 'dimension_id': str(row[dimension] or ''),
                'endpoint_id': str(row.get('endpoint_id_ext') or '') if dimension == 'endpoint_id_ext' else None,
                'requests': row['requests'],
                'committed_usd': float(committed), 'actual_usd': float(actual_value) if actual is not None else None,
                'unreconciled_requests': unreconciled,
                'anomaly': bool(actual is not None and actual_value > committed),
                'status': ('anomaly' if actual is not None and actual_value > committed else
                           'unreconciled' if unreconciled else 'reconciled'),
            })
        totals = BudgetCharge.objects.filter(
            tenant_id=tenant_id).aggregate(
            committed=Sum('amount_usd'),
            actual=Sum('actual_usd'))
        return Response({'entries': entries, 'totals': {
            'committed_usd': float(totals['committed'] or 0),
            'actual_usd': float(totals['actual']) if totals['actual'] is not None else None,
        }, 'source': 'budget-reconciliation'})
