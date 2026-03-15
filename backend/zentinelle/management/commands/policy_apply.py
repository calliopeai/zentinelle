"""
Management command: policy_apply

Apply YAML-defined policies from a directory to the database.

Usage:
    python manage.py policy_apply ./policies/ --tenant myorg [--dry-run] [--enforcement enforce|audit]
"""
import os
import glob as glob_module

import yaml
from django.core.management.base import BaseCommand, CommandError

from zentinelle.models.policy import Policy

VALID_POLICY_TYPES = {choice[0] for choice in Policy.PolicyType.choices}


def _parse_policy_files(directory: str):
    """Yield (file_path, parsed_doc) for every *.yaml / *.yml in directory."""
    pattern_yaml = os.path.join(directory, '**', '*.yaml')
    pattern_yml = os.path.join(directory, '**', '*.yml')
    paths = sorted(
        set(glob_module.glob(pattern_yaml, recursive=True))
        | set(glob_module.glob(pattern_yml, recursive=True))
    )
    for path in paths:
        try:
            with open(path, 'r', encoding='utf-8') as fh:
                doc = yaml.safe_load(fh)
            yield path, doc
        except Exception as exc:
            yield path, exc


def _validate_doc(doc, path: str):
    """
    Validate a parsed YAML document.

    Returns (name, spec_type, spec_config, scope, enforcement, priority) or raises ValueError.
    """
    if not isinstance(doc, dict):
        raise ValueError(f"{path}: document is not a mapping")

    if doc.get('kind') != 'Policy':
        raise ValueError(f"{path}: 'kind' must be 'Policy', got {doc.get('kind')!r}")

    metadata = doc.get('metadata')
    if not isinstance(metadata, dict) or not metadata.get('name'):
        raise ValueError(f"{path}: 'metadata.name' is required")

    spec = doc.get('spec')
    if not isinstance(spec, dict):
        raise ValueError(f"{path}: 'spec' is required and must be a mapping")

    spec_type = spec.get('type')
    if not spec_type:
        raise ValueError(f"{path}: 'spec.type' is required")
    if spec_type not in VALID_POLICY_TYPES:
        raise ValueError(
            f"{path}: 'spec.type' value {spec_type!r} is not a valid PolicyType. "
            f"Valid values: {sorted(VALID_POLICY_TYPES)}"
        )

    spec_config = spec.get('config')
    if spec_config is None:
        raise ValueError(f"{path}: 'spec.config' is required")

    name = metadata['name']
    scope = metadata.get('scope', 'organization')
    enforcement = metadata.get('enforcement', 'enforce')
    priority = int(metadata.get('priority', 0))

    return name, spec_type, spec_config, scope, enforcement, priority


class Command(BaseCommand):
    help = 'Apply YAML-defined policies from a directory to the database'

    def add_arguments(self, parser):
        parser.add_argument(
            'directory',
            help='Directory containing *.yaml / *.yml policy files',
        )
        parser.add_argument(
            '--tenant',
            required=True,
            help='Tenant ID to apply policies for (required)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Print what would happen without writing to the database',
        )
        parser.add_argument(
            '--enforcement',
            choices=['enforce', 'audit', 'disabled'],
            default=None,
            help='Override enforcement level for all applied policies',
        )

    def handle(self, *args, **options):
        directory = options['directory']
        tenant_id = options['tenant']
        dry_run = options['dry_run']
        enforcement_override = options.get('enforcement')

        if not tenant_id:
            raise CommandError('--tenant is required')

        if not os.path.isdir(directory):
            raise CommandError(f"Directory not found: {directory}")

        created = 0
        updated = 0
        errors = 0

        for path, doc_or_exc in _parse_policy_files(directory):
            if isinstance(doc_or_exc, Exception):
                self.stderr.write(self.style.ERROR(f"ERROR {path}: {doc_or_exc}"))
                errors += 1
                continue

            try:
                name, spec_type, spec_config, scope, enforcement, priority = _validate_doc(
                    doc_or_exc, path
                )
            except ValueError as exc:
                self.stderr.write(self.style.ERROR(str(exc)))
                errors += 1
                continue

            # Tag config to indicate it was applied via policy-as-code
            merged_config = dict(spec_config)
            merged_config['_source'] = 'code'

            if enforcement_override:
                enforcement = enforcement_override

            defaults = {
                'policy_type': spec_type,
                'config': merged_config,
                'enforcement': enforcement,
                'scope_type': scope,
                'priority': priority,
                'enabled': True,
            }

            if dry_run:
                # Check if it already exists to determine create vs update
                exists = Policy.objects.filter(tenant_id=tenant_id, name=name).exists()
                verb = 'UPDATE' if exists else 'CREATE'
                self.stdout.write(f"[dry-run] {verb} policy '{name}' (type={spec_type}, enforcement={enforcement})")
                if exists:
                    updated += 1
                else:
                    created += 1
                continue

            try:
                _, was_created = Policy.objects.update_or_create(
                    tenant_id=tenant_id,
                    name=name,
                    defaults=defaults,
                )
                if was_created:
                    created += 1
                    self.stdout.write(self.style.SUCCESS(f"  CREATED '{name}' ({spec_type})"))
                else:
                    updated += 1
                    self.stdout.write(f"  UPDATED '{name}' ({spec_type})")
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(self.style.ERROR(f"  ERROR applying '{name}': {exc}"))
                errors += 1

        prefix = '[dry-run] ' if dry_run else ''
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{prefix}Done: {created} created, {updated} updated, {errors} errors"
            )
        )
