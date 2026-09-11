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
        rows = BudgetCharge.objects.filter(tenant_id=tenant_id).values('endpoint_id_ext').annotate(
            requests=Count('id'), committed=Sum('amount_usd'), actual=Sum('actual_usd'),
        ).order_by('-committed')
        entries = []
        for row in rows:
            committed = row['committed'] or Decimal('0')
            actual = row['actual']
            unresolved = actual is None
            actual_value = actual or Decimal('0')
            entries.append({
                'endpoint_id': str(row['endpoint_id_ext']), 'requests': row['requests'],
                'committed_usd': float(committed), 'actual_usd': float(actual_value) if actual is not None else None,
                'unreconciled_requests': BudgetCharge.objects.filter(tenant_id=tenant_id,
                    endpoint_id_ext=row['endpoint_id_ext'], actual_usd__isnull=True).count(),
                'anomaly': bool(actual is not None and actual_value > committed),
                'status': 'unreconciled' if unresolved else ('anomaly' if actual_value > committed else 'reconciled'),
            })
        totals = BudgetCharge.objects.filter(tenant_id=tenant_id).aggregate(committed=Sum('amount_usd'), actual=Sum('actual_usd'))
        return Response({'entries': entries, 'totals': {
            'committed_usd': float(totals['committed'] or 0),
            'actual_usd': float(totals['actual']) if totals['actual'] is not None else None,
        }, 'source': 'trusted-provider-api-reconciliation'})
