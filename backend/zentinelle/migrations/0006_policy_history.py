import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("zentinelle", "0005_audit_chain_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="PolicyHistory",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "tenant_id",
                    models.CharField(db_index=True, max_length=255),
                ),
                ("version", models.PositiveIntegerField()),
                ("snapshot", models.JSONField()),
                (
                    "changed_by",
                    models.CharField(default="system", max_length=255),
                ),
                ("changed_at", models.DateTimeField(auto_now_add=True)),
                (
                    "change_summary",
                    models.CharField(blank=True, default="", max_length=500),
                ),
                (
                    "policy",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="history",
                        to="zentinelle.policy",
                    ),
                ),
            ],
            options={
                "app_label": "zentinelle",
                "ordering": ["-version"],
                "unique_together": {("policy", "version")},
            },
        ),
    ]
