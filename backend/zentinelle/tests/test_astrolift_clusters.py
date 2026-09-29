"""Astrolift installs and clusters as a Zentinelle concept (#389).

An admin issues a one-time enrollment code; Astrolift exchanges it for an
install and that install's credential, registers its clusters with it, and
gets back a gateway credential per cluster, scoped to the install's tenants.
The gateway credential is the #380 one: the provider-key lookup is the proof
that what registration hands out works, and works only for the tenants in
scope.
"""
import hashlib
import io
import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from zentinelle.auth.gateway_credential import STANDALONE_TENANT_ID
from zentinelle.auth.roles import ROLE_ADMIN, ROLE_OPERATOR, assign_role
from zentinelle.models import (AgentEndpoint, AstroliftCluster,
                               AstroliftInstall, AuditLog, EnrollmentCode,
                               GatewayCredential, GatewayRegistration,
                               LLMProviderKey)
from zentinelle.services.astrolift_clusters import issue_enrollment_code

TENANT_A = 'tenant-a'
TENANT_B = 'tenant-b'
TENANT_C = 'tenant-c'
KEY_A = 'sk-tenant-a-openai-key'
KEY_B = 'sk-tenant-b-openai-key'
KEY_C = 'sk-tenant-c-openai-key'


def make_agent(tenant_id, agent_id):
    key, key_hash, prefix = AgentEndpoint.generate_api_key()
    AgentEndpoint.objects.create(tenant_id=tenant_id, agent_id=agent_id, name=agent_id,
                                 api_key_hash=key_hash, api_key_prefix=prefix)
    return key


def store_key(tenant_id, plaintext):
    record = LLMProviderKey(tenant_id=tenant_id, provider='openai')
    record.set_key(plaintext)
    record.save()


def as_install(credential):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {credential}')
    return client


def as_gateway(credential):
    client = APIClient()
    client.credentials(HTTP_X_ZENTINELLE_GATEWAY_CREDENTIAL=credential)
    return client


def connect(code, name='astro-prod', base_url='https://astro.example.test/'):
    return APIClient().post(reverse('zentinelle:astrolift-connect'),
                            {'code': code, 'install': {'base_url': base_url, 'name': name}}, format='json')


def connect_install(tenants, name='astro-prod'):
    """A connected install: (its credential, the record)."""
    code, _ = issue_enrollment_code(tenants, 'test')
    response = connect(code, name=name)
    assert response.status_code == 201, response.content
    return response.json()['credential'], AstroliftInstall.objects.get(pk=response.json()['install']['id'])


def register(install_credential, cluster_id, **body):
    return as_install(install_credential).post(
        reverse('zentinelle:astrolift-clusters'), {'cluster_id': cluster_id, **body}, format='json')


def rotate(install_credential, cluster_id, **body):
    return as_install(install_credential).post(
        reverse('zentinelle:astrolift-cluster-rotate', kwargs={'cluster_id': cluster_id}), body, format='json')


def revoke(install_credential, cluster_id):
    return as_install(install_credential).delete(
        reverse('zentinelle:astrolift-cluster', kwargs={'cluster_id': cluster_id}))


def heartbeat(gateway_credential, cluster_id, **body):
    return as_gateway(gateway_credential).post(
        reverse('zentinelle:astrolift-cluster-heartbeat', kwargs={'cluster_id': cluster_id}),
        {'status': 'healthy', **body}, format='json')


def provider_key(agent_key, gateway_credential):
    return APIClient().post(
        reverse('zentinelle:gateway-provider-key'), {'provider': 'openai'}, format='json',
        HTTP_X_ZENTINELLE_KEY=agent_key, HTTP_X_ZENTINELLE_GATEWAY_CREDENTIAL=gateway_credential)


def audit_text():
    """Every audit record, every field, as one string."""
    return json.dumps([
        {field.name: str(getattr(entry, field.name)) for field in AuditLog._meta.fields}
        for entry in AuditLog.objects.all()
    ])


