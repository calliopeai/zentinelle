from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('zentinelle', '0053_modelroutecanary_rollback')]

    operations = [
        migrations.AlterField(
            model_name='controlevidence',
            name='status',
            field=models.CharField(
                choices=[
                    ('verified-operating', 'Verified Operating'),
                    ('stale', 'Stale'),
                    ('failed', 'Failed'),
                    ('unknown', 'Unknown'),
                    ('observation-only', 'Observation only'),
                    ('unsupported', 'Unsupported'),
                ],
                default='unknown',
                max_length=30,
            ),
        ),
    ]
