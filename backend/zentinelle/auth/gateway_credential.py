"""
The local gateway credential (#380): zero-configuration compose.

Every gateway presents its own registered credential (zentinelle.models.
gateway). A standalone compose install is one tenant and one gateway and
should need no configuration, so when the backend's web process starts it
registers a gateway named `local`, scoped to the standalone tenant, mints its
credential and writes it to ZENTINELLE_GATEWAY_CREDENTIAL_FILE (default
/var/run/zentinelle/gateway-credential), a volume the gateway also mounts.

That happens only when the file is missing and its directory exists. Anywhere
else, with no volume there, nothing happens and gateways are registered by an
operator instead (manage.py gateway_credential). The `local` registration is
the backend's own: re-minting after the file is removed revokes the credentials
it minted before, which is how this credential is rotated.

The credential goes to a private temporary file that is hard-linked into place.
The link is atomic, so the gateway never reads half a credential, and
exclusive, so replicas starting together leave exactly one: each one that loses
revokes the credential it minted.
"""
import logging
import os
import tempfile

from django.conf import settings
from django.db import DatabaseError
from django.utils import timezone

logger = logging.getLogger(__name__)

# The tenant a standalone deployment serves (see get_tenant_id_from_request).
STANDALONE_TENANT_ID = '00000000-0000-0000-0000-000000000001'

LOCAL_GATEWAY_NAME = 'local'


def ensure_local_gateway_credential() -> str:
    """Write the local gateway's credential file if this install wants one.

    Returns the path written, or '' when nothing was written.
    """
    path = getattr(settings, 'ZENTINELLE_GATEWAY_CREDENTIAL_FILE', '') or ''
    if not path or os.path.exists(path):
        return ''
    directory = os.path.dirname(path) or '.'
    if not os.path.isdir(directory):
        logger.info('No local gateway credential: %s does not exist, so this is not a compose '
                    'install with a shared volume. Register gateways with manage.py gateway_credential.',
                    directory)
        return ''

    from zentinelle.models import GatewayCredential, GatewayRegistration

    try:
        registration, _ = GatewayRegistration.objects.get_or_create(
            name=LOCAL_GATEWAY_NAME, defaults={'tenant_ids': [STANDALONE_TENANT_ID]})
        if not registration.is_active:
            logger.warning('The local gateway registration is revoked, so no credential was minted at %s.', path)
            return ''
        plaintext, credential = GatewayCredential.mint(registration)
    except DatabaseError as exc:
        logger.warning('Could not register the local gateway (%s), so no credential was minted at %s.',
                       exc.__class__.__name__, path)
        return ''

    try:
        _write_exclusively(path, plaintext)
    except FileExistsError:
        # Another replica got there first, and its credential is the one the
        # gateway will read. This one was never delivered anywhere.
        credential.revoke()
        return ''
    except OSError as exc:
        credential.revoke()
        logger.warning('Could not write the local gateway credential to %s (%s).', path, exc.strerror)
        return ''

    # The file holds this credential now. Any earlier one the backend minted
    # went with a file that no longer exists: retire it.
    registration.credentials.filter(revoked_at__isnull=True).exclude(pk=credential.pk).update(
        revoked_at=timezone.now())
    logger.info('Registered the local gateway for tenant %s and wrote its credential to %s.',
                STANDALONE_TENANT_ID, path)
    return path


def _write_exclusively(path, content):
    """Create `path` holding `content`, or raise FileExistsError if it exists.

    Written to a private (0600) temporary file in the same directory first,
    then hard-linked into place.
    """
    descriptor, temporary = tempfile.mkstemp(dir=os.path.dirname(path) or '.', prefix='.gateway-credential-')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.link(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