class EnrollmentCodeTests(TestCase):
    def test_a_code_is_stored_only_as_its_hash_and_lives_fifteen_minutes(self):
        before = timezone.now()
        code, record = issue_enrollment_code([TENANT_A], 'test')

        self.assertTrue(code.startswith('zen_enroll_'))
        self.assertEqual(record.code_hash, hashlib.sha256(code.encode()).hexdigest())
        stored = json.dumps({f.name: str(getattr(record, f.name)) for f in EnrollmentCode._meta.fields})
        self.assertNotIn(code, stored)
        self.assertNotIn(code[len('zen_enroll_'):], stored)
        self.assertAlmostEqual((record.expires_at - before).total_seconds(), 15 * 60, delta=5)

    def test_a_lifetime_outside_one_to_sixty_minutes_or_no_tenant_is_refused(self):
        for ttl in (timedelta(seconds=30), timedelta(minutes=61)):
            with self.subTest(ttl=ttl), self.assertRaises(ValueError):
                issue_enrollment_code([TENANT_A], 'test', ttl=ttl)
        with self.assertRaises(ValueError):
            issue_enrollment_code([], 'test')
        self.assertFalse(EnrollmentCode.objects.exists())

    def test_a_code_works_once(self):
        code, _ = issue_enrollment_code([TENANT_A], 'test')

        first = connect(code)
        again = connect(code, name='someone-else')

        self.assertEqual(first.status_code, 201)
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.json()['error'], 'invalid_enrollment_code')
        self.assertEqual(AstroliftInstall.objects.count(), 1)

    def test_an_expired_or_unknown_code_is_refused_like_a_used_one(self):
        code, record = issue_enrollment_code([TENANT_A], 'test')
        EnrollmentCode.objects.filter(pk=record.pk).update(expires_at=timezone.now() - timedelta(seconds=1))

        expired = connect(code)
        unknown = connect('zen_enroll_' + 'x' * 32)

        for response in (expired, unknown):
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()['error'], 'invalid_enrollment_code')
        self.assertEqual(expired.json(), unknown.json())
        self.assertFalse(AstroliftInstall.objects.exists())
        record.refresh_from_db()
        self.assertIsNone(record.used_at)

    def test_one_code_can_never_back_two_installs(self):
        # The conditional UPDATE is what makes a code single use; the
        # one-to-one column is the backstop under it.
        _, install = connect_install([TENANT_A])

        with self.assertRaises(IntegrityError), transaction.atomic():
            AstroliftInstall.objects.create(
                name='second', base_url='https://x.example.test', tenant_ids=[TENANT_A],
                enrollment_code=install.enrollment_code, key_prefix='x', key_hash='x')


class ConnectTests(TestCase):
    def test_connect_creates_the_install_for_the_codes_tenants_and_returns_its_credential_once(self):
        code, record = issue_enrollment_code([TENANT_A, TENANT_B], 'admin')

        response = connect(code, name='astro-prod', base_url='https://astro.example.test/')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response['Cache-Control'], 'no-store')
        body = response.json()
        self.assertTrue(body['credential'].startswith('sk_astroinst_'))
        install = AstroliftInstall.objects.get(pk=body['install']['id'])
        self.assertEqual(install.tenant_ids, [TENANT_A, TENANT_B])
        self.assertEqual(install.base_url, 'https://astro.example.test')
        self.assertEqual(install.status, 'connected')
        self.assertEqual(install.enrollment_code_id, record.id)
        record.refresh_from_db()
        self.assertIsNotNone(record.used_at)
        # Stored as a bcrypt hash, like every other credential.
        self.assertTrue(install.key_hash.startswith('$2'))
        self.assertNotIn(body['credential'], install.key_hash)
        self.assertEqual(AstroliftInstall.authenticate(body['credential']), install)

    def test_a_base_url_that_is_not_http_is_refused_and_the_code_survives(self):
        code, record = issue_enrollment_code([TENANT_A], 'test')

        response = connect(code, base_url='ftp://astro.example.test')

        self.assertEqual(response.status_code, 400)
        record.refresh_from_db()
        self.assertIsNone(record.used_at)

    def test_the_install_credential_is_required_and_checked(self):
        credential, _ = connect_install([TENANT_A])

        tampered = credential[:-1] + ('a' if credential[-1] != 'a' else 'b')
        for presented in (None, tampered, 'sk_service_' + 'x' * 40):
            with self.subTest(presented=(presented or '')[:14]):
                client = as_install(presented) if presented else APIClient()
                response = client.post(reverse('zentinelle:astrolift-clusters'), {'cluster_id': 'c1'}, format='json')
                self.assertEqual(response.status_code, 401)
        self.assertFalse(AstroliftCluster.objects.exists())


