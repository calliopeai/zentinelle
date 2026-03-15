"""
Management command to seed AI model fixtures.

Requires AI provider fixtures to be loaded first (via setup_sentinel).
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Seed AI model registry with default models from MODEL_FIXTURES'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force update existing records',
        )

    def handle(self, *args, **options):
        from zentinelle.models import AIProvider
        from zentinelle.models.model_registry import AIModel, MODEL_FIXTURES

        force = options.get('force', False)
        created = 0
        skipped = 0
        missing_providers = set()

        for data in MODEL_FIXTURES:
            data = dict(data)
            provider_slug = data.pop('provider_slug')
            provider = AIProvider.objects.filter(slug=provider_slug).first()
            if not provider:
                missing_providers.add(provider_slug)
                continue

            if force:
                _, was_created = AIModel.objects.update_or_create(
                    provider=provider,
                    model_id=data['model_id'],
                    defaults={**data, 'is_global': True},
                )
            else:
                _, was_created = AIModel.objects.get_or_create(
                    provider=provider,
                    model_id=data['model_id'],
                    defaults={**data, 'is_global': True},
                )

            if was_created:
                created += 1
            else:
                skipped += 1

        if missing_providers:
            self.stdout.write(self.style.WARNING(
                f'  Skipped models for missing providers: {", ".join(missing_providers)}'
            ))
            self.stdout.write(self.style.WARNING(
                '  Run: python manage.py setup_sentinel --providers-only'
            ))

        self.stdout.write(self.style.SUCCESS(
            f'Done: {created} models created, {skipped} already existed.'
        ))
