"""Emit a safe, queryable persistence identity report for operators."""

import json

from django.core.management.base import BaseCommand
from django.db import connections

from zentinelle.models import (AgentEndpoint, AuditLog, Event, Policy,
                               PolicyRevision, UsageMetric)


def tenant_filter_kwargs(name, tenant_id):
    """Return the correct tenant lookup for each routed model."""
    return {'policy__tenant_id' if name == 'policy_revisions' else 'tenant_id': tenant_id}


ROUTED_MODELS = {
    "zentinelle": {
        "policies": Policy,
        "policy_revisions": PolicyRevision,
        "events": Event,
        "agent_endpoints": AgentEndpoint,
    },
    "analytics": {
        "audit_logs": AuditLog,
        "usage_metrics": UsageMetric,
    },
}


class Command(BaseCommand):
    help = "Report database identity, migration state, and tenant-scoped counts."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-id", required=True)
        parser.add_argument("--json", action="store_true", dest="as_json")

    def handle(self, *args, **options):
        tenant_id = options["tenant_id"]
        report = {
            "tenant_id": tenant_id,
            "connections": [],
        }
        # Do not probe the public/default connection: managed installations
        # often make it intentionally unreachable, while Zentinelle's routed
        # aliases are the persistence boundary this report verifies.
        for alias, models in ROUTED_MODELS.items():
            connection = connections[alias]
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET statement_timeout = 5000")
                    cursor.execute("SELECT current_database(), current_schema()")
                    database, schema = cursor.fetchone()
                    cursor.execute(
                        "SELECT COUNT(*) FROM django_migrations "
                        "WHERE app = %s", ["zentinelle"]
                    )
                    migration_count = cursor.fetchone()[0]
                    cursor.execute(
                        "SELECT name FROM django_migrations "
                        "WHERE app = %s ORDER BY id DESC LIMIT 1", ["zentinelle"]
                    )
                    latest_row = cursor.fetchone()
                    latest_migration = latest_row[0] if latest_row else None
                counts = {}
                for name, model in models.items():
                    try:
                        counts[name] = model.objects.using(alias).filter(
                            **tenant_filter_kwargs(name, tenant_id)).count()
                    except Exception as exc:  # pragma: no cover
                        counts[name] = f"error: {type(exc).__name__}: {exc}"
                report["connections"].append({
                    "alias": alias,
                    "database": database,
                    "schema": schema,
                    "migration_count": migration_count,
                    "latest_migration": latest_migration,
                    "counts": counts,
                })
            except Exception as exc:  # pragma: no cover - backend-specific errors
                report["connections"].append({
                    "alias": alias,
                    "error": f"{type(exc).__name__}: {exc}",
                })

        output = json.dumps(report, sort_keys=True)
        if options["as_json"]:
            self.stdout.write(output)
        else:
            self.stdout.write(json.dumps(report, indent=2, sort_keys=True))
