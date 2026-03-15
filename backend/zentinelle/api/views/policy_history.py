"""
Policy version history and diff endpoints.

GET /api/zentinelle/v1/policies/{policy_id}/history/
GET /api/zentinelle/v1/policies/{policy_id}/diff/?from=1&to=2
"""
import logging

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from zentinelle.models import Policy
from zentinelle.models.policy import PolicyHistory
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_tenant_id_from_request

logger = logging.getLogger(__name__)


def _diff_snapshots(snap_from: dict, snap_to: dict) -> dict:
    """
    Compute a field-level diff between two policy snapshots.

    Returns:
        {
            "added":   {field: new_value},    # present in to, absent in from
            "removed": {field: old_value},    # present in from, absent in to
            "changed": {field: [old, new]},   # present in both but different value
        }

    For the 'config' key, a deep (key-by-key) diff is performed.
    """
    added = {}
    removed = {}
    changed = {}

    all_keys = set(snap_from.keys()) | set(snap_to.keys())

    for key in all_keys:
        in_from = key in snap_from
        in_to = key in snap_to

        if not in_from:
            added[key] = snap_to[key]
        elif not in_to:
            removed[key] = snap_from[key]
        else:
            old_val = snap_from[key]
            new_val = snap_to[key]
            if key == 'config' and isinstance(old_val, dict) and isinstance(new_val, dict):
                # Deep diff on config
                config_added, config_removed, config_changed = {}, {}, {}
                all_config_keys = set(old_val.keys()) | set(new_val.keys())
                for ck in all_config_keys:
                    if ck not in old_val:
                        config_added[ck] = new_val[ck]
                    elif ck not in new_val:
                        config_removed[ck] = old_val[ck]
                    elif old_val[ck] != new_val[ck]:
                        config_changed[ck] = [old_val[ck], new_val[ck]]
                if config_added or config_removed or config_changed:
                    changed['config'] = {
                        'added': config_added,
                        'removed': config_removed,
                        'changed': config_changed,
                    }
            elif old_val != new_val:
                changed[key] = [old_val, new_val]

    return {'added': added, 'removed': removed, 'changed': changed}


class PolicyHistoryListView(APIView):
    """
    List version history for a policy.

    GET /api/zentinelle/v1/policies/{policy_id}/history/

    Returns paginated history records newest first.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, policy_id: int):
        tenant_id = get_tenant_id_from_request(request)

        try:
            policy = Policy.objects.get(pk=policy_id, tenant_id=tenant_id)
        except Policy.DoesNotExist:
            return Response({'detail': 'Policy not found.'}, status=status.HTTP_404_NOT_FOUND)

        records = PolicyHistory.objects.filter(policy=policy).order_by('-version')

        # Simple pagination via offset/limit query params
        try:
            limit = int(request.query_params.get('limit', 50))
            offset = int(request.query_params.get('offset', 0))
        except (ValueError, TypeError):
            limit, offset = 50, 0

        total = records.count()
        page = records[offset:offset + limit]

        results = [
            {
                'id': rec.id,
                'policy_id': str(policy.pk),
                'version': rec.version,
                'snapshot': rec.snapshot,
                'changed_by': rec.changed_by,
                'changed_at': rec.changed_at.isoformat() if rec.changed_at else None,
                'change_summary': rec.change_summary,
            }
            for rec in page
        ]

        return Response({'count': total, 'results': results}, status=status.HTTP_200_OK)


class PolicyDiffView(APIView):
    """
    Diff two versions of a policy.

    GET /api/zentinelle/v1/policies/{policy_id}/diff/?from=1&to=2

    Returns a field-level diff between the two snapshot versions.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, policy_id: int):
        tenant_id = get_tenant_id_from_request(request)

        try:
            policy = Policy.objects.get(pk=policy_id, tenant_id=tenant_id)
        except Policy.DoesNotExist:
            return Response({'detail': 'Policy not found.'}, status=status.HTTP_404_NOT_FOUND)

        from_version = request.query_params.get('from')
        to_version = request.query_params.get('to')

        if not from_version or not to_version:
            return Response(
                {'detail': 'Both "from" and "to" version query parameters are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from_version = int(from_version)
            to_version = int(to_version)
        except (ValueError, TypeError):
            return Response(
                {'detail': '"from" and "to" must be integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from_record = PolicyHistory.objects.get(policy=policy, version=from_version)
        except PolicyHistory.DoesNotExist:
            return Response(
                {'detail': f'Version {from_version} not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            to_record = PolicyHistory.objects.get(policy=policy, version=to_version)
        except PolicyHistory.DoesNotExist:
            return Response(
                {'detail': f'Version {to_version} not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        diff = _diff_snapshots(from_record.snapshot, to_record.snapshot)

        return Response(
            {
                'policy_id': str(policy.pk),
                'from_version': from_version,
                'to_version': to_version,
                **diff,
            },
            status=status.HTTP_200_OK,
        )
