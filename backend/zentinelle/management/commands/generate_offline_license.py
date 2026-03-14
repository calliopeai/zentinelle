"""
Generate offline license token for air-gapped deployments.

Usage:
    python manage.py generate_offline_license --license-key CLIO-XXXX-XXXX-XXXX-XXXX
    python manage.py generate_offline_license --org-slug calliopeai
"""
from django.core.management.base import BaseCommand, CommandError

from zentinelle.models import License
from zentinelle.services import LicenseService


class Command(BaseCommand):
    help = 'Generate an offline license token for air-gapped deployments'

    def add_arguments(self, parser):
        parser.add_argument(
            '--license-key',
            help='License key to generate offline token for'
        )
        parser.add_argument(
            '--org-slug',
            help='Organization slug (uses first active license for org)'
        )
        parser.add_argument(
            '--output',
            help='Output file path (otherwise prints to stdout)'
        )

    def handle(self, *args, **options):
        license_key = options.get('license_key')
        org_slug = options.get('org_slug')
        output_file = options.get('output')

        if not license_key and not org_slug:
            raise CommandError('Either --license-key or --org-slug is required')

        # Find the license
        if license_key:
            try:
                license_obj = License.objects.get(license_key=license_key)
            except License.DoesNotExist:
                raise CommandError(f'License not found: {license_key}')
        else:
            from organization.models import Organization
            try:
                org = Organization.objects.get(slug=org_slug)
            except Organization.DoesNotExist:
                raise CommandError(f'Organization not found: {org_slug}')

            license_obj = License.objects.filter(
                organization=org,
                status=License.Status.ACTIVE
            ).first()

            if not license_obj:
                raise CommandError(f'No active license found for organization: {org_slug}')

        # Validate license is active
        if license_obj.status != License.Status.ACTIVE:
            raise CommandError(f'License is not active: {license_obj.status}')

        # Generate offline token
        service = LicenseService()
        token = service.generate_offline_token(license_obj)

        # Output
        self.stdout.write(self.style.SUCCESS(
            f'\nOffline License Generated for: {license_obj.organization.name}'
        ))
        self.stdout.write(f'  License Key: {license_obj.license_key}')
        self.stdout.write(f'  License Type: {license_obj.license_type}')
        self.stdout.write(f'  Expires: {license_obj.valid_until or "Never"}')
        self.stdout.write('')

        if output_file:
            with open(output_file, 'w') as f:
                f.write(token)
            self.stdout.write(self.style.SUCCESS(f'Token written to: {output_file}'))
        else:
            self.stdout.write(self.style.WARNING('Offline License Token:'))
            self.stdout.write('')
            self.stdout.write(token)
            self.stdout.write('')

        self.stdout.write(self.style.SUCCESS(
            '\nTo use this token in an air-gapped deployment, set:'
        ))
        self.stdout.write('  CALLIOPE_OFFLINE_LICENSE=<token>')
