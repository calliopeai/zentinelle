"""
zentinelle.conf — YAML config file loader.

Reads a zentinelle.yaml config file and injects values into os.environ
BEFORE Django processes any settings. Env vars always take precedence:
values from the config file are only set when the corresponding env var
is not already present.

Config file location (in order of precedence):
  1. Path given by the ZENTINELLE_CONFIG env var
  2. zentinelle.yaml in the project root (parent of backend/)
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Key mapping: YAML path tuple → env var name
# ---------------------------------------------------------------------------

YAML_TO_ENV = {
    ("database", "url"): "DATABASE_URL",
    ("redis", "url"): "REDIS_URL",
    ("clickhouse", "url"): "CLICKHOUSE_URL",
    ("auth", "mode"): "AUTH_MODE",
    ("auth", "client_cove", "api_url"): "CALLIOPE_INTERNAL_API_URL",
    ("auth", "client_cove", "api_key"): "CALLIOPE_INTERNAL_API_KEY",
    ("auth", "client_cove", "cache_ttl"): "CALLIOPE_TENANT_CACHE_TTL",
    ("celery", "broker_url"): "CELERY_BROKER_URL",
    ("celery", "result_backend"): "CELERY_RESULT_BACKEND",
    ("django", "secret_key"): "SECRET_KEY",
    ("django", "debug"): "DEBUG",
    ("django", "allowed_hosts"): "ALLOWED_HOSTS",  # list → comma-joined string
}


def _get_nested(data: dict, keys: tuple):
    """Walk a nested dict by a tuple of keys. Returns None if any key is missing."""
    node = data
    for key in keys:
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def _coerce_value(value) -> str:
    """Convert a parsed YAML value to a string suitable for os.environ."""
    if isinstance(value, list):
        # e.g. allowed_hosts: [localhost, 127.0.0.1] → "localhost,127.0.0.1"
        return ",".join(str(item) for item in value)
    if isinstance(value, bool):
        # YAML parses true/false as Python bool; Django expects "true"/"false"
        return "true" if value else "false"
    return str(value)


def _find_config_path() -> Path | None:
    """Return the config file path, or None if no file should be loaded."""
    explicit = os.environ.get("ZENTINELLE_CONFIG")
    if explicit:
        p = Path(explicit)
        if p.exists():
            return p
        logger.warning("zentinelle.conf: ZENTINELLE_CONFIG=%s does not exist — skipping", explicit)
        return None

    # Default: <repo-root>/zentinelle.yaml  (two levels up from this file:
    #   backend/zentinelle/conf.py → backend/ → repo-root/)
    default = Path(__file__).resolve().parent.parent.parent / "zentinelle.yaml"
    if default.exists():
        return default

    return None


def load_config() -> None:
    """
    Load zentinelle.yaml and inject values into os.environ.

    Safe to call unconditionally:
    - No-op if PyYAML is not installed (logs a warning once)
    - No-op if no config file is found
    - No-op / warning if the file is malformed
    - Never overwrites existing env vars
    """
    try:
        import yaml  # type: ignore[import]
    except ImportError:
        logger.debug(
            "zentinelle.conf: PyYAML not installed — zentinelle.yaml support disabled"
        )
        return

    config_path = _find_config_path()
    if config_path is None:
        return

    try:
        with open(config_path, "r") as fh:
            data = yaml.safe_load(fh)
    except Exception as exc:  # noqa: BLE001
        logger.warning("zentinelle.conf: could not parse %s — %s", config_path, exc)
        return

    if not isinstance(data, dict):
        logger.warning("zentinelle.conf: %s is not a YAML mapping — skipping", config_path)
        return

    injected = []
    for yaml_path, env_var in YAML_TO_ENV.items():
        if env_var in os.environ:
            # Env var already set — honour it, skip the file value.
            continue
        value = _get_nested(data, yaml_path)
        if value is None:
            continue
        os.environ[env_var] = _coerce_value(value)
        injected.append(env_var)

    if injected:
        logger.debug(
            "zentinelle.conf: loaded %s, injected: %s",
            config_path,
            ", ".join(injected),
        )
