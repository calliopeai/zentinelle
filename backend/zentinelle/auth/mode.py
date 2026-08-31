"""Where the authentication mode is read from, for everybody.

`AUTH_MODE` had ten readers. Nine of them called `os.environ.get('AUTH_MODE',
'open')` directly — including every permission class and the GraphQL view —
one used a different default ('standalone'), and `config.settings.base` set
`settings.AUTH_MODE` from the same variable, which nothing then consulted.

Two consequences, both quiet:

- `config.settings.prod` refuses to start when AUTH_MODE is 'open', but that
  check governs `settings.AUTH_MODE`, which the permission layer never read.
  A settings file that set the mode without the environment variable would
  have been ignored by exactly the code the check exists to protect.
- A test could not change it. `override_settings(AUTH_MODE=...)` moved the
  setting the permission classes did not look at, so tests asserting that an
  unauthenticated request is refused ran in open mode and were handed a 200.
  Three of them had been failing for that reason.

One accessor now, reading the setting, with the environment as its only
source at import time.
"""
from django.conf import settings

OPEN = "open"


def auth_mode() -> str:
    """The configured mode, lowercased. 'open' when nothing says otherwise."""
    return str(getattr(settings, "AUTH_MODE", OPEN) or OPEN).lower()


def is_open_mode() -> bool:
    """Whether every caller is to be treated as an authenticated admin.

    Read at call time rather than import time so a test, or a process that
    reconfigures itself, is not stuck with the value the module first saw.
    """
    return auth_mode() == OPEN
