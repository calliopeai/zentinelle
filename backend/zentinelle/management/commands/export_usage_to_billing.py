"""Run or inspect the billing usage export by hand (#245).

Exists mainly for `--dry-run`. Turning on an export that posts a customer's
usage somewhere is the kind of change an operator should be able to look at
before it happens, and reading a batch is more convincing than reading the
code that builds one.
"""
import json

from django.core.management.base import BaseCommand

from zentinelle.services.billing_export import (
    BillingExportError,
    billing_mode,
    export_pending,
    is_enabled,
)


class Command(BaseCommand):
    help = ('Export metered usage to Calliope AI billing, or show what '
            'would be sent.')

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help=('Build the batch and print it without sending or '
                  'marking anything.'),
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=500,
            help=('Maximum usage metrics to read in one batch '
                  '(default 500).'),
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        if not is_enabled():
            self.stdout.write(self.style.WARNING(
                'Billing export is off. Set BILLING_EXPORT_ENABLED=true and '
                'BILLING_EXPORT_URL to enable it.'
            ))
            if not dry_run:
                return
            # A dry run is still useful while disabled: it is the way to see
            # what an export *would* send before turning it on.
            self.stdout.write(
                'Showing the batch anyway, since this is a dry run.\n')

        self.stdout.write(f'Billing mode: {billing_mode()}')

        try:
            result = export_pending(limit=options['limit'], dry_run=dry_run)
        except BillingExportError as exc:
            self.stderr.write(self.style.ERROR(str(exc)))
            self.stderr.write(
                'Nothing was marked exported; the next run will retry '
                'these rows.'
            )
            return

        if dry_run:
            rows = result.get('rows', [])
            if not rows:
                self.stdout.write('Nothing pending.')
                return
            self.stdout.write(f'Would export {len(rows)} event(s):\n')
            self.stdout.write(json.dumps(rows, indent=2, default=str))
            return

        self.stdout.write(self.style.SUCCESS(
            f'Exported {result.get("exported", 0)} event(s) '
            f'from {result.get("metrics", 0)} metric(s).'
        ))
