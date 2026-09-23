"""
Connect Astrolift installs and register their clusters' gateways (#389).

The lifecycle, in the order Astrolift drives it:

- An admin issues an EnrollmentCode scoped to some tenants (portal or
  manage.py) and pastes it into Astrolift with this Zentinelle's URL.
- `connect` consumes the code once and creates the AstroliftInstall, whose
  credential is returned to Astrolift and nobody else.
- `register_cluster` creates (or updates) a cluster and its gateway
  registration, scoped to the install's tenants or a subset of them, and mints
  the gateway credential Astrolift puts into the cluster.
- `rotate_cluster` mints the next credential; the earlier ones overlap for a
  while, because the gateway only rereads its credential file when it is
  refused, so an overlap longer than Secret propagation rotates with no
  refused request. An overlap of zero cuts them off at once.
- `revoke_cluster` and `disconnect_install` revoke, cascading to the gateway
  registrations, whose credentials then stop working.

Every change is audited once per tenant in scope, so each tenant's chain shows
what touched it, and never with a code or credential in it. A mutation and
its audit records commit together or not at all where they share a database;
where they don't, the audit record is written first, so a failure can leave
an audit record of something that did not happen but never the reverse.

Heartbeats are telemetry from the gateway, not changes anyone made, and are
not audited: a record per cluster per minute in every tenant's chain would
bury the changes the chain exists to show.
"""
import logging
import re
from datetime import timedelta

from django.db import router, transaction
from django.db.models import Q
from django.utils import timezone

from zentinelle.auth.gateway_credential import LOCAL_GATEWAY_NAME
from zentinelle.models import (AstroliftCluster, AstroliftInstall, AuditLog,
                               EnrollmentCode, GatewayCredential,
                               GatewayRegistration)

logger = logging.getLogger(__name__)

# Astrolift's id for a cluster, also what its gateway sends as
# X-Zentinelle-Cluster. It travels in URL paths, so no slashes.
CLUSTER_ID_PATTERN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')

# How long the credentials a rotation replaces keep working, unless it says.
DEFAULT_OVERLAP = timedelta(minutes=10)
MAX_OVERLAP = timedelta(hours=24)

HEARTBEAT_COUNTERS = ('requests', 'blocked', 'agents_seen')


class AstroliftError(Exception):
    """A refusal the API answers with `status` and the error `code`."""

    def __init__(self, code, detail, status=400):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.status = status


def _using():
    return router.db_for_write(AstroliftInstall)


def _audit(request, tenant_ids, action, resource_type, resource_id, resource_name='', metadata=None, actor_id=''):
    """One audit record per tenant in `tenant_ids`."""
    for tenant_id in tenant_ids:
        if request is None:
            AuditLog.log(tenant_id=tenant_id, action=action, resource_type=resource_type,
                         resource_id=str(resource_id), resource_name=resource_name[:255],
                         ext_user_id=actor_id, metadata=metadata)
        else:
            AuditLog.log_from_request(request, tenant_id, action=action, resource_type=resource_type,
                                      resource_id=str(resource_id), resource_name=resource_name[:255],
                                      metadata=metadata, ext_user_id=actor_id)


def issue_enrollment_code(tenant_ids, created_by, ttl=None, request=None, actor_id=''):
    """Create a one-time code for `tenant_ids`. Returns (plaintext, record).

    Raises ValueError for a lifetime out of bounds or no tenants.
    """
    with transaction.atomic(using=_using()):
        plaintext, record = EnrollmentCode.issue(tenant_ids, created_by, ttl)
        _audit(request, record.tenant_ids, 'astrolift.enrollment_code.created', 'astrolift_enrollment_code',
               record.id, metadata={'created_by': record.created_by, 'expires_at': record.expires_at.isoformat()},
               actor_id=actor_id)
    return plaintext, record


def connect(code, base_url, name, request=None):
    """Consume `code` and connect an install. Returns (install, plaintext credential).

    An unknown, expired and used code are refused alike, so the answer tells
    a caller nothing about which codes exist.
    """
    now = timezone.now()
    code_hash = EnrollmentCode.hash_code(code)
    with transaction.atomic(using=_using()):
        consumed = EnrollmentCode.objects.filter(
            code_hash=code_hash, used_at__isnull=True, expires_at__gt=now).update(used_at=now)
        if not consumed:
            logger.warning('Refused an Astrolift connect from %s: the enrollment code is unknown, expired or used',
                           base_url)
            raise AstroliftError(
                'invalid_enrollment_code',
                'The enrollment code is unknown, expired or already used. Generate a new one in Zentinelle.')
        enrollment = EnrollmentCode.objects.get(code_hash=code_hash)
        plaintext, key_hash, key_prefix = AstroliftInstall.new_credential()
        install = AstroliftInstall.objects.create(
            name=name, base_url=base_url, tenant_ids=list(enrollment.tenant_ids), enrollment_code=enrollment,
            key_prefix=key_prefix, key_hash=key_hash)
        _audit(request, install.tenant_ids, 'astrolift.install.connected', 'astrolift_install', install.id,
               install.name, {'base_url': install.base_url, 'enrollment_code_id': str(enrollment.id),
                              'code_created_by': enrollment.created_by})
    logger.info('Connected Astrolift install %s (%s) for tenants %s', install.name, install.id,
                ', '.join(install.tenant_ids))
    return install, plaintext