class ClusterRegistrationTests(TestCase):
    def setUp(self):
        self.agent_a = make_agent(TENANT_A, 'agent-a')
        self.agent_b = make_agent(TENANT_B, 'agent-b')
        self.agent_c = make_agent(TENANT_C, 'agent-c')
        store_key(TENANT_A, KEY_A)
        store_key(TENANT_B, KEY_B)
        store_key(TENANT_C, KEY_C)
        self.credential, self.install = connect_install([TENANT_A, TENANT_B])

    def test_a_registered_cluster_gets_a_gateway_credential_that_reads_only_its_tenants(self):
        response = register(self.credential, 'prod-us-east-1', provider='aws', region='us-east-1')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response['Cache-Control'], 'no-store')
        gateway = response.json()['gateway']
        self.assertTrue(gateway['credential'].startswith('sk_gateway_'))
        self.assertEqual(gateway['tenant_ids'], [TENANT_A, TENANT_B])
        cluster = AstroliftCluster.objects.get(install=self.install, external_id='prod-us-east-1')
        self.assertEqual((cluster.provider, cluster.region, cluster.status), ('aws', 'us-east-1', 'pending'))
        registration = GatewayRegistration.objects.get(astrolift_cluster=cluster)
        self.assertEqual(registration.cluster_id, 'prod-us-east-1')

        self.assertEqual(provider_key(self.agent_a, gateway['credential']).json()['api_key'], KEY_A)
        self.assertEqual(provider_key(self.agent_b, gateway['credential']).json()['api_key'], KEY_B)
        refused = provider_key(self.agent_c, gateway['credential'])
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(refused.json()['error'], 'tenant_not_in_gateway_scope')
        self.assertNotIn(KEY_C, refused.content.decode())

    def test_a_cluster_may_narrow_its_install_scope_but_never_widen_it(self):
        narrowed = register(self.credential, 'tenant-a-only', tenant_ids=[TENANT_A])
        widened = register(self.credential, 'grabby', tenant_ids=[TENANT_A, TENANT_C])

        credential = narrowed.json()['gateway']['credential']
        self.assertEqual(provider_key(self.agent_a, credential).status_code, 200)
        self.assertEqual(provider_key(self.agent_b, credential).status_code, 403)
        self.assertEqual(widened.status_code, 403)
        self.assertEqual(widened.json()['error'], 'tenant_not_in_install_scope')
        self.assertFalse(AstroliftCluster.objects.filter(external_id='grabby').exists())

    def test_a_cluster_id_that_cannot_be_a_path_segment_is_refused(self):
        for cluster_id in ('', 'has/slash', 'a' * 129, '-leading'):
            with self.subTest(cluster_id=cluster_id[:10]):
                self.assertEqual(register(self.credential, cluster_id).status_code, 400)
        self.assertFalse(AstroliftCluster.objects.exists())

    def test_registering_again_updates_the_cluster_and_overlaps_the_old_credential(self):
        first = register(self.credential, 'c1', provider='aws').json()['gateway']['credential']

        again = register(self.credential, 'c1', provider='gcp', region='us-central1')

        self.assertEqual(again.status_code, 200)
        second = again.json()['gateway']['credential']
        self.assertEqual(AstroliftCluster.objects.filter(external_id='c1').count(), 1)
        self.assertEqual(AstroliftCluster.objects.get(external_id='c1').provider, 'gcp')
        # Both work until the overlap ends, so the running gateway is not cut off.
        self.assertEqual(provider_key(self.agent_a, first).status_code, 200)
        self.assertEqual(provider_key(self.agent_a, second).status_code, 200)
        old = GatewayCredential.objects.get(key_prefix=first[:19])
        self.assertAlmostEqual((old.expires_at - timezone.now()).total_seconds(), 600, delta=30)

    def test_rotation_overlaps_then_the_old_credential_stops_working(self):
        first = register(self.credential, 'c1').json()['gateway']['credential']

        response = rotate(self.credential, 'c1', overlap_seconds=120)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        second = response.json()['gateway']['credential']
        self.assertEqual(provider_key(self.agent_a, first).status_code, 200)
        GatewayCredential.objects.filter(key_prefix=first[:19]).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(provider_key(self.agent_a, first).status_code, 401)
        self.assertEqual(provider_key(self.agent_a, second).status_code, 200)

    def test_rotation_with_no_overlap_cuts_the_old_credential_off_at_once(self):
        first = register(self.credential, 'c1').json()['gateway']['credential']

        second = rotate(self.credential, 'c1', overlap_seconds=0).json()['gateway']['credential']

        self.assertEqual(provider_key(self.agent_a, first).status_code, 401)
        self.assertEqual(provider_key(self.agent_a, second).status_code, 200)

    def test_an_overlap_out_of_bounds_is_refused(self):
        register(self.credential, 'c1')
        for overlap in (-1, 86401):
            with self.subTest(overlap=overlap):
                self.assertEqual(rotate(self.credential, 'c1', overlap_seconds=overlap).status_code, 400)
        self.assertEqual(GatewayCredential.objects.count(), 1)

    def test_revoking_a_cluster_ends_its_gateway_and_the_id_can_be_registered_again(self):
        first = register(self.credential, 'c1').json()['gateway']['credential']

        response = revoke(self.credential, 'c1')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['cluster']['status'], 'revoked')
        self.assertEqual(provider_key(self.agent_a, first).status_code, 401)
        self.assertEqual(rotate(self.credential, 'c1').status_code, 404)
        self.assertEqual(revoke(self.credential, 'c1').status_code, 404)

        again = register(self.credential, 'c1')
        self.assertEqual(again.status_code, 201)
        self.assertEqual(provider_key(self.agent_a, again.json()['gateway']['credential']).status_code, 200)
        self.assertEqual(provider_key(self.agent_a, first).status_code, 401)
        self.assertEqual(AstroliftCluster.objects.filter(external_id='c1').count(), 2)

    def test_disconnecting_the_install_revokes_everything_under_it(self):
        one = register(self.credential, 'c1').json()['gateway']['credential']
        two = register(self.credential, 'c2').json()['gateway']['credential']

        response = as_install(self.credential).delete(reverse('zentinelle:astrolift-install'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['install']['status'], 'disconnected')
        self.assertEqual(provider_key(self.agent_a, one).status_code, 401)
        self.assertEqual(provider_key(self.agent_a, two).status_code, 401)
        self.assertFalse(AstroliftCluster.objects.filter(revoked_at__isnull=True).exists())
        self.assertFalse(GatewayRegistration.objects.filter(revoked_at__isnull=True).exists())
        self.assertEqual(register(self.credential, 'c3').status_code, 401)
        self.assertIsNone(AstroliftInstall.authenticate(self.credential))

    def test_an_install_cannot_touch_another_installs_clusters(self):
        other_credential, other = connect_install([TENANT_C], name='other')
        theirs = register(other_credential, 'shared-name').json()['gateway']['credential']

        self.assertEqual(rotate(self.credential, 'shared-name').status_code, 404)
        self.assertEqual(revoke(self.credential, 'shared-name').status_code, 404)
        # The same id on this install is its own cluster, scoped to its own tenants.
        mine = register(self.credential, 'shared-name')
        self.assertEqual(mine.status_code, 201)
        self.assertEqual(AstroliftCluster.objects.filter(external_id='shared-name').count(), 2)
        self.assertEqual(provider_key(self.agent_c, mine.json()['gateway']['credential']).status_code, 403)
        self.assertEqual(provider_key(self.agent_c, theirs).status_code, 200)
        self.assertEqual(provider_key(self.agent_a, theirs).status_code, 403)
        self.assertTrue(AstroliftCluster.objects.get(install=other, external_id='shared-name').is_active)


class HeartbeatTests(TestCase):
    def setUp(self):
        self.credential, self.install = connect_install([TENANT_A])
        self.gateway = register(self.credential, 'c1').json()['gateway']['credential']

    def test_a_heartbeat_updates_the_cluster(self):
        response = heartbeat(self.gateway, 'c1', status='degraded', version='1.4.2',
                             counters={'requests': 10, 'blocked': 2, 'agents_seen': 3, 'unknown_counter': 9})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'acknowledged': True, 'next_heartbeat_seconds': 60})
        cluster = AstroliftCluster.objects.get(external_id='c1')
        self.assertEqual((cluster.health, cluster.gateway_version, cluster.status), ('degraded', '1.4.2', 'active'))
        self.assertEqual(cluster.counters, {'requests': 10, 'blocked': 2, 'agents_seen': 3})
        self.assertAlmostEqual((timezone.now() - cluster.last_seen_at).total_seconds(), 0, delta=30)

    def test_a_cluster_not_heard_from_reads_as_stale(self):
        heartbeat(self.gateway, 'c1')
        AstroliftCluster.objects.filter(external_id='c1').update(last_seen_at=timezone.now() - timedelta(minutes=6))

        self.assertEqual(AstroliftCluster.objects.get(external_id='c1').status, 'stale')

    def test_a_gateway_reports_only_for_its_own_cluster(self):
        other_gateway = register(self.credential, 'c2').json()['gateway']['credential']
        operator = GatewayRegistration.objects.create(name='manual', cluster_id='c1', tenant_ids=[TENANT_A])
        operator_credential, _ = GatewayCredential.mint(operator)

        self.assertEqual(heartbeat(other_gateway, 'c1').status_code, 404)
        self.assertEqual(heartbeat(operator_credential, 'c1').status_code, 404)
        self.assertEqual(heartbeat(self.gateway, 'nope').status_code, 404)
        self.assertIsNone(AstroliftCluster.objects.get(external_id='c1').last_seen_at)

    def test_a_heartbeat_needs_a_live_gateway_credential(self):
        revoke(self.credential, 'c1')

        self.assertEqual(heartbeat(self.gateway, 'c1').status_code, 401)
        self.assertEqual(APIClient().post(
            reverse('zentinelle:astrolift-cluster-heartbeat', kwargs={'cluster_id': 'c1'}),
            {'status': 'healthy'}, format='json').status_code, 401)
        # The install credential is not a gateway's.
        self.assertEqual(as_install(self.credential).post(
            reverse('zentinelle:astrolift-cluster-heartbeat', kwargs={'cluster_id': 'c1'}),
            {'status': 'healthy'}, format='json').status_code, 401)

    def test_an_unknown_status_is_refused(self):
        self.assertEqual(heartbeat(self.gateway, 'c1', status='unknown').status_code, 400)


