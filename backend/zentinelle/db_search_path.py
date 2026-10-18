"""Select each database alias's schema when its connection opens.

Every alias in DATABASES names its schema in SEARCH_PATH. This runs a SET on
each new connection instead of passing the libpq `options` startup parameter:
PgBouncer 1.26 caches a startup search_path per server connection, Postgres 17
and earlier never report it back, and PgBouncer then hands a later client the
schema the connection last held (#484). PgBouncer does not track a SET; in
session mode it lasts the client's session, and the server reset (DISCARD ALL)
clears it before the next client.
"""
from django.db.backends.signals import connection_created
from django.dispatch import receiver


@receiver(connection_created)
def set_search_path(sender, connection, **kwargs):
    search_path = connection.settings_dict.get('SEARCH_PATH')
    if not search_path or connection.vendor != 'postgresql':
        return
    # Connections open in autocommit (Django connects before an atomic block
    # turns it off), so this lasts the session.
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('search_path', %s, false)", [search_path])
