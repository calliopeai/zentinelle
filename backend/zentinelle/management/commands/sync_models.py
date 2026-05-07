"""
Sync AI model registry from provider APIs.

Usage:
    python manage.py sync_models              # all providers
    python manage.py sync_models openai       # specific provider
"""
from django.core.management.base import BaseCommand

from zentinelle.services.model_sync import sync_all_providers, sync_provider


class Command(BaseCommand):
    help = 'Sync AI model registry from provider APIs'

    def add_arguments(self, parser):
        parser.add_argument('provider', nargs='?', default=None)

    def handle(self, *args, **options):
        provider = options.get('provider')

        if provider:
            count = sync_provider(provider)
            self.stdout.write(f'Synced {count} models from {provider}')
        else:
            results = sync_all_providers()
            for slug, count in results.items():
                self.stdout.write(f'{slug}: {count}')
