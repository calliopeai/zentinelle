"""One ordered action set for policies and content rules (#396).

Existing rows keep their behaviour:

- Policies gain `action=block` at `block_level=tool_call`, the field defaults.
  Before #396 every enforced policy failure denied the call, which is exactly
  that. An audit policy keeps `block` as well: the audit mode caps it to
  `log` when it matches, which is what audit did, and switching the policy to
  enforce later blocks as it always did.
- Content rules move from `enforcement` to `action`, value for value, with
  `log_only` becoming `log`. A value outside the old choices never had an
  effect in the scanner, which is what `log` (the default) does.

The data step runs between adding `action` and removing `enforcement`, so the
migration reverses cleanly: `steer` goes back as `warn` and `alert` as
`log_only`, the nearest values the old vocabulary had.
"""
from django.db import migrations, models

# Frozen here rather than imported, so later edits to the live mappings cannot
# change what this migration did.
ACTION_FROM_ENFORCEMENT = {
    'block': 'block',
    'warn': 'warn',
    'log_only': 'log',
    'redact': 'redact',
    'require_approval': 'require_approval',
}
ENFORCEMENT_FROM_ACTION = {
    'log': 'log_only',
    'alert': 'log_only',
    'warn': 'warn',
    'steer': 'warn',
    'redact': 'redact',
    'require_approval': 'require_approval',
    'block': 'block',
}

ACTION_CHOICES = [
    ('log', 'Log (record only)'),
    ('alert', 'Alert (record and notify owners)'),
    ('warn', 'Warn (allow with a visible warning)'),
    ('steer', 'Steer (inject a correcting message)'),
    ('redact', 'Redact (remove the matched content)'),
    ('require_approval', 'Require approval'),
    ('block', 'Block'),
]
BLOCK_LEVEL_CHOICES = [
    ('tool_call', 'Block the tool call'),
    ('turn', 'Cancel the turn'),
    ('revoke_key', 'Revoke the gateway key'),
    ('stop', 'Stop the task or box'),
    ('quarantine', 'Quarantine the agent or spec'),
]


def enforcement_to_action(apps, schema_editor):
    rules = apps.get_model('zentinelle', 'ContentRule').objects.using(schema_editor.connection.alias)
    for enforcement, action in ACTION_FROM_ENFORCEMENT.items():
        rules.filter(enforcement=enforcement).update(action=action)


def action_to_enforcement(apps, schema_editor):
    rules = apps.get_model('zentinelle', 'ContentRule').objects.using(schema_editor.connection.alias)
    for action, enforcement in ENFORCEMENT_FROM_ACTION.items():
        rules.filter(action=action).update(enforcement=enforcement)


class Migration(migrations.Migration):

    dependencies = [
        ('zentinelle', '0061_astrolift_install_cluster'),
    ]

    operations = [
        migrations.AddField(
            model_name='contentrule',
            name='action',
            field=models.CharField(choices=ACTION_CHOICES, default='log', max_length=20),
        ),
        migrations.AddField(
            model_name='contentrule',
            name='block_level',
            field=models.CharField(choices=BLOCK_LEVEL_CHOICES, default='tool_call', max_length=20),
        ),
        migrations.AddField(
            model_name='contentrule',
            name='escalation',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='contentrule',
            name='steer_message',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.RunPython(enforcement_to_action, action_to_enforcement,
                             hints={'model_name': 'contentrule'}),
        migrations.RemoveIndex(
            model_name='contentrule',
            name='zentinelle__enforce_3fe25a_idx',
        ),
        migrations.RemoveField(
            model_name='contentrule',
            name='enforcement',
        ),
        migrations.AddIndex(
            model_name='contentrule',
            index=models.Index(fields=['action', 'enabled'], name='zentinelle__action_13fcd9_idx'),
        ),
        migrations.AddField(
            model_name='contentscan',
            name='enforcement',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='policy',
            name='action',
            field=models.CharField(choices=ACTION_CHOICES, default='block', max_length=20),
        ),
        migrations.AddField(
            model_name='policy',
            name='block_level',
            field=models.CharField(choices=BLOCK_LEVEL_CHOICES, default='tool_call', max_length=20),
        ),
        migrations.AddField(
            model_name='policy',
            name='escalation',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='policy',
            name='steer_message',
            field=models.TextField(blank=True, default=''),
        ),
    ]
