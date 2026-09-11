"""Tenant-scoped API for staged policy change sets."""
import json

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import get_tenant_id_from_request
from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess
from zentinelle.auth.roles import can_admin
from zentinelle.models import PolicyChangeSet


def _serialize(change):
    return {
        'id': str(change.id),
        'tenant_id': change.tenant_id,
        'status': change.status,
        'title': change.title,
        'description': change.description,
        'changes': change.changes,
        'base_versions': change.base_versions,
        'validation': change.validation,
        'applied_snapshots': change.applied_snapshots,
        'target_selectors': change.target_selectors,
        'created_by': change.created_by,
        'reviewed_by': change.reviewed_by,
        'approved_by': change.approved_by,
        'created_at': change.created_at.isoformat() if change.created_at else None,
        'updated_at': change.updated_at.isoformat() if change.updated_at else None,
        'staged_at': change.staged_at.isoformat() if change.staged_at else None,
        'promoted_at': change.promoted_at.isoformat() if change.promoted_at else None,
        'rolled_back_at': change.rolled_back_at.isoformat() if change.rolled_back_at else None,
    }


class PolicyChangeSetListView(APIView):
    """List or create tenant-scoped policy change drafts."""

    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def get(self, request):
        tenant_id = get_tenant_id_from_request(request)
        changes = PolicyChangeSet.objects.filter(tenant_id=tenant_id).order_by('-created_at')
        return Response({'results': [_serialize(change) for change in changes]})

    def post(self, request):
        tenant_id = get_tenant_id_from_request(request)
        try:
            data = json.loads(request.body or '{}')
        except (TypeError, ValueError, json.JSONDecodeError):
            return Response({'detail': 'Invalid JSON.'}, status=status.HTTP_400_BAD_REQUEST)

        title = data.get('title', '').strip() if isinstance(data.get('title', ''), str) else ''
        changes = data.get('changes', [])
        if not title or not isinstance(changes, list):
            return Response(
                {'detail': 'title and changes (a list) are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        actor = str(getattr(request.user, 'pk', '') or getattr(request.user, 'username', '') or 'operator')
        change = PolicyChangeSet.objects.create(
            tenant_id=tenant_id,
            title=title,
            description=data.get('description', '') if isinstance(data.get('description', ''), str) else '',
            changes=changes,
            base_versions=data.get('base_versions', {}) if isinstance(data.get('base_versions', {}), dict) else {},
            target_selectors=data.get('target_selectors', {}) if isinstance(data.get('target_selectors', {}), dict) else {},
            created_by=actor,
        )
        return Response(_serialize(change), status=status.HTTP_201_CREATED)


class PolicyChangeSetTransitionView(APIView):
    """Advance a change set through its explicit reviewed state machine."""

    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAccess]

    def post(self, request, change_id):
        tenant_id = get_tenant_id_from_request(request)
        try:
            change = PolicyChangeSet.objects.get(id=change_id, tenant_id=tenant_id)
        except PolicyChangeSet.DoesNotExist:
            return Response({'detail': 'Policy change not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            data = json.loads(request.body or '{}')
        except (TypeError, ValueError, json.JSONDecodeError):
            return Response({'detail': 'Invalid JSON.'}, status=status.HTTP_400_BAD_REQUEST)
        next_status = data.get('status', '')
        if next_status not in PolicyChangeSet.Status.values:
            return Response({'detail': 'Unknown policy change status.'}, status=status.HTTP_400_BAD_REQUEST)
        if next_status in (
            PolicyChangeSet.Status.APPROVED,
            PolicyChangeSet.Status.PROMOTED,
            PolicyChangeSet.Status.ROLLED_BACK,
        ) and not can_admin(request.user):
            return Response(
                {'detail': 'Administrator approval is required for this transition.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        actor = str(getattr(request.user, 'pk', '') or getattr(request.user, 'username', '') or 'operator')
        try:
            if next_status == PolicyChangeSet.Status.PROMOTED:
                from zentinelle.services.policy_rollout import \
                    promote_change_set
                change = promote_change_set(change.id, tenant_id, actor=actor)
            elif next_status == PolicyChangeSet.Status.ROLLED_BACK:
                from zentinelle.services.policy_rollout import \
                    rollback_change_set
                change = rollback_change_set(change.id, tenant_id, actor=actor)
            else:
                change.transition(next_status, actor=actor, validation=data.get('validation'))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(_serialize(change))
