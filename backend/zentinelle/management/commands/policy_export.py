"""
Management command: policy_export

Export all policies for a tenant to YAML files.

Usage:
    python manage.py policy_export --tenant myorg --output ./policies/
"""
import os
import re

import yaml
from django.core.management.base import BaseCommand, CommandError

from zentinelle.models.policy import Policy


def _name_to_slug(name: str) -> str:
    """Convert a policy name to a filesystem-safe slug."""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9]+', '_', slug)
    slug = slug.strip('_')
    return slug or 'policy'


class Command(BaseCommand):
    help = 'Export all policies for a tenant to YAML files'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            required=True,
            help='Tenant ID to export policies for (required)',
        )
        parser.add_argument(
            '--output',
            required=True,
            help='Output directory to write YAML files to',
        )

    def handle(self, *args, **options):
        tenant_id = options['tenant']
        output_dir = options['output']

        if not tenant_id:
            raise CommandError('--tenant is required')

        os.makedirs(output_dir, exist_ok=True)

        policies = Policy.objects.filter(tenant_id=tenant_id)

        written = 0
        for policy in policies:
            policy_doc = {
                'apiVersion': 'zentinelle.ai/v1',
                'kind': 'Policy',
                'metadata': {
                    'name': policy.name,
                    'scope': policy.scope_type,
                    'enforcement': policy.enforcement,
                    'priority': policy.priority,
                },
                'spec': {
                    'type': policy.policy_type,
                    'config': policy.config or {},
                },
            }

            slug = _name_to_slug(policy.name)
            filename = f"{policy.policy_type}_{slug}.yaml"
            file_path = os.path.join(output_dir, filename)

            with open(file_path, 'w', encoding='utf-8') as fh:
                yaml.dump(
                    policy_doc,
                    fh,
                    default_flow_style=False,
                    allow_unicode=True,
                    sort_keys=False,
                )
            self.stdout.write(f"  WROTE {file_path}")
            written += 1

        self.stdout.write(
            self.style.SUCCESS(f"\nExported {written} policies to {output_dir}")
        )
