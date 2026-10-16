"""Nothing serves or runs tasks on an empty, placeholder or short secret (T7)."""
import importlib
import io
import os
import re
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.test import SimpleTestCase, override_settings

from config.secret_guard import insecure_secrets, refuse_insecure_secrets

STRONG_SETTINGS = {'SECRET_KEY': 's' * 50, 'AUDIT_CHECKPOINT_SIGNING_KEY': 'a' * 50}
STRONG_ENV = {'ZENTINELLE_BOOTSTRAP_SECRET': 'b' * 64, 'ZENTINELLE_SECRET_KEY': Fernet.generate_key().decode()}
REPO = Path(__file__).resolve().parents[3]


@override_settings(**STRONG_SETTINGS)
@patch.dict('os.environ', STRONG_ENV)
class SecretGuardTests(SimpleTestCase):
    def test_strong_secrets_start(self):
        self.assertEqual(insecure_secrets(), [])
        refuse_insecure_secrets()

    def test_generated_secrets_start(self):
        out = io.StringIO()
        call_command('generate_secrets', stdout=out)
        values = dict(re.findall(r'^([A-Z_]+)=(\S+)$', out.getvalue(), re.M))

        with override_settings(SECRET_KEY=values['SECRET_KEY'], AUDIT_CHECKPOINT_SIGNING_KEY=values['SECRET_KEY']), \
                patch.dict('os.environ', {k: values[k] for k in ('ZENTINELLE_BOOTSTRAP_SECRET', 'ZENTINELLE_SECRET_KEY')}):
            self.assertEqual(insecure_secrets(), [])

    def test_the_shipped_defaults_are_refused(self):
        for name, value in (('SECRET_KEY', 'change-me-in-production'),
                            ('AUDIT_CHECKPOINT_SIGNING_KEY', 'change-me-in-production'),
                            ('SECRET_KEY', 'too-short')):
            with self.subTest(name=name, value=value), override_settings(**{name: value}):
                self.assertIn(name, insecure_secrets())
                with self.assertRaises(ImproperlyConfigured):
                    refuse_insecure_secrets()
        for name, value in (('ZENTINELLE_BOOTSTRAP_SECRET', 'dev-bootstrap-secret'),
                            ('ZENTINELLE_BOOTSTRAP_SECRET', ''),
                            ('ZENTINELLE_SECRET_KEY', ''), ('ZENTINELLE_SECRET_KEY', 'not-a-fernet-key')):
            with self.subTest(name=name, value=value), patch.dict('os.environ', {name: value}):
                self.assertTrue(any(p.startswith(name) for p in insecure_secrets()))

    def test_the_web_process_refuses_to_start(self):
        with override_settings(SECRET_KEY='change-me-in-production'), self.assertRaises(ImproperlyConfigured):
            importlib.reload(importlib.import_module('config.wsgi'))
        with override_settings(SECRET_KEY='change-me-in-production'), self.assertRaises(ImproperlyConfigured):
            importlib.reload(importlib.import_module('config.asgi'))

    def test_the_worker_refuses_to_start(self):
        with patch.dict('os.environ', {'ZENTINELLE_BOOTSTRAP_SECRET': 'dev-bootstrap-secret'}), \
                self.assertRaises(ImproperlyConfigured):
            call_command('temporal_worker')

    def test_provider_keys_never_use_a_derived_key(self):
        from zentinelle.models.llm_provider_key import _get_fernet
        env = {k: v for k, v in os.environ.items() if k != 'ZENTINELLE_SECRET_KEY'}
        with patch.dict('os.environ', env, clear=True), self.assertRaises(ImproperlyConfigured):
            _get_fernet()

    def test_compose_ships_no_secret_default(self):
        compose = (REPO / 'docker-compose.yml').read_text()
        for name in ('ZENTINELLE_BOOTSTRAP_SECRET', 'SECRET_KEY', 'ZENTINELLE_SECRET_KEY'):
            self.assertNotRegex(compose, rf'\${{{name}:-[^}}]+}}')
        example = (REPO / '.env.example').read_text()
        self.assertNotRegex(example, r'(?m)^(SECRET_KEY|ZENTINELLE_BOOTSTRAP_SECRET|ZENTINELLE_SECRET_KEY)=\S')

    def test_an_empty_secret_key_is_the_placeholder(self):
        result = subprocess.run(
            [sys.executable, '-c', 'from config.settings import base; print(base.SECRET_KEY)'],
            cwd=REPO / 'backend', capture_output=True, text=True, env={**os.environ, 'SECRET_KEY': ''})
        self.assertEqual(result.stdout.strip().splitlines()[-1], 'change-me-in-production', result.stderr)

    def test_dev_settings_follow_debug(self):
        probe = 'from config.settings import dev; print(dev.DEBUG, "*" in dev.ALLOWED_HOSTS)'
        for debug, expected in (('false', 'False False'), ('true', 'True True')):
            with self.subTest(debug=debug):
                result = subprocess.run(
                    [sys.executable, '-c', probe], cwd=REPO / 'backend', capture_output=True, text=True,
                    env={**os.environ, 'DEBUG': debug, 'DJANGO_SETTINGS_MODULE': 'config.settings.dev'})
                self.assertEqual(result.stdout.strip().splitlines()[-1], expected, result.stderr)
