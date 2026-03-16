from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [('zentinelle', '0012_clientcoveintegration')]

    operations = [
        migrations.CreateModel(
            name='AgentGroup',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('tenant_id', models.CharField(db_index=True, max_length=255)),
                ('name', models.CharField(max_length=255)),
                ('slug', models.SlugField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('tier', models.CharField(choices=[('standard', 'Standard'), ('restricted', 'Restricted'), ('trusted', 'Trusted')], default='standard', max_length=20)),
                ('color', models.CharField(default='brand', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'app_label': 'zentinelle', 'ordering': ['name']},
        ),
        migrations.AlterUniqueTogether(
            name='agentgroup',
            unique_together={('tenant_id', 'slug')},
        ),
        migrations.AddField(
            model_name='agentendpoint',
            name='group',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='agents',
                to='zentinelle.agentgroup',
            ),
        ),
    ]
