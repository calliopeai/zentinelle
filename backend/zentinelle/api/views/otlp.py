"""OTLP/HTTP JSON receiver using the same authenticated event path (#378)."""
from rest_framework.parsers import JSONParser
from rest_framework.response import Response

from zentinelle.api.auth import get_endpoint_from_request
from zentinelle.api.views.events import EventsView
from zentinelle.services.otlp import trace_events


class OtlpTracesView(EventsView):
    parser_classes = [JSONParser]

    def post(self, request):
        response = self.ingest(get_endpoint_from_request(request), trace_events(request.data),
                               identity=getattr(request, 'verified_hub_identity', None))
        # OTLP's ExportTraceServiceResponse is an empty JSON object on success.
        if response.status_code == 202:
            return Response({})
        return response