class AdoptionTests(TestCase):
    """The #387 note: a cluster record is linked to the operator's registration by cluster_id."""

    def setUp(self):
        self.agent_a = make_agent(TENANT_A, 'agent-a')
        store_key(TENANT_A, KEY_A)
        self.credential, self.install = connect_install([TENANT_A, TENANT_B])

    def test_a_manual_registration_within_scope_is_adopted_and_keeps_working_while_it_rolls(self):
        manual = GatewayRegistration.objects.create(name='prod-gw', cluster_id='prod-1', tenant_ids=[TENANT_A])
        manual_credential, _ = GatewayCredential.mint(manual)

        response = register(self.credential, 'prod-1')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['gateway']['name'], 'prod-gw')
        manual.refresh_from_db()
        self.assertEqual(manual.astrolift_cluster.external_id, 'prod-1')
        self.assertEqual(manual.tenant_ids, [TENANT_A, TENANT_B])
        self.assertEqual(provider_key(self.agent_a, manual_credential).status_code, 200)
        self.assertIsNotNone(GatewayCredential.objects.get(key_prefix=manual_credential[:19]).expires_at)
        self.assertEqual(provider_key(self.agent_a, response.json()['gateway']['credential']).status_code, 200)
        self.assertEqual(GatewayRegistration.objects.count(), 1)

    def test_a_manual_registration_serving_other_tenants_is_left_alone(self):
        # A matching string is not ownership: cluster ids are not namespaced.
        manual = GatewayRegistration.objects.create(name='theirs', cluster_id='prod-1', tenant_ids=[TENANT_C])
        manual_credential, _ = GatewayCredential.mint(manual)

        response = register(self.credential, 'prod-1')

        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.json()['gateway']['name'], 'theirs')
        manual.refresh_from_db()
        self.assertIsNone(manual.astrolift_cluster)
        self.assertEqual(manual.tenant_ids, [TENANT_C])
        self.assertIsNone(GatewayCredential.objects.get(key_prefix=manual_credential[:19]).expires_at)


