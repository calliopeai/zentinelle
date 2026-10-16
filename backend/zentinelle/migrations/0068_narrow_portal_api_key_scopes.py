"""Give portal-minted platform keys the scopes the operator picked.

Before the scope fix the GraphQL wrapper passed `scopes` positionally into
`description`, so every key minted on settings/api-keys was stored with the
read+write default and its `description` held the picked list as text, for
example "['agents:read']". Those keys could write whatever the operator chose.

A key still carrying that read+write default, whose description is such a
list, gets the picked list mapped onto the enforced vocabulary (`*` is admin,
`<resource>:read` is read, `<resource>:write` is write) and its description
cleared. A pick that maps to nothing leaves the key with no scopes, which the
operator API refuses, rather than the access it never asked for. Nothing else
is touched.

There is no reverse: putting the read+write default back would restore the
over-grant.
"""
import ast

from django.db import migrations

# Frozen here rather than imported, so later edits to APIKey.SCOPES cannot
# change what this migration did.
ENFORCED = ('read', 'write', 'admin')


def _picked(description):
    """The scope list a buggy mint stored in description, or None."""
    text = (description or '').strip()
    if not (text.startswith('[') and text.endswith(']')):
        return None
    try:
        value = ast.literal_eval(text)
    except (ValueError, SyntaxError):
        return None
    if not isinstance(value, list) or not all(isinstance(s, str) for s in value):
        return None
    return value


def _enforced(picked):
    scopes = []
    for scope in picked:
        if scope == '*':
            mapped = 'admin'
        elif scope in ENFORCED:
            mapped = scope
        else:
            mapped = scope.rsplit(':', 1)[-1] if ':' in scope else None
        if mapped in ENFORCED and mapped not in scopes:
            scopes.append(mapped)
    return scopes


def narrow_scopes(apps, schema_editor):
    APIKey = apps.get_model('zentinelle', 'APIKey')
    for key in APIKey.objects.filter(key_type='user').exclude(description=''):
        if sorted(key.scopes or []) != ['read', 'write']:
            continue
        picked = _picked(key.description)
        if picked is None:
            continue
        key.scopes = _enforced(picked)
        key.description = ''
        key.save(update_fields=['scopes', 'description'])


class Migration(migrations.Migration):

    dependencies = [
        ("zentinelle", "0067_longer_api_key_prefixes"),
    ]

    operations = [
        migrations.RunPython(narrow_scopes, migrations.RunPython.noop),
    ]
