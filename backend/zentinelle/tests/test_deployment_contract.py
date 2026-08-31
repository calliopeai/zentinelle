"""The terraform must supply everything prod settings refuse to boot without (#313).

Four of the fourteen defects found when this stack was first applied to a real
account were the same bug wearing different names: a task definition that did
not set something `config/settings/prod.py` raises on. Each one looked
identical from outside — the container exited during settings import, the
service sat at 0/1, and ECS reported it the way it reports a slow start.

The requirements are read out of `prod.py` rather than listed here. A list
would be another copy to drift from the thing it describes, which is the exact
failure this file exists to prevent: adding a new guard to prod settings should
break this test until the terraform supplies the variable, without anyone
remembering to update a fixture.

Scope: this checks the product repo's own terraform. `calliope-installer` keeps
a second, independently written description of the same deployment, and six of
the fourteen defects were already fixed there and never carried back. Nothing
here can see that repo; #313 tracks reconciling them.
"""
import re
from pathlib import Path

from django.test import TestCase

BACKEND = Path(__file__).resolve().parents[2]
PROD_SETTINGS = BACKEND / "config" / "settings" / "prod.py"
ECS_MODULE = (
    BACKEND.parent / "terraform" / "aws" / "environments" / "dev" / "ecs" / "main.tf"
)

# AUTH_MODE is guarded by value rather than presence (`if AUTH_MODE == "open"`),
# so the "is it read from the environment" pattern below cannot find it.
_GUARDED_BY_VALUE = {"AUTH_MODE"}


def _required_env_names():
    """Env vars prod settings raises on, read from prod.py itself."""
    source = PROD_SETTINGS.read_text()

    names = set(_GUARDED_BY_VALUE)

    # `if not os.environ.get("X"): raise ValueError(...)` and the
    # `_allowed = os.environ.get("ALLOWED_HOSTS", "")` / `if not _allowed:`
    # shape. Both are "read it, then raise if it is missing", so the reliable
    # signal is an environment read within a few lines of a raise.
    lines = source.splitlines()
    for i, line in enumerate(lines):
        match = re.search(r'os\.environ\.get\(\s*["\']([A-Z0-9_]+)["\']', line)
        if not match:
            continue
        window = "\n".join(lines[i:i + 4])
        if "raise ValueError" in window or "raise ImproperlyConfigured" in window:
            names.add(match.group(1))

    # SECRET_KEY is guarded by comparison against the placeholder rather than
    # by an environ read, so it is matched separately.
    if 'SECRET_KEY == "change-me-in-production"' in source:
        names.add("SECRET_KEY")

    return names


def _prod_task_definitions():
    """Each task definition block that loads `config.settings.prod`."""
    source = ECS_MODULE.read_text()
    blocks = re.split(r'resource\s+"aws_ecs_task_definition"\s+"', source)[1:]

    out = {}
    for block in blocks:
        name = block.split('"', 1)[0]
        if "config.settings.prod" in block:
            out[name] = block
    return out


class DeploymentContractTest(TestCase):

    def test_prod_settings_declare_requirements(self):
        """Guard against the extraction silently finding nothing."""
        required = _required_env_names()

        self.assertIn("ZENTINELLE_SECRET_KEY", required)
        self.assertIn("ZENTINELLE_BOOTSTRAP_SECRET", required)
        self.assertIn("ALLOWED_HOSTS", required)
        self.assertIn("AUTH_MODE", required)
        self.assertIn("SECRET_KEY", required)

    def test_the_terraform_module_is_where_we_think(self):
        self.assertTrue(
            ECS_MODULE.exists(),
            f"ECS module not found at {ECS_MODULE}. If the terraform moved, this "
            f"test needs its path updated — it silently passes otherwise.",
        )

    def test_every_django_task_definition_gets_every_required_setting(self):
        """The check that would have caught four of the fourteen.

        Celery and celery-beat count: they import the same settings module, so
        prod.py raises for a worker exactly as it does for the web process. Two
        of the defects were precisely this — a variable set on the backend and
        not on the workers.
        """
        required = _required_env_names()
        task_definitions = _prod_task_definitions()

        self.assertGreaterEqual(
            len(task_definitions), 3,
            "Expected at least backend, celery and celery-beat to load prod "
            f"settings; found {sorted(task_definitions)}",
        )

        missing = {}
        for name, block in task_definitions.items():
            absent = [var for var in sorted(required) if var not in block]
            if absent:
                missing[name] = absent

        self.assertEqual(
            missing, {},
            "Task definitions are missing settings that config/settings/prod.py "
            "raises on. The container will exit during settings import and the "
            f"service will sit at 0/1 looking like a slow start: {missing}",
        )

    def test_allowed_hosts_covers_the_container_health_check(self):
        """A probe on loopback must be an allowed host, or Django answers 400.

        This cost a full cycle of debugging: ECS killed healthy tasks because
        the health check got a 400, while every request through the ALB
        returned 200.
        """
        block = _prod_task_definitions().get("backend", "")

        self.assertIn(
            "localhost", block,
            "ALLOWED_HOSTS does not include localhost. The container health "
            "check probes loopback, and Django rejects a Host it does not "
            "allow with 400 — ECS then kills a container that is serving the "
            "load balancer correctly.",
        )

    def test_health_checks_do_not_depend_on_curl(self):
        """Neither image ships curl; the original probes could never pass."""
        # Only the command strings. An earlier version of this test matched
        # the whole file and failed on a comment that merely mentions curl,
        # which is the linting equivalent of reading the docs instead of the
        # code.
        commands = [
            line for line in ECS_MODULE.read_text().splitlines()
            if "CMD-SHELL" in line
        ]
        self.assertTrue(commands, "No health check commands found to inspect.")

        self.assertNotIn(
            "curl", "\n".join(commands),
            "A health check shells out to curl, which is in neither the "
            "backend (python:3.12-slim) nor the frontend image. The probe "
            "fails with command-not-found and ECS kills the task once "
            "startPeriod elapses.",
        )

    def test_redis_url_carries_ssl_cert_reqs(self):
        """celery refuses to construct a rediss:// backend without it."""
        source = ECS_MODULE.read_text()

        if "rediss://" in source:
            self.assertIn(
                "ssl_cert_reqs", source,
                "A rediss:// URL without ssl_cert_reqs makes celery raise "
                "while printing its own startup banner, after Django has "
                "imported cleanly — so it reads as a service flapping rather "
                "than a container that cannot start.",
            )
