"""No resolver invents a tenant when it cannot resolve one (#285).

Ten call sites wrote `get_request_tenant_id(user) or 'default'`. Any two
callers whose tenant could not be resolved landed in that same bucket and read
and wrote each other's rows.

A shared fallback is worse than none: it turns a misconfiguration into a
*working* request against a tenant nobody owns, so nothing ever surfaces the
problem that caused it.

This is a grep with a reason attached, and that is the right shape for it —
the defect is a literal, it was introduced ten times by copying, and an
eleventh would be introduced the same way.
"""
import pathlib
import re
import unittest

BACKEND = pathlib.Path(__file__).resolve().parents[2]

#: The literal that was used as a stand-in tenant.
#: Assignments and returns only, so this file and the helper's own docstring
#: can name the pattern without matching it. Both quote styles: two of the ten
#: sites used double quotes and were missed by a search for single ones — which
#: is the argument for a test over a grep.
SHARED_FALLBACK = re.compile(
    r"""(=|return)\s*get_request_tenant_id\([^)]*\)\s*or\s*['"]default['"]"""
)


class NoSharedTenantFallbackTest(unittest.TestCase):
    def test_no_resolver_falls_back_to_a_shared_tenant(self):
        offenders = []
        for path in sorted(BACKEND.rglob('*.py')):
            if 'tests' in path.parts or 'migrations' in path.parts:
                continue
            text = path.read_text()
            for match in SHARED_FALLBACK.finditer(text):
                line = text[: match.start()].count('\n') + 1
                offenders.append(f'{path.relative_to(BACKEND)}:{line}')

        self.assertEqual(
            offenders, [],
            'these resolve a tenant by inventing one when the real one is '
            f'unknown, which puts every such caller in the same bucket: {offenders}. '
            'Use require_request_tenant_id to refuse, or return nothing.',
        )
