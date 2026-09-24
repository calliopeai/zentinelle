"""Token-authenticated operator API for automation and deployment tooling."""

from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import ZentinellePlatformKeyAuthentication
from zentinelle.models import AgentEndpoint, Policy

MAX_AGENT_KEY_TTL_SECONDS = 30 * 24 * 3600
# What a policy does on a match (#396); Policy.clean() validates them together.
ACTION_FIELDS = ('action', 'block_level', 'steer_message', 'escalation')


def _ttl_seconds(value):
    """Parse ``ttl_seconds``: None when absent, else an int in range, else raise."""
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise ValueError
    ttl = int(value)
    if not 1 <= ttl <= MAX_AGENT_KEY_TTL_SECONDS:
        raise ValueError
    return ttl


class IsPlatformOperator(BasePermission):
    """Require a platform/service key with the requested scope."""

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not getattr(user, 'is_authenticated', False):
            return False
        required = 'read' if request.method in (
            'GET', 'HEAD', 'OPTIONS') else 'write'
        return getattr(user, 'has_scope', lambda _: False)(required) or user.has_scope('admin')


class OperatorAgentView(APIView):
    """List and create tenant-scoped agent endpoints."""

    authentication_classes = [ZentinellePlatformKeyAuthentication]
    permission_classes = [IsPlatformOperator]

    def get(self, request):
        rows = AgentEndpoint.objects.filter(tenant_id=request.user.tenant_id).values(
            'id', 'agent_id', 'name', 'description', 'agent_type', 'status',
            'health', 'capabilities', 'metadata', 'config', 'registered_at',
            'last_heartbeat', 'sub_organization_id_ext', 'deployment_id_ext',
        )
        return Response({'agents': list(rows)})

    @transaction.atomic
    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        agent_id = str(data.get('agent_id', '')).strip()
        name = str(data.get('name', agent_id)).strip()
        agent_type = str(
            data.get('agent_type', AgentEndpoint.AgentType.CUSTOM)).strip()
        if not agent_id or not name or agent_type not in AgentEndpoint.AgentType.values:
            return Response(
                {'error': 'agent_id, name, and a valid agent_type are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            ttl = _ttl_seconds(data.get('ttl_seconds'))
        except (TypeError, ValueError):
            return Response(
                {'error': f'ttl_seconds must be an integer from 1 to {MAX_AGENT_KEY_TTL_SECONDS}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        expires_at = timezone.now() + timedelta(seconds=ttl) if ttl else None
        if AgentEndpoint.objects.filter(
                tenant_id=request.user.tenant_id, agent_id=agent_id).exists():
            return Response({'error': 'agent_id already exists'}, status=status.HTTP_409_CONFLICT)
        api_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        try:
            endpoint = AgentEndpoint.objects.create(
                tenant_id=request.user.tenant_id,
                agent_id=agent_id,
                name=name,
                description=str(data.get('description', ''))[:10000],
                agent_type=agent_type,
                api_key_hash=key_hash,
                api_key_prefix=key_prefix,
                api_key_expires_at=expires_at,
                capabilities=data.get('capabilities', []),
                metadata=data.get('metadata', {}),
                config=data.get('config', {}),
                sub_organization_id_ext=str(
                    data.get('sub_organization_id_ext', '')),
                deployment_id_ext=str(data.get('deployment_id_ext', '')),
                status=AgentEndpoint.Status.ACTIVE,
                health=AgentEndpoint.Health.UNKNOWN,
            )
        except (TypeError, ValueError, IntegrityError):
            return Response({'error': 'invalid agent payload'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                'agent_id': endpoint.agent_id,
                'id': str(endpoint.id),
                'api_key': api_key,
                'expires_at': expires_at.isoformat() if expires_at else None,
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, agent_id=None):
        """Revoke an agent: its key is refused from the next request on."""
        # An operator's stop: the minting Astrolift install may not undo it by
        # minting again (#400).
        updated = AgentEndpoint.objects.filter(
            tenant_id=request.user.tenant_id, agent_id=agent_id,
        ).update(status=AgentEndpoint.Status.TERMINATED, astrolift_revoked_at=None, updated_at=timezone.now())
        if not updated:
            return Response({'error': 'agent not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OperatorPolicyView(APIView):
    """List, create, and update tenant-scoped policies."""

    authentication_classes = [ZentinellePlatformKeyAuthentication]
    permission_classes = [IsPlatformOperator]

    def get(self, request):
        qs = Policy.objects.filter(tenant_id=request.user.tenant_id)
        policy_type = request.query_params.get('policy_type')
        if policy_type:
            qs = qs.filter(policy_type=policy_type)
        rows = qs.values(
            'id', 'name', 'description', 'policy_type', 'scope_type',
            'scope_sub_organization_id_ext', 'scope_deployment_id_ext',
            'scope_endpoint_id', 'scope_user_id_ext', 'config', 'override_group',
            'non_overridable', 'priority', 'enabled', 'enforcement', 'version',
            'action', 'block_level', 'steer_message', 'escalation',
        )
        return Response({'policies': list(rows)})

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        required = ('name', 'policy_type', 'scope_type')
        if any(not str(data.get(field, '')).strip() for field in required):
            return Response({'error': 'name, policy_type, and scope_type are required'}, status=400)
        valid_types = {value for value, _ in Policy.PolicyType.choices}
        valid_scopes = {value for value, _ in Policy.ScopeType.choices}
        if data['policy_type'] not in valid_types or data['scope_type'] not in valid_scopes:
            return Response({'error': 'invalid policy_type or scope_type'}, status=400)
        action_fields = {name: data[name] for name in ACTION_FIELDS if name in data}
        try:
            policy = Policy.objects.create(
                tenant_id=request.user.tenant_id,
                name=str(data['name']).strip(),
                description=str(data.get('description', ''))[:10000],
                policy_type=data['policy_type'], scope_type=data['scope_type'],
                config=data.get('config', {}), priority=int(data.get('priority', 0)),
                enabled=bool(data.get('enabled', True)),
                enforcement=data.get('enforcement', Policy.Enforcement.ENFORCE),
                override_group=str(data.get('override_group', '')),
                non_overridable=bool(data.get('non_overridable', False)),
                user_id=str(getattr(request.user, 'id', '')),
                **action_fields,
            )
        except ValidationError as exc:
            return Response({'error': '; '.join(exc.messages)}, status=400)
        return Response({'id': str(policy.id), 'version': policy.version}, status=201)

    def patch(self, request, policy_id=None):
        if not policy_id:
            return Response({'error': 'policy_id is required'}, status=400)
        policy = Policy.objects.filter(
            tenant_id=request.user.tenant_id, id=policy_id).first()
        if policy is None:
            return Response({'error': 'policy not found'}, status=404)
        allowed = {
            'name', 'description', 'config', 'priority', 'enabled', 'enforcement',
            'override_group', 'non_overridable', *ACTION_FIELDS,
        }
        for key in allowed.intersection(request.data.keys()):
            setattr(policy, key, request.data[key])
        policy.user_id = str(getattr(request.user, 'id', ''))
        try:
            policy.save()
        except ValidationError as exc:
            return Response({'error': '; '.join(exc.messages)}, status=400)
        return Response({'id': str(policy.id), 'version': policy.version})
