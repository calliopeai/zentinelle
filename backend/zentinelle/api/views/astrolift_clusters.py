"""
Connected Astrolift installs and their clusters (#389).

Astrolift-facing, never a portal session:

    POST   astrolift/connect                          {code, install: {base_url, name}}
    POST   astrolift/clusters                         install credential
    POST   astrolift/clusters/<cluster_id>/rotate     install credential
    DELETE astrolift/clusters/<cluster_id>            install credential
    DELETE astrolift/install                          install credential
    POST   astrolift/clusters/<cluster_id>/heartbeat  gateway credential
    POST   astrolift/agents                           install credential, {agent_id, ttl_seconds, ...}
    POST   astrolift/agents/<agent_id>/renew          install credential, {ttl_seconds}
    DELETE astrolift/agents/<agent_id>                install credential

The install credential is `Authorization: Bearer sk_astroinst_...`; the
gateway's is `X-Zentinelle-Gateway-Credential`. `cluster_id` is Astrolift's id
for the cluster, the value its gateway sends as X-Zentinelle-Cluster.

Portal, session-authenticated and admin only:

    GET    settings/astrolift
    POST   settings/astrolift/enrollment-codes        {tenant_ids?, ttl_minutes?}
    DELETE settings/astrolift/installs/<uuid>
    DELETE settings/astrolift/clusters/<uuid>

A response that carries a code or a credential is the only place it ever
appears, and is marked no-store.
"""
from datetime import timedelta

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import (AstroliftInstallAuthentication,
                                 GatewayCredentialAuthentication)
from zentinelle.api.permissions import PORTAL_AUTH, PortalAdminAccess
from zentinelle.api.serializers import (AstroliftAgentKeySerializer,
                                        AstroliftAgentRenewSerializer,
                                        AstroliftClusterSerializer,
                                        AstroliftConnectSerializer,
                                        AstroliftHeartbeatSerializer,
                                        AstroliftRotateSerializer,
                                        EnrollmentCodeRequestSerializer)
from zentinelle.auth.mode import is_open_mode
from zentinelle.models import AstroliftCluster, AstroliftInstall
from zentinelle.schema.auth_helpers import (get_request_tenant_id,
                                            user_has_org_access)
from zentinelle.services.astrolift_clusters import (AstroliftError, connect,
                                                    disconnect_install,
                                                    issue_enrollment_code,
                                                    lifetime_ends_at,
                                                    mint_agent_key,
                                                    record_heartbeat,
                                                    register_cluster,
                                                    renew_agent_key,
                                                    revoke_agent_key,
                                                    revoke_cluster,
                                                    rotate_cluster)

STANDALONE_TENANT_ID = '00000000-0000-0000-0000-000000000001'


def _no_store(response):
    response['Cache-Control'] = 'no-store'
    return response


def _refusal(error: AstroliftError):
    return _no_store(Response({'error': error.code, 'detail': error.detail}, status=error.status))


def _cluster_not_found(cluster_id):
    return Response({'error': 'cluster_not_found', 'detail': f'No registered cluster {cluster_id} on this install.'},
                    status=status.HTTP_404_NOT_FOUND)


def _iso(value):
    return value.isoformat() if value else None


def _cluster_json(cluster, visible=None):
    # The live registration; for a revoked cluster, the one it had.
    registrations = sorted(cluster.gateway_registrations.all(), key=lambda r: r.revoked_at is not None)
    registration = registrations[0] if registrations else None
    tenants = list(registration.tenant_ids) if registration else []
    return {
        'id': str(cluster.id),
        'cluster_id': cluster.external_id,
        'provider': cluster.provider,
        'region': cluster.region,
        'status': cluster.status,
        'health': cluster.health,
        'last_seen_at': _iso(cluster.last_seen_at),
        'gateway_version': cluster.gateway_version,
        'counters': cluster.counters,
        'gateway': registration.name if registration else None,
        'tenant_ids': tenants if visible is None else [t for t in tenants if t in visible],
        'created_at': _iso(cluster.created_at),
        'revoked_at': _iso(cluster.revoked_at),
    }


def _install_json(install, visible=None):
    return {
        'id': str(install.id),
        'name': install.name,
        'base_url': install.base_url,
        'status': install.status,
        'tenant_ids': list(install.tenant_ids) if visible is None else [
            t for t in install.tenant_ids if t in visible],
        'connected_at': _iso(install.connected_at),
        'last_used_at': _iso(install.last_used_at),
        'revoked_at': _iso(install.revoked_at),
    }


