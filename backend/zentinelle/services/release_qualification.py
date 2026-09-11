"""Release qualification gate with durable evidence."""
import json
import re
from urllib.parse import urlparse

from zentinelle.models import ReleaseQualification

REQUIRED_CHECKS = ('migrations', 'auth', 'csrf', 'secret_rotation', 'dependency_scan', 'backup_restore', 'rollback')
PRODUCTION_CHECKS = REQUIRED_CHECKS + ('tls', 'oidc', 'load_slo', 'incident_drill')
PROVENANCE_REFERENCE = re.compile(r'^(?:attestation|https?)://[A-Za-z0-9][A-Za-z0-9._~:/?#\[\]@!$&\'()*+,;=%-]{2,8191}$')


def qualify_release(*, release_id, version, checks, rollback_evidence=None, sbom_digest='', signature='', environment='ci'):
    if (not isinstance(release_id, str) or not release_id.strip() or len(release_id) > 255 or
            not isinstance(version, str) or not version.strip() or len(version) > 255):
        raise ValueError('release_id and version must be bounded strings')
    if not isinstance(checks, dict) or len(checks) > 64 or not all(isinstance(value, bool) for value in checks.values()):
        raise ValueError('checks must be a bounded object of boolean values')
    if rollback_evidence is not None and (not isinstance(rollback_evidence, dict) or
                                          len(json.dumps(rollback_evidence, default=str)) > 16384):
        raise ValueError('rollback_evidence must be a bounded object')
    if sbom_digest and not re.fullmatch(r'sha256:[0-9a-f]{64}', str(sbom_digest)):
        raise ValueError('sbom_digest must be a sha256 digest')
    if signature and not isinstance(signature, str):
        raise ValueError('release signature must be a string reference')
    if signature and len(signature) > 8192:
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
    parsed_signature = urlparse(str(signature).strip()) if environment == 'production' else None
    path_segments = [segment for segment in (parsed_signature.path.split('/') if parsed_signature else []) if segment]
    if environment == 'production' and str(release_id) not in path_segments:
        raise ValueError('production provenance reference must identify the qualified release')
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
