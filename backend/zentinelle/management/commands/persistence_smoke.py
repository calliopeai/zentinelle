"""Run a read-only post-deploy persistence smoke check."""

import json

from django.core.management.base import BaseCommand, CommandError
from django.db import connections

from zentinelle.management.commands.persistence_check import \
    tenant_filter_kwargs
from zentinelle.models import AgentEndpoint, Event, Policy, PolicyRevision


class Command(BaseCommand):
    help = 'Verify routed persistence tables and tenant-scoped queries.'

    def add_arguments(self, parser):
        parser.add_argument('--tenant-id', required=True)
        parser.add_argument('--json', action='store_true', dest='as_json')

    def handle(self, *args, **options):
        tenant_id = options['tenant_id']
        checks = {}
        errors = []
        for alias, models in {
            'zentinelle': {
                'policies': Policy,
                'policy_revisions': PolicyRevision,
                'events': Event,
                'agent_endpoints': AgentEndpoint,
            },
        }.items():
            connection = connections[alias]
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SET statement_timeout = 5000')
                    tables = set(connection.introspection.table_names())
                alias_checks = {}
                for name, model in models.items():
                    table = model._meta.db_table
                    if table not in tables:
                        alias_checks[name] = {'ok': False, 'error': 'table missing'}
                        errors.append(f'{alias}.{name}: table missing')
                        continue
                    try:
                        count = model.objects.using(alias).filter(
                            **tenant_filter_kwargs(name, tenant_id)).count()
                        alias_checks[name] = {'ok': True, 'tenant_count': count}
                    except Exception as exc:  # pragma: no cover
                        alias_checks[name] = {
                            'ok': False,
                            'error': f'{type(exc).__name__}: {exc}',
                        }
                        errors.append(f'{alias}.{name}: {type(exc).__name__}')
                checks[alias] = alias_checks
            except Exception as exc:  # pragma: no cover
                checks[alias] = {
                    'ok': False,
                    'error': f'{type(exc).__name__}: {exc}',
                }
                errors.append(f'{alias}: {type(exc).__name__}')

        report = {
            'tenant_id': tenant_id,
            'ok': not errors,
            'checks': checks,
            'errors': errors,
        }
        output = json.dumps(report, sort_keys=True)
        self.stdout.write(output if options['as_json'] else json.dumps(
            report, indent=2, sort_keys=True))
        if errors:
            raise CommandError('Persistence smoke failed')
