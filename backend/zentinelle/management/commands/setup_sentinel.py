"""
Management command to setup Zentinelle.

Handles:
- Loading AI Provider fixtures

Periodic tasks are not seeded here. The Celery Beat schedule is declared in
config.settings.base.CELERY_BEAT_SCHEDULE and needs no database records.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Setup Zentinelle: load AI provider fixtures'

    def add_arguments(self, parser):
        parser.add_argument(
            '--providers-only',
            action='store_true',
            help='Only load AI provider fixtures',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force update existing records',
        )

    def handle(self, *args, **options):
        self.load_ai_providers(options.get('force', False))

        self.stdout.write(self.style.SUCCESS('Zentinelle setup complete!'))

    def load_ai_providers(self, force: bool = False):
        """Load AI Provider fixtures."""
        from zentinelle.models import AIProvider
        from zentinelle.models.ai_provider import PROVIDER_FIXTURES

        self.stdout.write('Loading AI Provider fixtures...')

        created = 0
        updated = 0

        for fixture in PROVIDER_FIXTURES:
            slug = fixture['slug']

            if force:
                provider, was_created = AIProvider.objects.update_or_create(
                    slug=slug,
                    defaults=fixture,
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
            else:
                provider, was_created = AIProvider.objects.get_or_create(
                    slug=slug,
                    defaults=fixture,
                )
                if was_created:
                    created += 1

        self.stdout.write(
            f'  Created {created} providers, updated {updated}'
        )
