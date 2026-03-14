"""
Management command to setup Zentinelle.

Handles:
- Loading AI Provider fixtures
- Setting up Celery Beat periodic tasks
"""
import json
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Setup Zentinelle: load AI provider fixtures and configure periodic tasks'

    def add_arguments(self, parser):
        parser.add_argument(
            '--providers-only',
            action='store_true',
            help='Only load AI provider fixtures',
        )
        parser.add_argument(
            '--tasks-only',
            action='store_true',
            help='Only setup periodic tasks',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force update existing records',
        )

    def handle(self, *args, **options):
        providers_only = options.get('providers_only', False)
        tasks_only = options.get('tasks_only', False)
        force = options.get('force', False)

        if not providers_only and not tasks_only:
            # Do both
            self.load_ai_providers(force)
            self.setup_periodic_tasks(force)
        elif providers_only:
            self.load_ai_providers(force)
        elif tasks_only:
            self.setup_periodic_tasks(force)

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

    def setup_periodic_tasks(self, force: bool = False):
        """Setup Celery Beat periodic tasks."""
        from django_celery_beat.models import PeriodicTask, IntervalSchedule, CrontabSchedule

        self.stdout.write('Setting up periodic tasks...')

        # Create schedules
        every_15_minutes, _ = IntervalSchedule.objects.get_or_create(
            every=15,
            period=IntervalSchedule.MINUTES,
        )

        every_hour, _ = IntervalSchedule.objects.get_or_create(
            every=1,
            period=IntervalSchedule.HOURS,
        )

        # Daily at 2 AM
        daily_2am, _ = CrontabSchedule.objects.get_or_create(
            minute='0',
            hour='2',
            day_of_week='*',
            day_of_month='*',
            month_of_year='*',
        )

        # Daily at 3 AM
        daily_3am, _ = CrontabSchedule.objects.get_or_create(
            minute='0',
            hour='3',
            day_of_week='*',
            day_of_month='*',
            month_of_year='*',
        )

        # Weekly on Sunday at 4 AM
        weekly_sunday, _ = CrontabSchedule.objects.get_or_create(
            minute='0',
            hour='4',
            day_of_week='0',
            day_of_month='*',
            month_of_year='*',
        )

        # Define tasks
        tasks = [
            {
                'name': 'zentinelle.run_daily_usage_sync',
                'task': 'zentinelle.tasks.managed_keys.run_daily_usage_sync',
                'crontab': daily_2am,
                'description': 'Sync usage from AI providers daily',
            },
            {
                'name': 'zentinelle.check_keys_for_rotation',
                'task': 'zentinelle.tasks.managed_keys.check_keys_for_rotation',
                'crontab': daily_3am,
                'description': 'Check and rotate expiring API keys',
            },
            {
                'name': 'zentinelle.check_budget_limits',
                'task': 'zentinelle.tasks.alerts.check_budget_limits',
                'interval': every_hour,
                'description': 'Check budget limits and create alerts',
            },
            {
                'name': 'zentinelle.check_data_source_health',
                'task': 'zentinelle.tasks.data_sources.check_data_source_health',
                'interval': every_15_minutes,
                'description': 'Health check for active data sources',
            },
            {
                'name': 'zentinelle.cleanup_old_events',
                'task': 'zentinelle.tasks.scheduled.cleanup_old_events',
                'crontab': weekly_sunday,
                'description': 'Cleanup old events and audit logs',
            },
            {
                'name': 'zentinelle.cleanup_expired_keys',
                'task': 'zentinelle.tasks.managed_keys.cleanup_expired_keys',
                'crontab': daily_3am,
                'description': 'Revoke expired managed API keys',
            },
            {
                'name': 'zentinelle.check_endpoint_health',
                'task': 'zentinelle.tasks.scheduled.check_endpoint_health',
                'interval': every_15_minutes,
                'description': 'Health check for active endpoints',
            },
            # Billing syncs
            {
                'name': 'zentinelle.send_usage_to_stripe',
                'task': 'zentinelle.tasks.billing.send_usage_to_stripe',
                'interval': every_hour,
                'description': 'Send pending usage aggregates to Stripe billing meters',
            },
            # Infrastructure cost tasks moved to deployments.tasks.infrastructure
            # Disabled pending model implementation (CloudAccountConfig, InfrastructureCost, etc.)
        ]

        created = 0
        updated = 0

        for task_def in tasks:
            name = task_def['name']
            defaults = {
                'task': task_def['task'],
                'enabled': True,
                'description': task_def.get('description', ''),
            }

            if 'interval' in task_def:
                defaults['interval'] = task_def['interval']
                defaults['crontab'] = None
            elif 'crontab' in task_def:
                defaults['crontab'] = task_def['crontab']
                defaults['interval'] = None

            if force:
                task, was_created = PeriodicTask.objects.update_or_create(
                    name=name,
                    defaults=defaults,
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
            else:
                task, was_created = PeriodicTask.objects.get_or_create(
                    name=name,
                    defaults=defaults,
                )
                if was_created:
                    created += 1

        self.stdout.write(
            f'  Created {created} tasks, updated {updated}'
        )