def _agent_json(agent):
    return {
        'id': str(agent.id),
        'agent_id': agent.agent_id,
        'tenant_id': agent.tenant_id,
        'status': agent.status,
        'deployment_id': agent.deployment_id_ext,
        'expires_at': _iso(agent.api_key_expires_at),
        'lifetime_ends_at': _iso(lifetime_ends_at(agent)),
    }


def _gateway_json(registration, plaintext):
    return {
        'name': registration.name,
        'credential': plaintext,
        'tenant_ids': list(registration.tenant_ids),
    }


# --- Astrolift-facing -------------------------------------------------------


class AstroliftConnectView(APIView):
    """Exchange a one-time enrollment code for an install and its credential."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = AstroliftConnectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            install, plaintext = connect(
                data['code'], data['install']['base_url'], data['install']['name'], request=request)
        except AstroliftError as error:
            return _refusal(error)
        return _no_store(Response({
            'install': _install_json(install),
            'credential': plaintext,
        }, status=status.HTTP_201_CREATED))


class _InstallView(APIView):
    authentication_classes = [AstroliftInstallAuthentication]
    permission_classes = [IsAuthenticated]

    @property
    def install(self):
        return self.request.user.install


class AstroliftClustersView(_InstallView):
    """Register a cluster, or register it again, and get its gateway credential."""

    def post(self, request):
        serializer = AstroliftClusterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            cluster, registration, plaintext, created = register_cluster(
                self.install, data['cluster_id'], provider=data['provider'], region=data['region'],
                tenant_ids=data.get('tenant_ids'), request=request)
        except AstroliftError as error:
            return _refusal(error)
        return _no_store(Response({
            'cluster': _cluster_json(cluster),
            'gateway': _gateway_json(registration, plaintext),
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK))


class AstroliftClusterView(_InstallView):
    """Revoke one of this install's clusters and its gateway's credentials."""

    def delete(self, request, cluster_id):
        cluster = AstroliftCluster.objects.filter(
            install=self.install, external_id=cluster_id, revoked_at__isnull=True).first()
        if cluster is None:
            return _cluster_not_found(cluster_id)
        cluster = revoke_cluster(cluster, request=request, via='astrolift')
        return Response({'cluster': _cluster_json(cluster)})


class AstroliftClusterRotateView(_InstallView):
    """Mint the next gateway credential for one of this install's clusters."""

    def post(self, request, cluster_id):
        serializer = AstroliftRotateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cluster, registration, plaintext = rotate_cluster(
                self.install, cluster_id, overlap=timedelta(seconds=serializer.validated_data['overlap_seconds']),
                request=request)
        except AstroliftError as error:
            return _refusal(error)
        return _no_store(Response({
            'cluster': _cluster_json(cluster),
            'gateway': _gateway_json(registration, plaintext),
        }))


class AstroliftInstallView(_InstallView):
    """Disconnect this install: its credential, clusters and gateways all stop working."""

    def delete(self, request):
        install = disconnect_install(self.install, request=request, via='astrolift')
        return Response({'install': _install_json(install)})


class AstroliftAgentsView(_InstallView):
    """Mint the key of an agent for one of this install's tasks or boxes (#400)."""

    def post(self, request):
        serializer = AstroliftAgentKeySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            agent, plaintext, created = mint_agent_key(
                self.install, data['agent_id'], timedelta(seconds=data['ttl_seconds']),
                tenant_id=data['tenant_id'], name=data['name'], deployment_id=data['deployment_id'],
                request=request)
        except AstroliftError as error:
            return _refusal(error)
        return _no_store(Response({'agent': _agent_json(agent), 'api_key': plaintext},
                                  status=status.HTTP_201_CREATED if created else status.HTTP_200_OK))


class AstroliftAgentRenewView(_InstallView):
    """Move the expiry of a live key this install minted."""

    def post(self, request, agent_id):
        serializer = AstroliftAgentRenewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            agent = renew_agent_key(self.install, agent_id, timedelta(seconds=data['ttl_seconds']),
                                    tenant_id=data['tenant_id'])
        except AstroliftError as error:
            return _refusal(error)
        return Response({'agent': _agent_json(agent)})


