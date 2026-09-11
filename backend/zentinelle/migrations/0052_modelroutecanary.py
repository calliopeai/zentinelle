from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [('zentinelle', '0051_budgetcharge_app_id_ext_budgetcharge_session_id_ext_and_more')]

    operations = [migrations.CreateModel(
        name='ModelRouteCanary',
        fields=[
            ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ('tenant_id', models.CharField(db_index=True, max_length=255)),
            ('provider', models.CharField(max_length=64)),
            ('model', models.CharField(max_length=128)),
            ('status', models.CharField(choices=[('passed', 'Passed'), ('failed', 'Failed')], max_length=16)),
            ('reason', models.TextField(blank=True, default='')),
            ('baseline', models.JSONField(blank=True, default=dict)),
            ('evidence', models.JSONField(blank=True, default=dict)),
            ('actor_id', models.CharField(blank=True, default='', max_length=255)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
        ],
        options={'ordering': ['-created_at'], 'indexes': [models.Index(fields=['tenant_id', '-created_at'], name='zentinelle__tenant__7f4725_idx')]},
    )]
