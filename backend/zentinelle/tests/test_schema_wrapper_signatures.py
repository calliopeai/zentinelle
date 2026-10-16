"""Every portal mutation wrapper calls its resolver with the arguments it means.

`schema/__init__.py` declares each mutation's GraphQL arguments on a thin
wrapper, then calls the resolver that does the work. Those calls were
positional, and nine had drifted from the resolver's signature: updateRisk and
updateIncident passed three arguments to two-parameter resolvers,
toggleFramework and toggleRetentionPolicyEnabled never passed the required
`enabled`, and createPlatformApiKey passed `scopes` into `description`. Each
failed on every call, or silently did the wrong thing, and nothing noticed,
because no test called the wrappers with the resolvers' real signatures.

This reads each wrapper's call and binds it against the resolver's signature:
a positional argument must land on a parameter of the same name, keywords
must exist, every required parameter must be supplied, and every GraphQL
argument the wrapper declares must reach the resolver. An argument that
defaults to None must also be nullable in GraphQL.
"""
import ast
import inspect
from pathlib import Path

from django.test import SimpleTestCase

import zentinelle.schema as schema_module

SOURCE = Path(schema_module.__file__)


def _target(call):
    """The resolver a wrapper calls: `m.<name>(...)` or an imported `sp_<name>(...)`."""
    func = call.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == 'm':
        return f'm.{func.attr}', getattr(schema_module.m, func.attr, None)
    if isinstance(func, ast.Name) and hasattr(schema_module, func.id):
        target = getattr(schema_module, func.id)
        if inspect.isfunction(target) and target.__module__.startswith('zentinelle.schema'):
            return func.id, target
    return None, None


def _wrappers():
    mutation = next(
        node for node in ast.parse(SOURCE.read_text()).body
        if isinstance(node, ast.ClassDef) and node.name == 'Mutation'
    )
    for node in mutation.body:
        if not isinstance(node, ast.FunctionDef):
            continue
        calls = [c for c in ast.walk(node) if isinstance(c, ast.Call) and _target(c)[0]]
        yield node, calls


def problems(wrapper, call):
    name, target = _target(call)
    if target is None:
        return [f'{name} does not exist']
    params = list(inspect.signature(inspect.unwrap(target)).parameters.values())
    found = []

    if len(call.args) > len(params):
        found.append(f'passes {len(call.args)} positional arguments to {len(params)} parameters')
    bound = set()
    for arg, param in zip(call.args, params):
        bound.add(param.name)
        if isinstance(arg, ast.Name) and arg.id != param.name:
            found.append(f'positional `{arg.id}` lands on `{param.name}`; pass it by keyword')
    names = {p.name for p in params}
    for keyword in call.keywords:
        if keyword.arg not in names:
            found.append(f'keyword `{keyword.arg}` is not a parameter')
        bound.add(keyword.arg)
    for param in params:
        if param.default is inspect.Parameter.empty and param.name not in bound:
            found.append(f'required `{param.name}` is never passed')

    # `x: str = None` is a non-null GraphQL argument whose default is null, so
    # a client that sends null explicitly, as several pages do, is refused.
    args = wrapper.args.args
    for arg, default in zip(args[len(args) - len(wrapper.args.defaults):], wrapper.args.defaults):
        is_none = isinstance(default, ast.Constant) and default.value is None
        if is_none and arg.annotation is not None and not ast.unparse(arg.annotation).startswith('Optional['):
            found.append(f'`{arg.arg}` defaults to None but is not Optional')

    referenced = {n.id for n in ast.walk(call) if isinstance(n, ast.Name)}
    for arg in wrapper.args.args:
        if arg.arg not in ('self', 'info') and arg.arg not in referenced:
            found.append(f'GraphQL argument `{arg.arg}` never reaches the resolver')
    return found


class WrapperSignatureTests(SimpleTestCase):

    def test_every_wrapper_matches_its_resolver(self):
        checked = 0
        for wrapper, calls in _wrappers():
            self.assertEqual(len(calls), 1, f'{wrapper.name} should call exactly one resolver')
            checked += 1
            with self.subTest(mutation=wrapper.name):
                self.assertEqual(problems(wrapper, calls[0]), [])
        # Guards the walk itself: an AST change that found nothing would pass.
        self.assertGreater(checked, 60)

    def test_the_check_catches_the_drift_it_exists_for(self):
        def check(source):
            wrapper = ast.parse(source).body[0]
            return problems(wrapper, next(c for c in ast.walk(wrapper) if isinstance(c, ast.Call)))

        self.assertTrue(check('def update_risk(self, info, id, input):\n    return m.update_risk(info, input, id)'))
        self.assertTrue(check('def update_risk(self, info, id, input):\n    return m.update_risk(info, id, input, id)'))
        self.assertTrue(check('def toggle_framework(self, info, framework_id):\n    return m.toggle_framework(info, framework_id)'))
        self.assertTrue(check(
            'def create_platform_api_key(self, info, name, scopes):\n'
            '    return m.create_platform_api_key(info, name, scopes)'
        ))
        self.assertTrue(check('def toggle_framework(self, info, framework_id, enabled):\n'
                              '    return m.toggle_framework(info, framework_id=framework_id, enabled=True)'))
        self.assertTrue(check('def close_incident(self, info, id, lessons_learned: str = None):\n'
                              '    return m.close_incident(info, id, lessons_learned)'))
        self.assertEqual(check('def update_risk(self, info, id, input):\n'
                               '    return m.update_risk(info, id=id, input=input)'), [])
