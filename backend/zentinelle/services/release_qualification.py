"""Release qualification gate with durable evidence."""
import re
from zentinelle.models import ReleaseQualification

REQUIRED_CHECKS = ('migrations', 'auth', 'csrf', 'secret_rotation', 'dependency_scan', 'backup_restore', 'rollback')
PRODUCTION_CHECKS = REQUIRED_CHECKS + ('tls', 'oidc', 'load_slo', 'incident_drill')
PROVENANCE_REFERENCE = re.compile(r'^(?:attestation|https?)://[A-Za-z0-9][A-Za-z0-9._~:/?#\[\]@!$&\'()*+,;=%-]{2,8191}$')


def qualify_release(*, release_id, version, checks, rollback_evidence=None, sbom_digest='', signature='', environment='ci'):
    checks = checks or {}
    if sbom_digest and not re.fullmatch(r'sha256:[0-9a-f]{64}', str(sbom_digest)):
        raise ValueError('sbom_digest must be a sha256 digest')
    if signature and len(str(signature)) > 8192:
        raise ValueError('release signature is too large')
    if environment not in {'ci', 'staging', 'production'}:
        raise ValueError('environment must be ci, staging, or production')
    required = PRODUCTION_CHECKS if environment == 'production' else REQUIRED_CHECKS
    missing = [name for name in required if checks.get(name) is not True]
    if missing:
        raise ValueError(f'Release qualification failed; missing checks: {", ".join(missing)}')
    if environment == 'production' and not str(signature).strip():
        raise ValueError('production qualification requires signed provenance evidence')
    if environment == 'production' and not PROVENANCE_REFERENCE.fullmatch(str(signature).strip()):
        raise ValueError('production qualification requires a verifiable provenance reference')
    status = ReleaseQualification.Status.QUALIFIED if not missing else ReleaseQualification.Status.REJECTED
    record, _ = ReleaseQualification.objects.update_or_create(
        release_id=release_id,
        defaults={
            'version': version, 'status': status, 'checks': {**checks, '_environment': environment},
            'rollback_evidence': rollback_evidence or {},
            'sbom_digest': sbom_digest, 'signature': signature,
        },
    )
    return record
