"""
Management command to activate a compliance pack for a tenant.

Usage:
    python manage.py activate_compliance_pack hipaa --tenant myorg
    python manage.py activate_compliance_pack soc2 --tenant myorg --enforcement audit
    python manage.py activate_compliance_pack gdpr --tenant myorg --dry-run
"""
from django.core.management.base import BaseCommand, CommandError

from zentinelle.services.compliance_packs import activate_pack, get_pack, list_packs


class Command(BaseCommand):
    help = 'Activate a compliance pack for a tenant'

    def add_arguments(self, parser):
        parser.add_argument(
            'pack',
            type=str,
            help='Compliance pack name (e.g. hipaa, soc2, gdpr, eu_ai_act)',
        )
        parser.add_argument(
            '--tenant',
            required=True,
            type=str,
            help='Tenant ID to activate the pack for',
        )
        parser.add_argument(
            '--enforcement',
            default='enforce',
            choices=['enforce', 'audit', 'disabled'],
            help='Enforcement level for all policies in the pack (default: enforce)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Preview what would be activated without making any changes',
        )

    def handle(self, *args, **options):
        pack_name = options['pack']
        tenant_id = options['tenant']
        enforcement = options['enforcement']
        dry_run = options['dry_run']

        # Validate pack exists
        pack = get_pack(pack_name)
        if pack is None:
            available = ', '.join(p['name'] for p in list_packs())
            raise CommandError(
                f"Unknown compliance pack: '{pack_name}'. "
                f"Available packs: {available}"
            )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] Would activate '{pack['display_name']}' "
                    f"v{pack['version']} for tenant '{tenant_id}' "
                    f"with enforcement='{enforcement}'"
                )
            )
            self.stdout.write(f"  Policies that would be created/updated:")
            for policy in pack['policies']:
                self.stdout.write(
                    f"    - {policy['name']} "
                    f"[{policy['policy_type']}] "
                    f"priority={policy['priority']}"
                )
            self.stdout.write(
                self.style.WARNING(
                    f"  Total: {len(pack['policies'])} policies (dry run — no changes made)"
                )
            )
            return

        try:
            result = activate_pack(
                tenant_id=tenant_id,
                pack_name=pack_name,
                enforcement=enforcement,
            )
        except ValueError as e:
            raise CommandError(str(e))

        self.stdout.write(
            self.style.SUCCESS(
                f"Compliance pack '{pack['display_name']}' v{result['version']} "
                f"activated for tenant '{tenant_id}':"
            )
        )
        self.stdout.write(f"  Policies created: {result['policies_created']}")
        self.stdout.write(f"  Policies updated: {result['policies_updated']}")
        self.stdout.write(f"  Enforcement:      {enforcement}")
