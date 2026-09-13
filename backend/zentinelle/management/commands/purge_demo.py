"""Delete demo data for one explicitly selected tenant."""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Delete all Zentinelle records for an explicitly selected demo tenant."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            required=True,
            help="Tenant UUID to purge; there is no default for safety.",
        )
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Acknowledge that every Zentinelle record for this tenant will be deleted.",
        )

    def handle(self, *args, **options):
        if not options["confirm"]:
            raise CommandError("Refusing to purge without --confirm")

        from zentinelle.models import (AgentEndpoint, ContentRule, Event,
                                       Incident, Policy, Risk)

        tenant = options["tenant"]
        models = [Event, Incident, Risk, ContentRule, Policy, AgentEndpoint]
        with transaction.atomic(using="zentinelle"):
            totals = []
            for model in models:
                deleted, _ = model.objects.using("zentinelle").filter(tenant_id=tenant).delete()
                totals.append((model.__name__, deleted))

        self.stdout.write(self.style.SUCCESS(f"Purged tenant {tenant}"))
        for name, count in totals:
            self.stdout.write(f"  {name}: deleted {count}")