def _cluster_scope(install, requested):
    """The tenants a cluster serves: the install's, or a subset it names."""
    if requested is None:
        return list(install.tenant_ids)
    scope = []
    for tenant_id in requested:
        if tenant_id not in install.tenant_ids:
            raise AstroliftError(
                'tenant_not_in_install_scope',
                'A cluster can serve only tenants its install was connected for.', status=403)
        if tenant_id not in scope:
            scope.append(tenant_id)
    return scope


def _locked_install(install):
    install = AstroliftInstall.objects.select_for_update().get(pk=install.pk)
    if not install.is_active:
        raise AstroliftError('install_disconnected', 'This Astrolift install is disconnected.', status=401)
    return install


def _live_cluster(install, cluster_id):
    cluster = AstroliftCluster.objects.select_for_update().filter(
        install=install, external_id=cluster_id, revoked_at__isnull=True).first()
    if cluster is None:
        raise AstroliftError('cluster_not_found', f'No registered cluster {cluster_id} on this install.', status=404)
    return cluster


def _registration_for_new_cluster(cluster, scope):
    """Adopt the operator's registration for this cluster, or create one. Returns (registration, adopted).

    An operator may have registered this cluster's gateway by hand before
    Astrolift connected (manage.py gateway_credential register --cluster).
    That registration is adopted only when it is the one live, unlinked
    registration with this cluster_id and every tenant it serves is in the
    cluster's scope, so adopting it grants the install nothing it did not
    already have. Anything else gets a registration of its own.
    """
    candidates = list(GatewayRegistration.objects.select_for_update().filter(
        cluster_id=cluster.external_id, astrolift_cluster__isnull=True, revoked_at__isnull=True,
    ).exclude(name=LOCAL_GATEWAY_NAME))
    if len(candidates) == 1 and candidates[0].tenant_ids and set(candidates[0].tenant_ids) <= set(scope):
        registration = candidates[0]
        registration.astrolift_cluster = cluster
        registration.tenant_ids = scope
        registration.save(update_fields=['astrolift_cluster', 'tenant_ids', 'updated_at'])
        return registration, True
    if candidates:
        logger.info('Did not adopt gateway registration(s) %s for Astrolift cluster %s: they serve tenants '
                    'outside its scope, or there is more than one', ', '.join(r.name for r in candidates),
                    cluster.external_id)
    registration = GatewayRegistration.objects.create(
        name=f'astrolift-{cluster.id}', cluster_id=cluster.external_id, astrolift_cluster=cluster,
        tenant_ids=scope)
    return registration, False


def _retire_previous(registration, keep, overlap):
    """Let every live credential but `keep` work for `overlap` more at most. Returns how many.

    A zero overlap expires them now.
    """
    ends = timezone.now() + overlap
    return registration.credentials.filter(revoked_at__isnull=True).exclude(pk=keep.pk).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=ends)).update(expires_at=ends)


def register_cluster(install, cluster_id, provider='', region='', tenant_ids=None, request=None):
    """Register a cluster, or update a registered one, and mint its gateway credential.

    Returns (cluster, registration, plaintext credential, created). Registering
    a live cluster again is a rotation with the default overlap, so an
    installer that lost the credential can always register and use what it
    gets.
    """
    with transaction.atomic(using=_using()):
        install = _locked_install(install)
        scope = _cluster_scope(install, tenant_ids)
        cluster = AstroliftCluster.objects.select_for_update().filter(
            install=install, external_id=cluster_id, revoked_at__isnull=True).first()
        created = cluster is None
        adopted = False
        if created:
            cluster = AstroliftCluster.objects.create(
                install=install, external_id=cluster_id, provider=provider, region=region)
            registration, adopted = _registration_for_new_cluster(cluster, scope)
        else:
            cluster.provider, cluster.region = provider, region
            cluster.save(update_fields=['provider', 'region', 'updated_at'])
            registration = cluster.active_registration()
            if registration.tenant_ids != scope:
                registration.tenant_ids = scope
                registration.save(update_fields=['tenant_ids', 'updated_at'])
        plaintext, credential = GatewayCredential.mint(registration)
        overlapping = 0 if created and not adopted else _retire_previous(registration, credential, DEFAULT_OVERLAP)
        _audit(request, scope, 'astrolift.cluster.registered', 'astrolift_cluster', cluster.id, cluster.external_id,
               {'install_id': str(install.id), 'install': install.name, 'gateway': registration.name,
                'new': created, 'adopted_registration': adopted,
                'credential_prefix': credential.key_prefix, 'previous_credentials_overlapping': overlapping,
                'overlap_seconds': int(DEFAULT_OVERLAP.total_seconds()) if overlapping else 0})
    logger.info('Registered Astrolift cluster %s of install %s (gateway %s, tenants %s)',
                cluster.external_id, install.name, registration.name, ', '.join(scope))
    return cluster, registration, plaintext, created


