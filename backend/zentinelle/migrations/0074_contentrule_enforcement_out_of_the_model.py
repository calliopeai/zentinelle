"""ContentRule.enforcement leaves the model (#416).

Nothing reads it any more, and `save()` no longer writes it from `action`.
The column itself stays one more release, because the release before this
one (1.4.0) still selects it on every content-rule read, the scanner's
included: the new backend migrates at startup while those tasks still serve,
and 1.4.0 is the image a rollback goes back to. So this migration only:

- gives the column a database default, so rows new code inserts without it
  still satisfy NOT NULL (1.4.0 reads `action`, never this value);
- removes the field from Django's state.

The follow-up drops the column with SQL once no environment runs, or could
roll back to, 1.4.0.

The reverse puts the field back and re-derives each row's value from
`action`, as 0062's does, so rules changed while the field was gone read as
their nearest legacy value again.
"""
from django.db import migrations, models

# Frozen here rather than imported, as in 0062.
ENFORCEMENT_FROM_ACTION = {
    'log': 'log_only',
    'alert': 'log_only',
    'warn': 'warn',
    'steer': 'warn',
    'redact': 'redact',
    'require_approval': 'require_approval',
    'block': 'block',
}
ENFORCEMENT_CHOICES = [
    ('block', 'Block (Prevent action)'),
    ('warn', 'Warn (Allow but notify user)'),
    ('log_only', 'Log Only (Silent)'),
    ('redact', 'Redact (Remove sensitive content)'),
    ('require_approval', 'Require Approval'),
]


def action_to_enforcement(apps, schema_editor):
    rules = apps.get_model('zentinelle', 'ContentRule').objects.using(schema_editor.connection.alias)
    for action, enforcement in ENFORCEMENT_FROM_ACTION.items():
        rules.filter(action=action).update(enforcement=enforcement)


class Migration(migrations.Migration):

    dependencies = [
        ('zentinelle', '0073_astrolift_cluster_filters_and_held_counts'),
    ]

    operations = [
        # Reversed last, once the field is back in the state.
        migrations.RunPython(migrations.RunPython.noop, action_to_enforcement,
                             hints={'model_name': 'contentrule'}),
        migrations.AlterField(
            model_name='contentrule',
            name='enforcement',
            field=models.CharField(choices=ENFORCEMENT_CHOICES, default='log_only', db_default='log_only',
                                   max_length=20),
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(model_name='contentrule', name='enforcement'),
            ],
        ),
    ]
