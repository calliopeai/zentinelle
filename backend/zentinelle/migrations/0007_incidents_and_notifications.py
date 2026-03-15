"""
Migration: incident management fields + IncidentComment + NotificationConfig.

Adds to Incident:
- assignee_id
- source
- source_ref

Creates:
- IncidentComment
- NotificationConfig
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("zentinelle", "0006_policy_history"),
    ]

    operations = [
        # ----------------------------------------------------------------
        # Add new fields to Incident
        # ----------------------------------------------------------------
        migrations.AddField(
            model_name="incident",
            name="assignee_id",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Assignee (user_id) — alias for user_id, used by incident API",
                max_length=255,
            ),
        ),
        migrations.AddField(
            model_name="incident",
            name="source",
            field=models.CharField(
                choices=[
                    ("policy_violation", "Policy Violation"),
                    ("manual", "Manual"),
                    ("anomaly", "Anomaly"),
                ],
                default="manual",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="incident",
            name="source_ref",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Reference to the originating record (audit log ID, event ID, etc.)",
                max_length=255,
            ),
        ),
        # ----------------------------------------------------------------
        # IncidentComment
        # ----------------------------------------------------------------
        migrations.CreateModel(
            name="IncidentComment",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                (
                    "incident",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="comments",
                        to="zentinelle.incident",
                    ),
                ),
                ("author_id", models.CharField(default="system", max_length=255)),
                ("body", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "app_label": "zentinelle",
                "ordering": ["created_at"],
            },
        ),
        # ----------------------------------------------------------------
        # NotificationConfig
        # ----------------------------------------------------------------
        migrations.CreateModel(
            name="NotificationConfig",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                ("tenant_id", models.CharField(db_index=True, max_length=255)),
                (
                    "channel",
                    models.CharField(
                        choices=[
                            ("email", "Email"),
                            ("webhook", "Webhook"),
                            ("slack", "Slack"),
                        ],
                        max_length=20,
                    ),
                ),
                (
                    "config",
                    models.JSONField(
                        default=dict,
                        help_text="Channel-specific connection details (url, email, etc.)",
                    ),
                ),
                (
                    "trigger_severities",
                    models.JSONField(
                        default=list,
                        help_text='List of severity values that trigger this config, e.g. ["critical", "high"]',
                    ),
                ),
                ("enabled", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "app_label": "zentinelle",
            },
        ),
    ]