def rotate_cluster(install, cluster_id, overlap=DEFAULT_OVERLAP, request=None):
    """Mint the next gateway credential. Returns (cluster, registration, plaintext).

    The earlier credentials keep working for `overlap`, or stop now when it is
    zero.
    """
    with transaction.atomic(using=_using()):
        install = _locked_install(install)
        cluster = _live_cluster(install, cluster_id)
        registration = cluster.active_registration()
        plaintext, credential = GatewayCredential.mint(registration)
        retired = _retire_previous(registration, credential, overlap)
        _audit(request, registration.tenant_ids, 'astrolift.cluster.rotated', 'astrolift_cluster', cluster.id,
               cluster.external_id,
               {'install_id': str(install.id), 'install': install.name, 'gateway': registration.name,
                'credential_prefix': credential.key_prefix, 'previous_credentials': retired,
                'overlap_seconds': int(overlap.total_seconds())})
    return cluster, registration, plaintext


def revoke_cluster(cluster, request=None, actor_id='', via='astrolift'):
    """Revoke a cluster and its gateway registrations. Returns the cluster.

    Revoking a revoked cluster changes nothing and records nothing.
    """
    with transaction.atomic(using=_using()):
        cluster = AstroliftCluster.objects.select_for_update().select_related('install').get(pk=cluster.pk)
        if not cluster.is_active:
            return cluster
        now = timezone.now()
        registrations = list(cluster.gateway_registrations.filter(revoked_at__isnull=True))
        tenants = sorted({t for r in registrations for t in r.tenant_ids}) or list(cluster.install.tenant_ids)
        GatewayRegistration.objects.filter(pk__in=[r.pk for r in registrations]).update(
            revoked_at=now, updated_at=now)
        cluster.revoked_at = now
        cluster.save(update_fields=['revoked_at', 'updated_at'])
        _audit(request, tenants, 'astrolift.cluster.revoked', 'astrolift_cluster', cluster.id, cluster.external_id,
               {'install_id': str(cluster.install_id), 'install': cluster.install.name, 'via': via,
                'gateways': [r.name for r in registrations]},
               actor_id=actor_id)
    logger.info('Revoked Astrolift cluster %s of install %s (via %s)', cluster.external_id, cluster.install.name, via)
    return cluster


def disconnect_install(install, request=None, actor_id='', via='astrolift'):
    """Revoke an install, its credential, its clusters and their gateway registrations.

    Disconnecting a disconnected install changes nothing and records nothing.
    """
    with transaction.atomic(using=_using()):
        install = AstroliftInstall.objects.select_for_update().get(pk=install.pk)
        if not install.is_active:
            return install
        now = timezone.now()
        clusters = list(install.clusters.select_for_update().filter(revoked_at__isnull=True))
        gateways = GatewayRegistration.objects.filter(astrolift_cluster__install=install, revoked_at__isnull=True)
        gateway_names = list(gateways.values_list('name', flat=True))
        gateways.update(revoked_at=now, updated_at=now)
        AstroliftCluster.objects.filter(pk__in=[c.pk for c in clusters]).update(revoked_at=now, updated_at=now)
        install.revoked_at = now
        install.save(update_fields=['revoked_at', 'updated_at'])
        _audit(request, install.tenant_ids, 'astrolift.install.disconnected', 'astrolift_install', install.id,
               install.name, {'via': via, 'clusters': [c.external_id for c in clusters], 'gateways': gateway_names},
               actor_id=actor_id)
    logger.info('Disconnected Astrolift install %s (via %s); revoked %d cluster(s)', install.name, via, len(clusters))
    return install


def record_heartbeat(credential, cluster_id, health, version='', counters=None):
    """Store a gateway's heartbeat on its cluster.

    The credential names the gateway, and so the one cluster it may report
    for; the cluster id in the request has to be that one.
    """
    cluster = credential.registration.astrolift_cluster
    if cluster is None or not cluster.is_active or cluster.external_id != cluster_id:
        raise AstroliftError('cluster_not_found', 'This gateway is not registered for that cluster.', status=404)
    now = timezone.now()
    counters = {name: value for name, value in (counters or {}).items() if name in HEARTBEAT_COUNTERS}
    AstroliftCluster.objects.filter(pk=cluster.pk).update(
        health=health, gateway_version=version, counters=counters, last_seen_at=now, updated_at=now)
    GatewayCredential.objects.filter(pk=credential.pk).update(last_used_at=now)
