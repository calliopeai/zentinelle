"""Repair objects omitted by a partially-applied initial migration.

Some early managed installs recorded 0001 as applied after creating only part
of the schema.  The normal migration graph cannot repair that state because
the missing objects belong to an already-applied migration.  This migration
is deliberately idempotent: fresh installs and complete installs are no-ops,
while affected installs receive the model table/column from Django's current
state.
"""

from django.db import migrations, router


def repair_schema(apps, schema_editor):
    connection = schema_editor.connection
    introspection = connection.introspection
    audit_log = apps.get_model("zentinelle", "AuditLog")
    # Zentinelle is isolated behind a database router.  RunPython does not
    # automatically apply allow_migrate_model the way CreateModel does.
    if not router.allow_migrate_model(connection.alias, audit_log):
        return
    existing_tables = set(introspection.table_names())

    if audit_log._meta.db_table not in existing_tables:
        schema_editor.create_model(audit_log)

    endpoint = apps.get_model("zentinelle", "AgentEndpoint")
    table = endpoint._meta.db_table
    if table not in existing_tables:
        return

    columns = {
        column.name
        for column in introspection.get_table_description(connection, table)
    }
    field = endpoint._meta.get_field("sub_organization_id_ext")
    if field.column not in columns:
        schema_editor.add_field(endpoint, field)


class Migration(migrations.Migration):
    dependencies = [("zentinelle", "0054_alter_controlevidence_status")]

    operations = [migrations.RunPython(repair_schema, migrations.RunPython.noop)]
