"""
Create an agent endpoint for JunoHub and output the API key.

Usage:
    python manage.py create_junohub_endpoint
    python manage.py create_junohub_endpoint --rotate
    python manage.py create_junohub_endpoint --key-hash "$2b$..." --key-prefix "sk_agent_xxx"
"""
from django.core.management.base import BaseCommand
from organization.models import Organization
from zentinelle.models import AgentEndpoint


class Command(BaseCommand):
    help = 'Create JunoHub agent endpoint and output API key'

    def add_arguments(self, parser):
        parser.add_argument('--org-slug', default='calliopeai')
        parser.add_argument('--agent-id', default='junohub-dev')
        parser.add_argument('--name', default='JunoHub Dev')
        parser.add_argument('--rotate', action='store_true', help='Rotate existing key')
        parser.add_argument('--key-hash', help='Pre-generated bcrypt key hash')
        parser.add_argument('--key-prefix', help='Pre-generated key prefix (first 12 chars)')
        parser.add_argument('--hub-url', default='https://dev.calliope.ai')

    def handle(self, *args, **options):
        org_slug = options['org_slug']
        agent_id = options['agent_id']
        name = options['name']

        try:
            org = Organization.objects.get(slug=org_slug)
        except Organization.DoesNotExist:
            self.stderr.write(self.style.ERROR(f"Organization '{org_slug}' not found"))
            return

        existing = AgentEndpoint.objects.filter(agent_id=agent_id).first()

        if existing:
            if options['rotate']:
                new_key = existing.rotate_api_key()
                self.stdout.write(f"ZENTINELLE_API_KEY={new_key}")
            elif options['key_hash'] and options['key_prefix']:
                # Update with pre-generated hash
                existing.api_key_hash = options['key_hash']
                existing.api_key_prefix = options['key_prefix']
                existing.save(update_fields=['api_key_hash', 'api_key_prefix', 'updated_at'])
                self.stdout.write(self.style.SUCCESS(
                    f"Updated endpoint '{agent_id}' with pre-generated key"
                ))
            else:
                self.stderr.write(self.style.WARNING(
                    f"Endpoint '{agent_id}' already exists. Use --rotate to generate new key."
                ))
                self.stdout.write(f"PREFIX={existing.api_key_prefix}")
        else:
            # Use pre-generated hash if provided, otherwise generate new key
            if options['key_hash'] and options['key_prefix']:
                key_hash = options['key_hash']
                key_prefix = options['key_prefix']
                api_key = None
            else:
                api_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()

            AgentEndpoint.objects.create(
                organization=org,
                agent_id=agent_id,
                name=name,
                agent_type='jupyterhub',
                api_key_hash=key_hash,
                api_key_prefix=key_prefix,
                status=AgentEndpoint.Status.ACTIVE,
                health=AgentEndpoint.Health.UNKNOWN,
                capabilities=['spawn_lab', 'manage_users', 'ai_gateway'],
                metadata={
                    'hub_url': options['hub_url'],
                    'environment': 'development' if 'dev' in options['hub_url'] else 'production',
                },
                config={
                    'heartbeat_interval_seconds': 60,
                    'event_batch_size': 100,
                },
            )

            if api_key:
                self.stdout.write(f"ZENTINELLE_API_KEY={api_key}")
            else:
                self.stdout.write(self.style.SUCCESS(
                    f"Created endpoint '{agent_id}' with pre-generated key"
                ))
