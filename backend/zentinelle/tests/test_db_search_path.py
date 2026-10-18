"""Each alias selects its schema with a SET on every new connection (#484).

conftest.py flattens every alias to public for the suite, so these tests read
the aliases' SEARCH_PATH from a fresh run of config/settings/base.py and open
their own connections to the test database with it.
"""
import runpy
from pathlib import Path

from django.db import connections
from django.test import TransactionTestCase

import config.settings

BASE_SETTINGS = Path(config.settings.__file__).with_name('base.py')
EXPECTED = {
    'default': 'public',
    'zentinelle': 'zentinelle',
    'analytics': 'zentinelle_analytics,zentinelle',
}


def _production_databases():
    return runpy.run_path(str(BASE_SETTINGS))['DATABASES']


def _connection(alias, search_path):
    """A connection to the test database under its own alias, as `alias` would open it."""
    settings_dict = {**connections['default'].settings_dict, 'SEARCH_PATH': search_path}
    probe = f'{alias}_search_path_probe'
    conn = connections['default'].__class__(settings_dict, alias=probe)
    # Registered so receivers that look the alias up (django.contrib.postgres) find it.
    connections[probe] = conn
    return conn


def _drop(conn):
    conn.close()
    del connections[conn.alias]


def _show_search_path(conn):
    with conn.cursor() as cursor:
        cursor.execute('SHOW search_path')
        return cursor.fetchone()[0]


class SearchPathOnConnectTests(TransactionTestCase):
    databases = {'default'}

    def test_aliases_no_longer_use_the_startup_option(self):
        for alias, db in _production_databases().items():
            self.assertNotIn('options', db.get('OPTIONS', {}), alias)

    def test_each_alias_connection_gets_its_own_search_path(self):
        databases = _production_databases()
        self.assertEqual(set(databases), set(EXPECTED))
        for alias, expected in EXPECTED.items():
            conn = _connection(alias, databases[alias]['SEARCH_PATH'])
            try:
                self.assertEqual(_show_search_path(conn), expected, alias)
            finally:
                _drop(conn)

    def test_every_new_connection_runs_the_set(self):
        conn = _connection('zentinelle', 'zentinelle')
        conn.force_debug_cursor = True
        try:
            for _ in range(3):
                conn.connect()
                sets = [q['sql'] for q in conn.queries if 'set_config' in q['sql']]
                self.assertEqual(len(sets), 1, conn.queries)
                self.assertEqual(_show_search_path(conn), 'zentinelle')
                # Whatever the session last held, a reconnect selects the schema again.
                with conn.cursor() as cursor:
                    cursor.execute('SET search_path TO public')
                conn.close()
                conn.queries_log.clear()
        finally:
            _drop(conn)

    def test_a_rollback_does_not_undo_the_schema(self):
        # Django connects (and runs the SET, in autocommit) before an atomic
        # block turns autocommit off, so a rollback cannot undo it.
        from django.db import transaction
        conn = _connection('analytics', EXPECTED['analytics'])
        try:
            try:
                with transaction.atomic(using=conn.alias):
                    self.assertEqual(_show_search_path(conn), EXPECTED['analytics'])
                    raise RuntimeError
            except RuntimeError:
                pass
            self.assertEqual(_show_search_path(conn), EXPECTED['analytics'])
        finally:
            _drop(conn)

    def test_no_search_path_leaves_the_connection_alone(self):
        conn = _connection('default', None)
        conn.force_debug_cursor = True
        try:
            conn.connect()
            self.assertFalse([q for q in conn.queries if 'set_config' in q['sql']])
        finally:
            _drop(conn)
