"""
Manage bootstrap tokens for agent registration.

Usage:
    python manage.py bootstrap_token generate <tenant_id> [--label "..."] [--expires-in 30d]
    python manage.py bootstrap_token list [<tenant_id>]
    python manage.py bootstrap_token revoke <token_prefix>
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from zentinelle.models.bootstrap_token import BootstrapToken


class Command(BaseCommand):
    help = 'Manage bootstrap tokens for agent registration'

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest='action')

        gen = sub.add_parser('generate')
        gen.add_argument('tenant_id')
        gen.add_argument('--label', default='')
        gen.add_argument('--expires-in', dest='expires_in', default=None,
                         help='Expiry duration: 30d, 24h, etc.')

        ls = sub.add_parser('list')
        ls.add_argument('tenant_id', nargs='?', default=None)

        rev = sub.add_parser('revoke')
        rev.add_argument('token_prefix')

    def handle(self, *args, **options):
        action = options.get('action')
        if action == 'generate':
            self._generate(options)
        elif action == 'list':
            self._list(options)
        elif action == 'revoke':
            self._revoke(options)
        else:
            self.stderr.write('Usage: bootstrap_token {generate|list|revoke}')

    def _generate(self, options):
        expires_at = None
        if options['expires_in']:
            expires_at = timezone.now() + self._parse_duration(options['expires_in'])

        token_string, record = BootstrapToken.generate(
            tenant_id=options['tenant_id'],
            label=options['label'],
            expires_at=expires_at,
        )

        self.stdout.write(f'\nToken: {token_string}')
        self.stdout.write(f'Tenant: {record.tenant_id}')
        self.stdout.write(f'Prefix: {record.token_prefix}')
        if expires_at:
            self.stdout.write(f'Expires: {expires_at.isoformat()}')
        self.stdout.write('\nStore this token securely — it cannot be retrieved again.\n')

    def _list(self, options):
        qs = BootstrapToken.objects.all()
        if options.get('tenant_id'):
            qs = qs.filter(tenant_id=options['tenant_id'])

        if not qs.exists():
            self.stdout.write('No tokens found.')
            return

        self.stdout.write(f'{"PREFIX":<16} {"TENANT":<40} {"STATUS":<10} {"USES":<6} {"LABEL"}')
        self.stdout.write('-' * 90)
        for t in qs:
            status = 'active' if t.is_valid else ('revoked' if t.revoked else 'expired')
            self.stdout.write(f'{t.token_prefix:<16} {t.tenant_id:<40} {status:<10} {t.use_count:<6} {t.label}')

    def _revoke(self, options):
        prefix = options['token_prefix']
        tokens = BootstrapToken.objects.filter(token_prefix__startswith=prefix, revoked=False)
        count = tokens.update(revoked=True)
        if count:
            self.stdout.write(f'Revoked {count} token(s) matching prefix "{prefix}".')
        else:
            self.stderr.write(f'No active tokens found with prefix "{prefix}".')

    @staticmethod
    def _parse_duration(s):
        s = s.strip().lower()
        if s.endswith('d'):
            return timedelta(days=int(s[:-1]))
        if s.endswith('h'):
            return timedelta(hours=int(s[:-1]))
        if s.endswith('m'):
            return timedelta(minutes=int(s[:-1]))
        return timedelta(days=int(s))
