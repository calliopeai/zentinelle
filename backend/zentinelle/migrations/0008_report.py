"""
Migration 0008: Add Report model for compliance report export.
Depends on 0007_incidents_and_notifications.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('zentinelle', '0007_incidents_and_notifications'),
    ]

    operations = [
        migrations.CreateModel(
            name='Report',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tenant_id', models.CharField(db_index=True, max_length=255)),
                ('report_type', models.CharField(
                    choices=[
                        ('control_coverage', 'Control_Coverage'),
                        ('violation_summary', 'Violation_Summary'),
                        ('audit_trail', 'Audit_Trail'),
                    ],
                    max_length=30,
                )),
                ('params', models.JSONField(default=dict)),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('generating', 'Generating'),
                        ('complete', 'Complete'),
                        ('failed', 'Failed'),
                    ],
                    default='pending',
                    max_length=20,
                )),
                ('format', models.CharField(default='csv', max_length=10)),
                ('file_path', models.CharField(blank=True, default='', max_length=500)),
                ('error_message', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'ordering': ['-created_at'],
                'app_label': 'zentinelle',
            },
        ),
    ]