class AuditAndSecrecyTests(TestCase):
    def test_every_change_is_audited_per_tenant_and_no_secret_is_audited_or_logged(self):
        with self.assertLogs('zentinelle', level='DEBUG') as logs:
            code, _ = issue_enrollment_code([TENANT_A, TENANT_B], 'admin')
            response = connect(code)
            install_credential = response.json()['credential']
            first = register(install_credential, 'c1').json()['gateway']['credential']
            second = rotate(install_credential, 'c1').json()['gateway']['credential']
            heartbeat(second, 'c1')
            revoke(install_credential, 'c1')
            as_install(install_credential).delete(reverse('zentinelle:astrolift-install'))

        actions = list(AuditLog.objects.filter(tenant_id=TENANT_A).order_by('chain_sequence').values_list(
            'action', flat=True))
        self.assertEqual(actions, [
            'astrolift.enrollment_code.created', 'astrolift.install.connected', 'astrolift.cluster.registered',
            'astrolift.cluster.rotated', 'astrolift.cluster.revoked', 'astrolift.install.disconnected',
        ])
        self.assertEqual(AuditLog.objects.filter(tenant_id=TENANT_B).count(), len(actions))
        self.assertFalse(AuditLog.objects.exclude(tenant_id__in=[TENANT_A, TENANT_B]).exists())

        recorded = audit_text()
        logged = '\n'.join(logs.output)
        for secret in (code, install_credential, first, second):
            self.assertNotIn(secret, recorded)
            self.assertNotIn(secret, logged)

    def test_a_refused_connect_writes_nothing(self):
        connect('zen_enroll_' + 'y' * 32)

        self.assertFalse(AuditLog.objects.exists())


