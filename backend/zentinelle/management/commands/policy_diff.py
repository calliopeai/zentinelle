"""
Management command: policy_diff

Compare YAML-defined policies against the current database state.

Usage:
    python manage.py policy_diff ./policies/ --tenant myorg
"""
import os

import yaml
from django.core.management.base import BaseCommand, CommandError

from zentinelle.models.policy import Policy
from zentinelle.management.commands.policy_apply import _parse_policy_files, _validate_doc


class Command(BaseCommand):
    help = 'Diff YAML policy files against the database state'

    def add_arguments(self, parser):
        parser.add_argument(
            'directory',
            help='Directory containing *.yaml / *.yml policy files',
        )
        parser.add_argument(
            '--tenant',
            required=True,
            help='Tenant ID to diff policies for (required)',
        )

    def handle(self, *args, **options):
        directory = options['directory']
        tenant_id = options['tenant']

        if not tenant_id:
            raise CommandError('--tenant is required')

        if not os.path.isdir(directory):
            raise CommandError(f"Directory not found: {directory}")

        # Parse all file-based policies
        file_policies = {}  # name → (spec_type, spec_config, scope, enforcement, priority)
        for path, doc_or_exc in _parse_policy_files(directory):
            if isinstance(doc_or_exc, Exception):
                self.stderr.write(self.style.WARNING(f"SKIP {path}: {doc_or_exc}"))
                continue
            try:
                name, spec_type, spec_config, scope, enforcement, priority = _validate_doc(
                    doc_or_exc, path
                )
                file_policies[name] = {
                    'type': spec_type,
                    'config': spec_config,
                    'scope': scope,
                    'enforcement': enforcement,
                    'priority': priority,
                }
            except ValueError as exc:
                self.stderr.write(self.style.WARNING(f"SKIP {path}: {exc}"))

        # Fetch DB policies for this tenant
        db_policies = {
            p.name: p
            for p in Policy.objects.filter(tenant_id=tenant_id)
        }

        # Determine categories
        new_policies = []
        changed_policies = []
        unchanged_policies = []

        for name, file_data in file_policies.items():
            if name not in db_policies:
                new_policies.append(name)
            else:
                db = db_policies[name]
                db_config = dict(db.config or {})
                db_config.pop('_source', None)
                file_config = dict(file_data['config'] or {})
                file_config.pop('_source', None)

                if (
                    db_config != file_config
                    or db.enforcement != file_data['enforcement']
                    or db.policy_type != file_data['type']
                    or db.scope_type != file_data['scope']
                ):
                    changed_policies.append(name)
                else:
                    unchanged_policies.append(name)

        # Policies in DB with _source=code that are not in the files → REMOVED
        removed_policies = [
            name
            for name, db in db_policies.items()
            if name not in file_policies
            and isinstance(db.config, dict)
            and db.config.get('_source') == 'code'
        ]

        self._print_section('NEW (in files, not in DB)', new_policies, self.style.SUCCESS)
        self._print_section('CHANGED (different config/enforcement)', changed_policies, self.style.WARNING)
        self._print_section('REMOVED (in DB with _source=code, not in files)', removed_policies, self.style.ERROR)
        self._print_section('UNCHANGED', unchanged_policies, lambda s: s)

    def _print_section(self, title, names, style_fn):
        self.stdout.write(f"\n--- {title} ({len(names)}) ---")
        for name in sorted(names):
            self.stdout.write(style_fn(f"  {name}"))
        if not names:
            self.stdout.write("  (none)")
