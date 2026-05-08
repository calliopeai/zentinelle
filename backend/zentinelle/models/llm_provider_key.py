"""
LLM provider API keys stored per-tenant with encryption-at-rest.

Used by the AI assistant chat endpoint and policy enforcement layer to
look up provider credentials at runtime. Falls back to env vars if no
tenant-specific key exists.
"""
import os
from cryptography.fernet import Fernet
from django.db import models


def _get_fernet() -> Fernet:
    """Get the Fernet cipher for encrypting provider keys."""
    secret = os.environ.get("ZENTINELLE_SECRET_KEY", "")
    if not secret:
        # Dev fallback — generates a stable key from a seed
        # Production must set ZENTINELLE_SECRET_KEY to a Fernet.generate_key() value
        import base64
        import hashlib
        seed = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-fallback")
        key = base64.urlsafe_b64encode(hashlib.sha256(seed.encode()).digest())
        return Fernet(key)
    return Fernet(secret.encode() if isinstance(secret, str) else secret)


class LLMProviderKey(models.Model):
    """Encrypted storage for provider API keys."""

    tenant_id = models.CharField(max_length=255, db_index=True)
    provider = models.CharField(max_length=50, db_index=True)
    encrypted_key = models.BinaryField()
    key_prefix = models.CharField(max_length=20, default="")
    is_active = models.BooleanField(
        default=True,
        help_text="Whether the key is configured (set to False on revoke)",
    )
    enabled_for_assistant = models.BooleanField(
        default=True,
        help_text=(
            "Whether to expose this provider's models in the AI assistant. "
            "Models are still discovered for the registry regardless."
        ),
    )
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "zentinelle"
        db_table = "zentinelle_llm_provider_key"
        unique_together = [("tenant_id", "provider")]

    def __str__(self):
        return f"LLMProviderKey({self.tenant_id}, {self.provider})"

    def set_key(self, plaintext: str) -> None:
        """Encrypt and store the key. Captures a prefix for display."""
        if not plaintext:
            self.encrypted_key = b""
            self.key_prefix = ""
            return
        f = _get_fernet()
        self.encrypted_key = f.encrypt(plaintext.encode())
        self.key_prefix = plaintext[:8] if len(plaintext) > 8 else plaintext

    def get_key(self) -> str:
        """Decrypt and return the stored key, or '' if empty."""
        if not self.encrypted_key:
            return ""
        f = _get_fernet()
        try:
            return f.decrypt(bytes(self.encrypted_key)).decode()
        except Exception:
            return ""
