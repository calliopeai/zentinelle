"""Seed the model registry's prices from the 2026-10-16 catalog (audit C11).

The pricing resolver reads the registry (AIModel) first. A registry row the
catalog prices gets the catalog price when it has none, or when it holds a
price Zentinelle itself once shipped and the provider has since changed; a
price an operator set is never overwritten. Rows are not created here: the
registry also drives the chat picker and model routing, so a model the
registry lacks is priced from the shipped catalog by the resolver instead.
Reversing removes nothing.
"""
from decimal import Decimal

from django.db import migrations, router

from zentinelle.services.model_prices import AS_OF, CATALOG_2026_10_16, SOURCES

# Prices earlier releases wrote into the registry (services/model_sync.py)
# that the provider no longer charges.
STALE_SHIPPED = {('google', 'gemini-2.5-flash'): (Decimal('0.15'), Decimal('0.60'))}


def seed_prices(apps, schema_editor):
    alias = schema_editor.connection.alias
    AIModel = apps.get_model('zentinelle', 'AIModel')
    # Zentinelle is isolated behind a database router; RunPython does not
    # apply allow_migrate_model by itself.
    if not router.allow_migrate_model(alias, AIModel):
        return
    for model_id, slug, _name, input_price, output_price, _extra in CATALOG_2026_10_16:
        for row in AIModel.objects.using(alias).filter(provider__slug=slug, model_id=model_id):
            held = (row.input_price_per_million, row.output_price_per_million)
            if held != (None, None) and held != STALE_SHIPPED.get((slug, model_id)):
                continue
            row.input_price_per_million = Decimal(input_price)
            row.output_price_per_million = Decimal(output_price)
            row.metadata = {**(row.metadata or {}), 'pricing': {'source': SOURCES[slug], 'as_of': AS_OF}}
            row.save(update_fields=['input_price_per_million', 'output_price_per_million', 'metadata'])


class Migration(migrations.Migration):
    dependencies = [('zentinelle', '0068_narrow_portal_api_key_scopes')]

    operations = [migrations.RunPython(seed_prices, migrations.RunPython.noop)]
