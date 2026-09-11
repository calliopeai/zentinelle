"""Release qualification gate with durable evidence."""
from zentinelle.models import ReleaseQualification

REQUIRED_CHECKS = ('migrations', 'auth', 'csrf', 'secret_rotation', 'dependency_scan', 'backup_restore', 'rollback')


def qualify_release(*, release_id, version, checks, rollback_evidence=None, sbom_digest='', signature=''):
    checks = checks or {}
    missing = [name for name in REQUIRED_CHECKS if checks.get(name) is not True]
    status = ReleaseQualification.Status.QUALIFIED if not missing else ReleaseQualification.Status.REJECTED
    record, _ = ReleaseQualification.objects.update_or_create(
        release_id=release_id,
        defaults={
            'version': version, 'status': status, 'checks': checks,
            'rollback_evidence': rollback_evidence or {},
            'sbom_digest': sbom_digest, 'signature': signature,
        },
    )
    if missing:
        raise ValueError(f'Release qualification failed; missing checks: {", ".join(missing)}')
    return record
