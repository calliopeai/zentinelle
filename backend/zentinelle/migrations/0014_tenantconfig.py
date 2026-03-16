from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("zentinelle", "0013_agentgroup"),
    ]

    operations = [
        migrations.CreateModel(
            name="TenantConfig",
            fields=[
                ("tenant_id", models.CharField(max_length=255, primary_key=True, serialize=False)),
                ("name", models.CharField(default="My Organization", max_length=255)),
                ("settings", models.JSONField(default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "zentinelle_tenant_config",
                "app_label": "zentinelle",
            },
        ),
    ]
