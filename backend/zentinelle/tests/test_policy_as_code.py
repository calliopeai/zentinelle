"""
Tests for policy-as-code management commands.
"""
import os
import tempfile
import uuid
import yaml

from django.test import SimpleTestCase
from unittest.mock import patch, MagicMock, call


VALID_POLICY_YAML = {
    'apiVersion': 'zentinelle.ai/v1',
    'kind': 'Policy',
    'metadata': {
        'name': 'Production Model Allowlist',
        'scope': 'organization',
        'enforcement': 'enforce',
        'priority': 100,
    },
    'spec': {
        'type': 'model_restriction',
        'config': {
            'allowed_providers': ['anthropic', 'openai'],
        },
    },
}


def _write_yaml(directory, filename, content):
    path = os.path.join(directory, filename)
    with open(path, 'w') as fh:
        yaml.dump(content, fh)
    return path


class TestPolicyValidate(SimpleTestCase):
    """Tests for policy_validate management command helper functions."""

    def test_validate_valid_yaml(self):
        """Valid YAML document passes _validate_doc without error."""
        from zentinelle.management.commands.policy_apply import _validate_doc

        name, spec_type, spec_config, scope, enforcement, priority = _validate_doc(
            VALID_POLICY_YAML, 'test.yaml'
        )
        self.assertEqual(name, 'Production Model Allowlist')
        self.assertEqual(spec_type, 'model_restriction')
        self.assertEqual(scope, 'organization')
        self.assertEqual(enforcement, 'enforce')
        self.assertEqual(priority, 100)

    def test_validate_missing_kind_fails(self):
        """Document without 'kind: Policy' raises ValueError."""
        from zentinelle.management.commands.policy_apply import _validate_doc

        doc = dict(VALID_POLICY_YAML)
        doc['kind'] = 'NotAPolicy'

        with self.assertRaises(ValueError) as ctx:
            _validate_doc(doc, 'test.yaml')
        self.assertIn('kind', str(ctx.exception))

    def test_validate_invalid_policy_type_fails(self):
        """Document with unknown spec.type raises ValueError."""
        from zentinelle.management.commands.policy_apply import _validate_doc

        import copy
        doc = copy.deepcopy(VALID_POLICY_YAML)
        doc['spec']['type'] = 'not_a_real_policy_type'

        with self.assertRaises(ValueError) as ctx:
            _validate_doc(doc, 'test.yaml')
        self.assertIn('spec.type', str(ctx.exception))


class TestPolicyApply(SimpleTestCase):
    """Tests for policy_apply management command."""

    @patch('zentinelle.management.commands.policy_apply.Policy')
    def test_apply_creates_policy(self, mock_policy_cls):
        """policy_apply calls update_or_create with correct args."""
        from django.core.management import call_command
        from io import StringIO

        tmpdir = tempfile.mkdtemp()
        _write_yaml(tmpdir, 'model_restriction.yaml', VALID_POLICY_YAML)

        mock_policy_cls.PolicyType.choices = [
            ('model_restriction', 'Model Restriction'),
        ]
        mock_policy_cls.objects.update_or_create.return_value = (MagicMock(), True)

        out = StringIO()
        call_command('policy_apply', tmpdir, '--tenant', 'test-tenant', stdout=out)

        mock_policy_cls.objects.update_or_create.assert_called_once()
        call_kwargs = mock_policy_cls.objects.update_or_create.call_args
        self.assertEqual(call_kwargs.kwargs['tenant_id'], 'test-tenant')
        self.assertEqual(call_kwargs.kwargs['name'], 'Production Model Allowlist')
        defaults = call_kwargs.kwargs['defaults']
        self.assertEqual(defaults['policy_type'], 'model_restriction')
        self.assertEqual(defaults['config']['_source'], 'code')

    @patch('zentinelle.management.commands.policy_apply.Policy')
    def test_apply_dry_run_does_not_write(self, mock_policy_cls):
        """--dry-run prints what would happen but does not call update_or_create."""
        from django.core.management import call_command
        from io import StringIO

        tmpdir = tempfile.mkdtemp()
        _write_yaml(tmpdir, 'model_restriction.yaml', VALID_POLICY_YAML)

        mock_policy_cls.PolicyType.choices = [
            ('model_restriction', 'Model Restriction'),
        ]
        mock_policy_cls.objects.filter.return_value.exists.return_value = False

        out = StringIO()
        call_command('policy_apply', tmpdir, '--tenant', 'test-tenant', '--dry-run', stdout=out)

        mock_policy_cls.objects.update_or_create.assert_not_called()
        self.assertIn('dry-run', out.getvalue())


class TestPolicyExport(SimpleTestCase):
    """Tests for policy_export management command."""

    @patch('zentinelle.management.commands.policy_export.Policy')
    def test_export_creates_yaml_files(self, mock_policy_cls):
        """policy_export writes one YAML file per policy."""
        from django.core.management import call_command
        from io import StringIO

        policy = MagicMock()
        policy.name = 'My Model Policy'
        policy.policy_type = 'model_restriction'
        policy.enforcement = 'enforce'
        policy.scope_type = 'organization'
        policy.priority = 50
        policy.config = {'allowed_providers': ['anthropic']}
        mock_policy_cls.objects.filter.return_value = [policy]

        tmpdir = tempfile.mkdtemp()
        out = StringIO()
        call_command('policy_export', '--tenant', 'test-tenant', '--output', tmpdir, stdout=out)

        files = os.listdir(tmpdir)
        self.assertEqual(len(files), 1)

        written_path = os.path.join(tmpdir, files[0])
        with open(written_path) as fh:
            doc = yaml.safe_load(fh)

        self.assertEqual(doc['kind'], 'Policy')
        self.assertEqual(doc['metadata']['name'], 'My Model Policy')
        self.assertEqual(doc['spec']['type'], 'model_restriction')
        self.assertIn('allowed_providers', doc['spec']['config'])
