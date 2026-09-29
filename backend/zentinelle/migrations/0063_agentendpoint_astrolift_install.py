import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("zentinelle", "0062_policy_actions"),
    ]

    operations = [
        migrations.AddField(
            model_name="agentendpoint",
            name="astrolift_install",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="agents",
                to="zentinelle.astroliftinstall",
            ),
        ),
    ]