@override_settings(AUTH_MODE='local')
class PortalTests(TestCase):
    @staticmethod
    def as_portal(username, role):
        user = get_user_model().objects.create_user(username=username, password='test-only-pass')
        assign_role(user, role)
        client = APIClient()
        client.force_login(user)
        return client, user

    def setUp(self):
        self.admin, self.admin_user = self.as_portal('admin', ROLE_ADMIN)

    def test_an_admin_generates_a_code_for_their_tenant_shown_once(self):
        response = self.admin.post(reverse('zentinelle:astrolift-enrollment-codes'), {}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response['Cache-Control'], 'no-store')
        body = response.json()
        self.assertEqual(body['tenant_ids'], [STANDALONE_TENANT_ID])
        record = EnrollmentCode.objects.get()
        self.assertEqual(record.created_by, 'admin')
        self.assertEqual(record.code_hash, hashlib.sha256(body['code'].encode()).hexdigest())
        entry = AuditLog.objects.get(action='astrolift.enrollment_code.created')
        self.assertEqual((entry.tenant_id, entry.ext_user_id), (STANDALONE_TENANT_ID, str(self.admin_user.pk)))
        self.assertNotIn(body['code'], audit_text())
        # And it connects.
        self.assertEqual(connect(body['code']).status_code, 201)

    def test_the_code_lifetime_is_bounded(self):
        for ttl in (0, 61):
            with self.subTest(ttl=ttl):
                response = self.admin.post(reverse('zentinelle:astrolift-enrollment-codes'),
                                           {'ttl_minutes': ttl}, format='json')
                self.assertEqual(response.status_code, 400)
        self.assertFalse(EnrollmentCode.objects.exists())

    def test_only_admins_manage_astrolift(self):
        operator, _ = self.as_portal('operator', ROLE_OPERATOR)
        _, install = connect_install([STANDALONE_TENANT_ID])

        refused = [
            operator.get(reverse('zentinelle:astrolift-settings')),
            operator.post(reverse('zentinelle:astrolift-enrollment-codes'), {}, format='json'),
            operator.delete(reverse('zentinelle:astrolift-install-admin', kwargs={'install_id': install.id})),
            APIClient().get(reverse('zentinelle:astrolift-settings')),
        ]

        for response in refused:
            self.assertIn(response.status_code, (401, 403))
        self.assertFalse(EnrollmentCode.objects.filter(install__isnull=True).exists())
        install.refresh_from_db()
        self.assertTrue(install.is_active)

    def test_the_list_shows_the_installs_serving_this_tenant_with_their_clusters(self):
        mine_credential, mine = connect_install([STANDALONE_TENANT_ID], name='mine')
        register(mine_credential, 'c1', provider='aws', region='eu-west-1')
        connect_install([TENANT_B], name='someone-elses')

        response = self.admin.get(reverse('zentinelle:astrolift-settings'))

        self.assertEqual(response.status_code, 200)
        installs = response.json()['installs']
        self.assertEqual([i['name'] for i in installs], ['mine'])
        self.assertEqual(installs[0]['status'], 'connected')
        cluster = installs[0]['clusters'][0]
        self.assertEqual((cluster['cluster_id'], cluster['provider'], cluster['status']), ('c1', 'aws', 'pending'))
        self.assertEqual(cluster['tenant_ids'], [STANDALONE_TENANT_ID])
        self.assertNotIn('credential', json.dumps(installs))

    def test_an_admin_revokes_a_cluster_and_disconnects_an_install(self):
        agent = make_agent(STANDALONE_TENANT_ID, 'agent')
        store_key(STANDALONE_TENANT_ID, KEY_A)
        install_credential, install = connect_install([STANDALONE_TENANT_ID])
        gateway = register(install_credential, 'c1').json()['gateway']['credential']
        cluster = AstroliftCluster.objects.get(external_id='c1')

        revoked = self.admin.delete(reverse('zentinelle:astrolift-cluster-admin', kwargs={'cluster_id': cluster.id}))
        disconnected = self.admin.delete(
            reverse('zentinelle:astrolift-install-admin', kwargs={'install_id': install.id}))

        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(revoked.json()['cluster']['status'], 'revoked')
        self.assertEqual(provider_key(agent, gateway).status_code, 401)
        self.assertEqual(disconnected.status_code, 200)
        self.assertEqual(disconnected.json()['install']['status'], 'disconnected')
        self.assertEqual(register(install_credential, 'c2').status_code, 401)
        for action in ('astrolift.cluster.revoked', 'astrolift.install.disconnected'):
            entry = AuditLog.objects.get(action=action)
            self.assertEqual(entry.ext_user_id, str(self.admin_user.pk))
            self.assertEqual(entry.metadata['via'], 'portal')

    def test_installs_of_other_tenants_are_not_found(self):
        other_credential, other = connect_install([TENANT_B])
        register(other_credential, 'c1')
        cluster = AstroliftCluster.objects.get(install=other)

        self.assertEqual(self.admin.delete(
            reverse('zentinelle:astrolift-install-admin', kwargs={'install_id': other.id})).status_code, 404)
        self.assertEqual(self.admin.delete(
            reverse('zentinelle:astrolift-cluster-admin', kwargs={'cluster_id': cluster.id})).status_code, 404)
        other.refresh_from_db()
        cluster.refresh_from_db()
        self.assertTrue(other.is_active and cluster.is_active)


