"""
Let a bootstrap token re-register (restart) agents made before that was recorded.

Only agents the bootstrap /register path created may be re-registered with a
bootstrap token. Agents registered before migration 0066 carry no record of how
they were made, so they are refused until an operator names them here.

Usage:
    python manage.py allow_bootstrap_reregister --tenant <tenant_id> <agent_id> [<agent_id> ...]
"""
from django.core.management.base import BaseCommand, CommandError

from zentinelle.models import AgentEndpoint


class Command(BaseCommand):
    help = 'Allow a bootstrap token to re-register the named agents of one tenant'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', required=True, help='Tenant ID the agents belong to')
        parser.add_argument('agent_ids', nargs='+', help='agent_id of each agent to allow')

    def handle(self, *args, **options):
        agents = AgentEndpoint.objects.filter(tenant_id=options['tenant'], agent_id__in=options['agent_ids'])
        found = set(agents.values_list('agent_id', flat=True))
        missing = sorted(set(options['agent_ids']) - found)
        if missing:
            raise CommandError(f"Not in tenant {options['tenant']}: {', '.join(missing)}")
        # Astrolift-minted agents and agents with an operator-set lifetime stay
        # refused by /register whatever this flag says.
        agents.update(bootstrap_registered=True)
        self.stdout.write(self.style.SUCCESS(f'Allowed bootstrap re-register for {len(found)} agent(s)'))
