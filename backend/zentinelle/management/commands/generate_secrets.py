"""
Generate production secrets for a Zentinelle deployment.

Usage:
  python manage.py generate_secrets

Outputs a block you can copy into your .env file. Generates:
  - SECRET_KEY (Django session/CSRF signing)
  - ZENTINELLE_SECRET_KEY (Fernet, for LLM provider key encryption)
  - ZENTINELLE_BOOTSTRAP_SECRET (HMAC, for agent bootstrap tokens)
"""
import secrets

from cryptography.fernet import Fernet
from django.core.management.base import BaseCommand
from django.core.management.utils import get_random_secret_key


class Command(BaseCommand):
    help = "Generate the secrets a Zentinelle production deployment needs."

    def handle(self, *args, **options):
        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS("# Production secrets — paste into your .env\n")
        )
        self.stdout.write(
            self.style.WARNING(
                "# Keep these secret. Anyone with these keys can read encrypted\n"
                "# LLM provider keys and forge agent bootstrap tokens.\n"
            )
        )
        self.stdout.write(f"SECRET_KEY={get_random_secret_key()}")
        self.stdout.write(f"ZENTINELLE_SECRET_KEY={Fernet.generate_key().decode()}")
        self.stdout.write(
            f"ZENTINELLE_BOOTSTRAP_SECRET={secrets.token_hex(32)}"
        )
        self.stdout.write("")
