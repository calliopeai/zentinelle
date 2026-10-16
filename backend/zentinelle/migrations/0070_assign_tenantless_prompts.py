"""Put prompts the portal saved with no tenant into their creator's tenant (#454).

The portal's create and fork saved every prompt with `tenant_id=''`. Such a
prompt is in no tenant's library: the list and the detail query never show it,
and update reports it missing.

Those two mutations are the only writers that set a creator (`user_id`) and
leave the tenant empty. The portal resolves every session, and open mode's
admin, to the install's portal tenant (`get_request_tenant_id`), so that is the
tenant the creator worked in and where the fixed mutations now save. A creator
who also has prompts in some other tenant maps to more than one tenant, so
their tenant-less prompts stay unassigned rather than being guessed into one.
A prompt with no creator is left alone: the seeded public library is
tenant-less by design. No tenant sees a tenant-less prompt unless it is
published (public and active), so what stays unassigned stays out of sight.

A moved prompt whose slug the tenant already uses gets the suffix create gives
a taken slug, because slugs are unique per tenant and version; the prompt
already in the tenant keeps its own. Reversing leaves the prompts where they
are, because unassigning them would hide them again.
"""
from django.db import migrations, router

# Frozen here rather than imported, so later edits to the resolver or the
# model cannot change what this migration did.
PORTAL_TENANT = '00000000-0000-0000-0000-000000000001'
SLUG_MAX_LENGTH = 200


def _unused_slug(prompts, tenant_id, base, version):
    slug, counter = base, 1
    while prompts.filter(tenant_id=tenant_id, slug=slug, version=version).exists():
        suffix = f'-{counter}'
        slug = f'{base[:SLUG_MAX_LENGTH - len(suffix)]}{suffix}'
        counter += 1
    return slug


def assign_to_creators_tenant(apps, schema_editor):
    alias = schema_editor.connection.alias
    SystemPrompt = apps.get_model('zentinelle', 'SystemPrompt')
    # Zentinelle is isolated behind a database router; RunPython does not
    # apply allow_migrate_model by itself.
    if not router.allow_migrate_model(alias, SystemPrompt):
        return
    prompts = SystemPrompt._base_manager.using(alias)
    creators = set(prompts.filter(tenant_id='').exclude(user_id='').values_list('user_id', flat=True))
    if not creators:
        return
    elsewhere = set(
        prompts.filter(user_id__in=creators)
        .exclude(tenant_id__in=['', PORTAL_TENANT])
        .values_list('user_id', flat=True)
    )
    for prompt in prompts.filter(tenant_id='', user_id__in=creators - elsewhere).order_by('created_at', 'id'):
        slug = _unused_slug(prompts, PORTAL_TENANT, prompt.slug, prompt.version)
        prompts.filter(pk=prompt.pk).update(tenant_id=PORTAL_TENANT, slug=slug)


class Migration(migrations.Migration):
    dependencies = [('zentinelle', '0069_seed_model_prices')]

    operations = [migrations.RunPython(assign_to_creators_tenant, migrations.RunPython.noop)]
