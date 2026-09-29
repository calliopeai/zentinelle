from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("zentinelle", "0063_agentendpoint_astrolift_install"),
    ]

    operations = [
        migrations.AddField(
            model_name="agentendpoint",
            name="api_key_issued_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="agentendpoint",
            name="astrolift_revoked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
