import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('zentinelle', '0011_notification'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientCoveIntegration',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('tenant_id', models.CharField(db_index=True, max_length=255, unique=True)),
                ('client_cove_url', models.URLField(max_length=500)),
                ('api_key', models.CharField(max_length=500)),
                ('is_active', models.BooleanField(default=False)),
                ('status', models.CharField(
                    choices=[('untested', 'Untested'), ('connected', 'Connected'), ('failed', 'Failed')],
                    default='untested',
                    max_length=20,
                )),
                ('status_message', models.TextField(blank=True)),
                ('connected_org_name', models.CharField(blank=True, max_length=255)),
                ('last_tested_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'app_label': 'zentinelle',
            },
        ),
    ]
