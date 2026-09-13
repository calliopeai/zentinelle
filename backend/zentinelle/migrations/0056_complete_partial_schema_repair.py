"""Complete the partial-schema repair per routed database alias."""

from django.db import migrations, router


def repair_schema(apps, schema_editor):
    connection = schema_editor.connection
    introspection = connection.introspection
    existing_tables = set(introspection.table_names())

    audit_log = apps.get_model("zentinelle", "AuditLog")
    if (router.allow_migrate_model(connection.alias, audit_log) and
            audit_log._meta.db_table not in existing_tables):
        schema_editor.create_model(audit_log)

    endpoint = apps.get_model("zentinelle", "AgentEndpoint")
    if not router.allow_migrate_model(connection.alias, endpoint):
        return
    table = endpoint._meta.db_table
    if table not in existing_tables:
        return
    with connection.cursor() as cursor:
        columns = {
            column.name
            for column in introspection.get_table_description(cursor, table)
        }
    field = endpoint._meta.get_field("sub_organization_id_ext")
    if field.column not in columns:
        schema_editor.add_field(endpoint, field)


class Migration(migrations.Migration):
    dependencies = [("zentinelle", "0055_repair_partial_schema")]
    operations = [migrations.RunPython(repair_schema, migrations.RunPython.noop)]
