"""Tenant-scoped telemetry delivery health and lag metrics."""
from django.db.models import Count, Min
from django.http import JsonResponse
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAdminAccess
from zentinelle.models import Event, EventDeliveryOutbox
from zentinelle.schema.auth_helpers import get_request_tenant_id


class TelemetryDeliveryHealthView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def get(self, request):
        tenant_id = get_request_tenant_id(request.user) or ''
        events = Event.objects.filter(tenant_id=tenant_id)
        outbox = EventDeliveryOutbox.objects.filter(tenant_id=tenant_id)
        event_counts = {
            row['status']: row['count']
            for row in events.values('status').annotate(count=Count('id'))
        }
        outbox_counts = {
            row['status']: row['count']
            for row in outbox.values('status').annotate(count=Count('id'))
        }
        oldest = outbox.filter(
            status__in=(EventDeliveryOutbox.Status.PENDING, EventDeliveryOutbox.Status.QUEUED),
        ).aggregate(oldest=Min('created_at'))['oldest']
        return JsonResponse({
            'tenant_id': tenant_id,
            'events': event_counts,
            'delivery': {
                'outbox': outbox_counts,
                'pending': outbox_counts.get(EventDeliveryOutbox.Status.PENDING, 0),
                'queued': outbox_counts.get(EventDeliveryOutbox.Status.QUEUED, 0),
                'delivered': outbox_counts.get(EventDeliveryOutbox.Status.DELIVERED, 0),
                'dead_letter': outbox_counts.get(EventDeliveryOutbox.Status.DEAD_LETTER, 0),
                'oldest_pending_at': oldest.isoformat() if oldest else None,
                'bounded_capacity': 10000,
            },
        })
