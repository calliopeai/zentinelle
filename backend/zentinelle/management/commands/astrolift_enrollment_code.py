"""
Generate a one-time code that connects an Astrolift install (#389).

Usage:
    python manage.py astrolift_enrollment_code --tenant <id> [--tenant <id> ...] [--ttl-minutes 15] [--plain]

Give the code to an Astrolift admin with this Zentinelle's URL. Astrolift
exchanges it once, within its lifetime (15 minutes unless --ttl-minutes says
otherwise, at most 60), for its own credential; the install may then serve
the tenants named here and no others. The code is printed once and only its
hash is stored. --plain prints the code alone, for a pipe.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError

from zentinelle.services.astrolift_clusters import issue_enrollment_code


class Command(BaseCommand):
    help = 'Generate a one-time code that connects an Astrolift install'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', action='append', required=True, dest='tenants',
                            help='A tenant the install may serve; repeat for more')
        parser.add_argument('--ttl-minutes', type=int, default=15, help='How long the code works (1 to 60)')
        parser.add_argument('--plain', action='store_true', help='Print only the code')

    def handle(self, *args, **options):
        tenants = []
        for value in options['tenants']:
            tenant = value.strip()
            if not tenant:
                raise CommandError('A tenant id cannot be empty')
            if tenant not in tenants:
                tenants.append(tenant)
        try:
            plaintext, record = issue_enrollment_code(
                tenants, 'manage.py', ttl=timedelta(minutes=options['ttl_minutes']), actor_id='manage.py')
        except ValueError as exc:
            raise CommandError(str(exc))

        if options['plain']:
            self.stdout.write(plaintext)
            return
        self.stdout.write(f'Enrollment code: {plaintext}')
        self.stdout.write(f'Tenants:         {", ".join(record.tenant_ids)}')
        self.stdout.write(f'Expires:         {record.expires_at.isoformat()}')
        self.stdout.write('\nPaste it into Astrolift with this Zentinelle\'s URL. It works once and cannot be '
                          'retrieved again.')
