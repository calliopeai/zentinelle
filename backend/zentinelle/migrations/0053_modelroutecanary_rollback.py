from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('zentinelle', '0052_modelroutecanary')]

    operations = [
        migrations.AlterField(
            model_name='modelroutecanary',
            name='status',
            field=models.CharField(
                choices=[('passed', 'Passed'), ('failed', 'Failed'), ('rolled_back', 'Rolled back')],
                max_length=16,
            ),
        ),
    ]
