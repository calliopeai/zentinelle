"""
The gateway token (#380): the shared secret the Go gateway presents, with an
agent key, to read that agent's tenant's stored provider key.

Resolved on every lookup rather than once at startup, so a rotated token takes
effect without a restart:

1. ZENTINELLE_GATEWAY_TOKEN, when set. Explicit configuration wins.
2. Otherwise the file at ZENTINELLE_GATEWAY_TOKEN_FILE.
3. Otherwise a new token is minted into that file, when its directory exists
   and is writable. This is how compose works with no configuration: the
   backend and the gateway share the directory as a volume, the backend mints
   the token when it starts and the gateway reads it.

With none of these the lookup is disabled, and the reason is logged once.
"""
import logging
import os
import secrets
import tempfile

from django.conf import settings

logger = logging.getLogger(__name__)

# Shorter than this and the token is refused. Together with one agent key it
# reads that tenant's raw provider keys, so it must not be guessable.
MIN_LENGTH = 32

# The last reason the lookup was reported disabled. The lookup is retried on
# every proxied request while it fails, and the same reason once per request
# would bury everything else in the log.
_last_reported = None


def gateway_token() -> str:
    """Return the token the lookup accepts, or '' when the lookup is disabled."""
    global _last_reported

    explicit = getattr(settings, 'ZENTINELLE_GATEWAY_TOKEN', '') or ''
    if explicit:
        if len(explicit) < MIN_LENGTH:
            return _disabled(f'ZENTINELLE_GATEWAY_TOKEN is shorter than {MIN_LENGTH} characters', logging.ERROR)
        _last_reported = None
        return explicit

    path = getattr(settings, 'ZENTINELLE_GATEWAY_TOKEN_FILE', '') or ''
    if not path:
        return _disabled('neither ZENTINELLE_GATEWAY_TOKEN nor ZENTINELLE_GATEWAY_TOKEN_FILE is set')
    try:
        token = _read(path)
    except FileNotFoundError:
        token = _mint(path)
    if token:
        _last_reported = None
    return token


def _read(path):
    """The token in `path`. Raises FileNotFoundError when there is no file."""
    try:
        with open(path, encoding='utf-8') as handle:
            token = handle.read().strip()
    except FileNotFoundError:
        raise
    except (OSError, ValueError) as exc:
        return _disabled(f'{path} cannot be read ({getattr(exc, "strerror", None) or exc.__class__.__name__})',
                         logging.ERROR)
    if len(token) < MIN_LENGTH:
        return _disabled(f'{path} holds fewer than {MIN_LENGTH} characters', logging.ERROR)
    return token


def _mint(path):
    """Write a new token to `path`, unless another process gets there first.

    The token goes to a private temporary file first and is hard-linked into
    place. The link is atomic, so nobody reads a half-written token, and it is
    exclusive, so two replicas starting together cannot keep different tokens:
    the one whose link fails reads the winner's file instead.
    """
    directory = os.path.dirname(path) or '.'
    if not os.path.isdir(directory):
        return _disabled(f'{directory} does not exist, so no token can be minted at {path}')

    token = secrets.token_hex(32)
    try:
        descriptor, temporary = tempfile.mkstemp(dir=directory, prefix='.gateway-token-')
    except OSError as exc:
        return _disabled(f'{directory} is not writable ({exc.strerror}), so no token can be minted at {path}')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            handle.write(token)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            try:
                return _read(path)
            except FileNotFoundError:
                return _disabled(f'{path} was minted by another process and then removed', logging.ERROR)
        except OSError as exc:
            return _disabled(f'{path} cannot be created ({exc.strerror})', logging.ERROR)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass

    logger.info('Minted a new gateway token at %s. The gateway reads the same file, '
                'or set ZENTINELLE_GATEWAY_TOKEN on both instead.', path)
    return token


def _disabled(reason, level=logging.WARNING):
    global _last_reported
    if reason != _last_reported:
        _last_reported = reason
        logger.log(level, 'Gateway provider-key lookup is disabled: %s. Set ZENTINELLE_GATEWAY_TOKEN, or '
                          'ZENTINELLE_GATEWAY_TOKEN_FILE to a writable path the gateway also reads.', reason)
    return ''
