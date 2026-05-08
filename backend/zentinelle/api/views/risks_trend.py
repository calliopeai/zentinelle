"""
Risk index trend endpoint.

GET /api/zentinelle/v1/risks/trend?days=30

Returns the historical risk index for the authenticated tenant over the
last N days, computed from the current state of the risk register.

The risk index is a 0-100 normalized aggregate of FMEA risk scores
(severity x likelihood x impact) across all open risks. The maximum
risk score per risk is 8*8*8 = 512.

A risk is considered "open" on a given day when:
    - it was created on or before that day, AND
    - either its status is not 'closed', OR its last update was after that day.

The Risk model does not currently track an explicit closed-at timestamp;
``updated_at`` is the closest available proxy for the closure transition.
"""
import logging
from datetime import timedelta

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from zentinelle.api.permissions import OpenOrAgentAuth, PORTAL_OR_AGENT_AUTH
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import (
    ZentinelleAPIKeyAuthentication,
    get_tenant_id_from_request,
)
from zentinelle.models.risk import Risk

logger = logging.getLogger(__name__)


# Maximum FMEA risk score per risk: severity (8) * likelihood (8) * impact (8).
MAX_RISK_SCORE_PER_RISK = 8 * 8 * 8

DEFAULT_TREND_DAYS = 30
MIN_TREND_DAYS = 1
MAX_TREND_DAYS = 365


class RiskTrendView(APIView):
    """
    Return the historical risk index for the authenticated tenant.

    GET /api/zentinelle/v1/risks/trend?days=30

    Query params:
        days    Optional. Number of days to include, clamped to [1, 365].
                Default: 30.

    Response:
        {
            "trend": [
                {"day": "2026-04-08", "index": 0,  "open_count": 0},
                {"day": "2026-04-09", "index": 42, "open_count": 3},
                ...
            ]
        }
    """

    authentication_classes = PORTAL_OR_AGENT_AUTH
    permission_classes = [OpenOrAgentAuth]

    def get(self, request):
        tenant_id = get_tenant_id_from_request(request)
        if not tenant_id:
            return Response({'error': 'Could not resolve tenant'}, status=401)

        days = self._parse_days(request.query_params.get('days'))

        risks = list(
            Risk.objects.filter(tenant_id=tenant_id).only(
                'status',
                'severity',
                'likelihood',
                'impact',
                'created_at',
                'updated_at',
            )
        )

        today = timezone.now().date()
        trend = []
        closed_status = Risk.RiskStatus.CLOSED

        for offset in range(days):
            day = today - timedelta(days=days - offset - 1)

            open_on_day = [
                r for r in risks
                if r.created_at.date() <= day
                and (r.status != closed_status or r.updated_at.date() > day)
            ]

            open_count = len(open_on_day)
            if open_count == 0:
                trend.append({'day': day.isoformat(), 'index': 0, 'open_count': 0})
                continue

            total_score = sum(r.risk_score for r in open_on_day)
            max_score = open_count * MAX_RISK_SCORE_PER_RISK
            index = round((total_score / max_score) * 100) if max_score else 0

            trend.append({
                'day': day.isoformat(),
                'index': index,
                'open_count': open_count,
            })

        return Response({'trend': trend})

    @staticmethod
    def _parse_days(raw) -> int:
        """Parse and clamp the ``days`` query parameter."""
        if raw is None or raw == '':
            return DEFAULT_TREND_DAYS
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return DEFAULT_TREND_DAYS
        return max(MIN_TREND_DAYS, min(value, MAX_TREND_DAYS))
