"""
Register gateways and manage their credentials (#380).

Each gateway, one per cluster that runs agents, is registered with the tenants
it may read stored provider keys for and holds its own credential. A plaintext
credential is printed once, when it is minted, and cannot be retrieved again.

Usage:
    python manage.py gateway_credential register <name> --tenant <id> [--tenant <id> ...] [--cluster <id>] [--plain]
    python manage.py gateway_credential mint <name> [--plain]       # another credential, to rotate
    python manage.py gateway_credential scope <name> --tenant <id> [--tenant <id> ...]
    python manage.py gateway_credential list
    python manage.py gateway_credential revoke <name> [--credential <prefix>]

--plain prints the credential alone, for a pipe into a secret store:

    kubectl create secret generic zentinelle-gateway-credential -n zentinelle \\
      --from-literal=credential="$(python manage.py gateway_credential register ... --plain)"

The `local` gateway belongs to the backend, which registers it for a compose
install's shared volume, so it cannot be registered or minted for here.
Revoking the gateway of an Astrolift cluster (#389) revokes the cluster too, so
the install sees it revoked.
"""
from django.core.management.base import BaseCommand, CommandError

from zentinelle.auth.gateway_credential import LOCAL_GATEWAY_NAME
from zentinelle.models import GatewayCredential, GatewayRegistration
from zentinelle.services.astrolift_clusters import revoke_cluster


class Command(BaseCommand):
    help = 'Register gateways and manage their credentials'

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest='action', required=True)

        register = sub.add_parser('register', help='Register a gateway and mint its first credential')
        register.add_argument('name')
        register.add_argument('--tenant', action='append', required=True, dest='tenants')
        register.add_argument('--cluster', default='', help='The cluster id the gateway sends as X-Zentinelle-Cluster')
        register.add_argument('--plain', action='store_true', help='Print only the credential')

        mint = sub.add_parser('mint', help='Mint another credential for a gateway, to rotate')
        mint.add_argument('name')
        mint.add_argument('--plain', action='store_true', help='Print only the credential')

        scope = sub.add_parser('scope', help='Replace the tenants a gateway serves')
        scope.add_argument('name')
        scope.add_argument('--tenant', action='append', required=True, dest='tenants')

        sub.add_parser('list', help='List gateways, their tenants and live credential prefixes')

        revoke = sub.add_parser('revoke', help='Revoke a gateway, or one of its credentials')
        revoke.add_argument('name')
        revoke.add_argument('--credential', default='', help='Prefix of the one credential to revoke')

    def handle(self, *args, **options):
        getattr(self, f'_{options["action"]}')(options)

    def _register(self, options):
        name = options['name'].strip()
        if not name:
            raise CommandError('A gateway needs a name')
        if name == LOCAL_GATEWAY_NAME:
            raise CommandError(f'"{LOCAL_GATEWAY_NAME}" is the backend\'s own compose gateway; pick another name')
        if GatewayRegistration.objects.filter(name=name).exists():
            raise CommandError(f'Gateway "{name}" is already registered: use mint for another credential, or scope')
        registration = GatewayRegistration.objects.create(
            name=name, cluster_id=options['cluster'].strip(), tenant_ids=self._tenants(options['tenants']))
        plaintext, credential = GatewayCredential.mint(registration)
        self._print_credential(registration, credential, plaintext, options['plain'])

    def _mint(self, options):
        registration = self._active(options['name'])
        if registration.name == LOCAL_GATEWAY_NAME:
            raise CommandError(f'"{LOCAL_GATEWAY_NAME}" credentials are minted by the backend into its shared volume')
        plaintext, credential = GatewayCredential.mint(registration)
        self._print_credential(registration, credential, plaintext, options['plain'])

    def _scope(self, options):
        registration = self._active(options['name'])
        registration.tenant_ids = self._tenants(options['tenants'])
        registration.save(update_fields=['tenant_ids', 'updated_at'])
        self.stdout.write(f'Gateway "{registration.name}" now serves: {", ".join(registration.tenant_ids)}')

    def _list(self, options):
        registrations = GatewayRegistration.objects.prefetch_related('credentials')
        if not registrations:
            self.stdout.write('No gateways registered.')
            return
        for registration in registrations:
            live = [c.key_prefix for c in registration.credentials.all() if c.is_live]
            self.stdout.write(
                f'{registration.name}  {"active" if registration.is_active else "revoked"}  '
                f'cluster={registration.cluster_id or "-"}  '
                f'tenants={",".join(registration.tenant_ids) or "-"}  '
                f'credentials={",".join(live) or "-"}')

    def _revoke(self, options):
        registration = self._get(options['name'])
        if options['credential']:
            credential = registration.credentials.filter(
                key_prefix=options['credential'], revoked_at__isnull=True).first()
            if credential is None:
                raise CommandError(f'No live credential {options["credential"]} on gateway "{registration.name}"')
            credential.revoke()
            self.stdout.write(f'Revoked credential {credential.key_prefix} of gateway "{registration.name}".')
            return
        if registration.astrolift_cluster_id and registration.is_active:
            cluster = revoke_cluster(registration.astrolift_cluster, actor_id='manage.py', via='manage.py')
            self.stdout.write(f'Revoked gateway "{registration.name}" and Astrolift cluster {cluster.external_id}: '
                              'none of its credentials work any more.')
            return
        registration.revoke()
        self.stdout.write(f'Revoked gateway "{registration.name}": none of its credentials work any more.')

    def _get(self, name):
        registration = GatewayRegistration.objects.filter(name=name).first()
        if registration is None:
            raise CommandError(f'No gateway named "{name}"')
        return registration

    def _active(self, name):
        registration = self._get(name)
        if not registration.is_active:
            raise CommandError(f'Gateway "{name}" is revoked')
        return registration

    @staticmethod
    def _tenants(values):
        tenants = []
        for value in values:
            tenant = value.strip()
            if not tenant:
                raise CommandError('A tenant id cannot be empty')
            if tenant not in tenants:
                tenants.append(tenant)
        return tenants

    def _print_credential(self, registration, credential, plaintext, plain):
        if plain:
            self.stdout.write(plaintext)
            return
        self.stdout.write(f'Gateway:    {registration.name}')
        self.stdout.write(f'Cluster:    {registration.cluster_id or "-"}')
        self.stdout.write(f'Tenants:    {", ".join(registration.tenant_ids) or "-"}')
        self.stdout.write(f'Credential: {plaintext}')
        self.stdout.write(f'Prefix:     {credential.key_prefix}')
        self.stdout.write('\nGive it to the gateway as ZENTINELLE_GATEWAY_CREDENTIAL or in its credential '
                          'file. It cannot be retrieved again.')
