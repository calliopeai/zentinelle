"""Per gateway replica heartbeat counters (#398).

Each replica of a cluster's gateway beats with its own running totals; the
cluster keeps them per instance and its counters are their sum. The column
has a database default so a pod of the previous release can still insert a
cluster during the rolling deploy.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("zentinelle", "0070_assign_tenantless_prompts"),
    ]

    operations = [
        migrations.AddField(
            model_name="astroliftcluster",
            name="instances",
            field=models.JSONField(
                blank=True,
                db_default={},
                default=dict,
                help_text="Per gateway replica: its latest health, counters and when it beat. A replica silent for STALE_AFTER is dropped.",
            ),
        ),
        migrations.AlterField(
            model_name="astroliftcluster",
            name="counters",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="The sum of the reporting gateway replicas' counters (#398).",
            ),
        ),
    ]
