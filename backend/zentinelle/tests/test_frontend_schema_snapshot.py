"""Keep the portal's schema snapshot equal to the live GraphQL schema.

frontend/graphql/operations.test.ts validates every portal operation against
frontend/graphql/schema.graphql. That only protects the portal while the
snapshot is the schema the backend actually serves, so a schema change that
does not refresh it fails here.
"""
import difflib
from pathlib import Path

from django.test import SimpleTestCase

from zentinelle.schema import schema

REPO_ROOT = Path(__file__).resolve().parents[3]
SNAPSHOT_PATH = REPO_ROOT / 'frontend' / 'graphql' / 'schema.graphql'

REGENERATE = (
    'cd backend && python -c "import django; django.setup(); '
    'from zentinelle.schema import schema; '
    "open('../frontend/graphql/schema.graphql', 'w').write(schema.as_str() + '\\n')\""
    ', then run `npm run validate:operations` in frontend/'
)


class FrontendSchemaSnapshotTests(SimpleTestCase):
    def test_snapshot_matches_the_served_schema(self):
        self.assertTrue(SNAPSHOT_PATH.exists(), f'{SNAPSHOT_PATH} is missing; regenerate with: {REGENERATE}')
        snapshot = SNAPSHOT_PATH.read_text()
        served = schema.as_str() + '\n'
        if snapshot != served:
            diff = difflib.unified_diff(
                snapshot.splitlines(keepends=True), served.splitlines(keepends=True),
                'frontend/graphql/schema.graphql', 'served schema',
            )
            self.fail(f'the snapshot is stale; regenerate with: {REGENERATE}\n' + ''.join(list(diff)[:80]))
