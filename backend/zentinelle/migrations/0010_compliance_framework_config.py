import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('zentinelle', '0009_add_incident_assignee_reporter'),
    ]

    operations = [
        migrations.CreateModel(
            name='ComplianceFrameworkConfig',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('tenant_id', models.CharField(db_index=True, max_length=255)),
                ('framework_id', models.CharField(help_text='Framework slug, e.g. soc2, gdpr, hipaa', max_length=50)),
                ('is_enabled', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Compliance Framework Config',
                'verbose_name_plural': 'Compliance Framework Configs',
                'unique_together': {('tenant_id', 'framework_id')},
            },
        ),
    ]