class CommandTests(TestCase):
    def test_the_command_prints_a_working_code_once(self):
        out = io.StringIO()
        call_command('astrolift_enrollment_code', '--tenant', TENANT_A, '--tenant', TENANT_B, stdout=out)

        code = next(line.split(': ', 1)[1].strip() for line in out.getvalue().splitlines()
                    if line.startswith('Enrollment code:'))
        record = EnrollmentCode.objects.get()
        self.assertEqual(record.tenant_ids, [TENANT_A, TENANT_B])
        self.assertEqual(record.created_by, 'manage.py')
        self.assertEqual(connect(code).status_code, 201)

    def test_plain_output_is_the_code_alone(self):
        out = io.StringIO()
        call_command('astrolift_enrollment_code', '--tenant', TENANT_A, '--plain', stdout=out)

        code = out.getvalue().strip()
        self.assertTrue(code.startswith('zen_enroll_'))
        self.assertEqual(EnrollmentCode.objects.get().code_hash, hashlib.sha256(code.encode()).hexdigest())

    def test_the_command_refuses_a_bad_lifetime_or_an_empty_tenant(self):
        for args in (['--tenant', TENANT_A, '--ttl-minutes', '0'], ['--tenant', TENANT_A, '--ttl-minutes', '61'],
                     ['--tenant', ' ']):
            with self.subTest(args=args), self.assertRaises(CommandError):
                call_command('astrolift_enrollment_code', *args, stdout=io.StringIO())
        self.assertFalse(EnrollmentCode.objects.exists())

    def test_revoking_an_astrolift_gateway_by_hand_revokes_its_cluster(self):
        credential, _ = connect_install([TENANT_A])
        register(credential, 'c1')
        registration = GatewayRegistration.objects.get(cluster_id='c1')

        call_command('gateway_credential', 'revoke', registration.name, stdout=io.StringIO())

        self.assertEqual(AstroliftCluster.objects.get(external_id='c1').status, 'revoked')
        entry = AuditLog.objects.get(action='astrolift.cluster.revoked')
        self.assertEqual(entry.metadata['via'], 'manage.py')

    def test_list_does_not_show_an_expired_credential_as_live(self):
        credential, _ = connect_install([TENANT_A])
        old = register(credential, 'c1').json()['gateway']['credential']
        rotate(credential, 'c1')
        GatewayCredential.objects.filter(key_prefix=old[:19]).update(expires_at=timezone.now() - timedelta(seconds=1))

        out = io.StringIO()
        call_command('gateway_credential', 'list', stdout=out)

        self.assertNotIn(old[:19], out.getvalue())
        self.assertEqual(out.getvalue().count('sk_gateway_'), 1)
