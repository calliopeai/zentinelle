"""
Management command: policy_validate

Validate YAML policy files without writing to the database.

Usage:
    python manage.py policy_validate ./policies/
"""
import os

from django.core.management.base import BaseCommand, CommandError

from zentinelle.management.commands.policy_apply import _parse_policy_files, _validate_doc


class Command(BaseCommand):
    help = 'Validate YAML policy files (no DB access)'

    def add_arguments(self, parser):
        parser.add_argument(
            'directory',
            help='Directory containing *.yaml / *.yml policy files',
        )

    def handle(self, *args, **options):
        directory = options['directory']

        if not os.path.isdir(directory):
            raise CommandError(f"Directory not found: {directory}")

        ok = 0
        errors = 0

        for path, doc_or_exc in _parse_policy_files(directory):
            if isinstance(doc_or_exc, Exception):
                self.stderr.write(self.style.ERROR(f"ERROR {path}: {doc_or_exc}"))
                errors += 1
                continue

            try:
                _validate_doc(doc_or_exc, path)
                self.stdout.write(self.style.SUCCESS(f"  OK  {path}"))
                ok += 1
            except ValueError as exc:
                self.stderr.write(self.style.ERROR(f"  ERR {path}: {exc}"))
                errors += 1

        self.stdout.write(f"\nValidation complete: {ok} OK, {errors} errors")

        if errors:
            raise CommandError(f"{errors} policy file(s) failed validation.")
