from django.db import migrations, models
import uuid
from django.utils import timezone


class Migration(migrations.Migration):
    dependencies = [('zentinelle', '0048_budgetcharge_pricing_version')]
    operations = [migrations.CreateModel(
        name='RuntimeSettingsRevision',
        fields=[
            ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ('tenant_id', models.CharField(db_index=True, max_length=255)),
            ('revision', models.PositiveIntegerField()),
            ('settings', models.JSONField(default=dict)),
            ('actor_id', models.CharField(blank=True, default='', max_length=255)),
            ('actor_name', models.CharField(blank=True, default='', max_length=255)),
            ('created_at', models.DateTimeField(default=timezone.now)),
        ],
        options={'ordering': ['-revision'], 'constraints': [models.UniqueConstraint(fields=('tenant_id', 'revision'), name='unique_runtime_settings_revision')]},
    )]