class AstroliftAgentView(_InstallView):
    """Terminate an agent this install minted; its key is refused from the next request."""

    def delete(self, request, agent_id):
        try:
            revoke_agent_key(self.install, agent_id, tenant_id=request.query_params.get('tenant_id', ''),
                             request=request)
        except AstroliftError as error:
            return _refusal(error)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AstroliftClusterHeartbeatView(APIView):
    """A gateway reports its cluster's health, version and counters."""

    authentication_classes = [GatewayCredentialAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, cluster_id):
        serializer = AstroliftHeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            record_heartbeat(request.auth, cluster_id, data['status'], data['version'], data.get('counters'))
        except AstroliftError as error:
            return _refusal(error)
        return Response({
            'acknowledged': True,
            'next_heartbeat_seconds': int(AstroliftCluster.HEARTBEAT_INTERVAL.total_seconds()),
        })


# --- Portal -----------------------------------------------------------------


def _portal_tenant(request) -> str:
    """The caller's tenant, or '' for a caller who has none."""
    tenant_id = get_request_tenant_id(request.user)
    if not tenant_id and is_open_mode():
        return STANDALONE_TENANT_ID
    return tenant_id or ''


def _actor(request):
    return str(getattr(request.user, 'pk', '') or '')


def _visible_tenants(request, tenant_ids):
    return {t for t in tenant_ids if user_has_org_access(request.user, t)}


def _may_act_on(request, install):
    """A portal admin changes an install only if it may act for every tenant the install serves."""
    return all(user_has_org_access(request.user, t) for t in install.tenant_ids)


class AstroliftSettingsView(APIView):
    """The installs serving the caller's tenant, with their clusters."""

    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def get(self, request):
        tenant_id = _portal_tenant(request)
        if not tenant_id:
            return Response({'installs': []})
        installs = AstroliftInstall.objects.filter(tenant_ids__contains=[tenant_id]).prefetch_related(
            'clusters__gateway_registrations')
        result = []
        for install in installs:
            visible = _visible_tenants(request, install.tenant_ids)
            entry = _install_json(install, visible)
            entry['clusters'] = [_cluster_json(cluster, visible) for cluster in install.clusters.all()]
            result.append(entry)
        return Response({'installs': result})


class AstroliftEnrollmentCodeView(APIView):
    """Generate a one-time code for Astrolift to connect with. Shown once."""

    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def post(self, request):
        serializer = EnrollmentCodeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        tenant_ids = data.get('tenant_ids') or [_portal_tenant(request)]
        if not all(tenant_ids) or not all(user_has_org_access(request.user, t) for t in tenant_ids):
            return Response({'error': 'tenant_not_permitted',
                             'detail': 'You cannot issue a code for a tenant you do not manage.'},
                            status=status.HTTP_403_FORBIDDEN)
        created_by = getattr(request.user, 'username', '') or _actor(request)
        plaintext, record = issue_enrollment_code(
            list(dict.fromkeys(tenant_ids)), created_by, ttl=timedelta(minutes=data['ttl_minutes']),
            request=request, actor_id=_actor(request))
        return _no_store(Response({
            'code': plaintext,
            'expires_at': _iso(record.expires_at),
            'tenant_ids': record.tenant_ids,
        }, status=status.HTTP_201_CREATED))


class AstroliftInstallAdminView(APIView):
    """Disconnect an install from the portal."""

    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def delete(self, request, install_id):
        tenant_id = _portal_tenant(request)
        install = AstroliftInstall.objects.filter(pk=install_id, tenant_ids__contains=[tenant_id]).first()
        if not tenant_id or install is None:
            return Response({'error': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if not _may_act_on(request, install):
            return Response({'error': 'tenant_not_permitted',
                             'detail': 'This install also serves tenants you do not manage.'},
                            status=status.HTTP_403_FORBIDDEN)
        install = disconnect_install(install, request=request, actor_id=_actor(request), via='portal')
        return Response({'install': _install_json(install, _visible_tenants(request, install.tenant_ids))})


class AstroliftClusterAdminView(APIView):
    """Revoke a cluster's gateway from the portal."""

    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def delete(self, request, cluster_id):
        tenant_id = _portal_tenant(request)
        cluster = AstroliftCluster.objects.select_related('install').filter(
            pk=cluster_id, install__tenant_ids__contains=[tenant_id]).first()
        if not tenant_id or cluster is None:
            return Response({'error': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if not _may_act_on(request, cluster.install):
            return Response({'error': 'tenant_not_permitted',
                             'detail': 'This cluster\'s install also serves tenants you do not manage.'},
                            status=status.HTTP_403_FORBIDDEN)
        cluster = revoke_cluster(cluster, request=request, actor_id=_actor(request), via='portal')
        return Response({'cluster': _cluster_json(cluster, _visible_tenants(request, cluster.install.tenant_ids))})
