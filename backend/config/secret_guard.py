"""Refuse to serve with an empty, placeholder or short secret (T7).

The compose quick start used to run on defaults anyone can read in this
repository: a bootstrap secret that signs registration tokens and Astrolift
enrollment proofs, a Django SECRET_KEY the audit checkpoint key inherits, and
a provider-key encryption key derived from a fixed seed. Every process that
serves requests or runs tasks calls refuse_insecure_secrets() first.
"""
import os

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

# Values this repository has shipped as a default somewhere (compose, the
# example env, a settings fallback), plus the obvious ones.
PLACEHOLDERS = frozenset({
    'change-me-in-production', 'dev-bootstrap-secret', 'dev-insecure-fallback',
    'change-me', 'changeme', 'secret', 'password',
})
MIN_LENGTH = 32


def _weak(value):
    return not value or value.strip().lower() in PLACEHOLDERS or len(value) < MIN_LENGTH


def insecure_secrets():
    """The names of the secrets that are missing, a placeholder, or too short."""
    problems = []
    if _weak(settings.SECRET_KEY):
        problems.append('SECRET_KEY')
    if _weak(settings.AUDIT_CHECKPOINT_SIGNING_KEY):
        problems.append('AUDIT_CHECKPOINT_SIGNING_KEY')
    if _weak(os.environ.get('ZENTINELLE_BOOTSTRAP_SECRET', '')):
        problems.append('ZENTINELLE_BOOTSTRAP_SECRET')
    try:
        Fernet(os.environ.get('ZENTINELLE_SECRET_KEY', '').encode())
    except (ValueError, TypeError):
        problems.append('ZENTINELLE_SECRET_KEY (a Fernet key)')
    return problems


def refuse_insecure_secrets():
    problems = insecure_secrets()
    if problems:
        raise ImproperlyConfigured(
            f"Refusing to start: {', '.join(problems)} must be set to a strong secret of at least "
            f"{MIN_LENGTH} characters, not empty or a placeholder. Run `python manage.py generate_secrets` "
            "and put its output in .env.")
