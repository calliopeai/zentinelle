"""Persist a release qualification result from CI evidence."""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from zentinelle.services.release_qualification import qualify_release


class Command(BaseCommand):
    help = 'Qualify a release from an explicit checks JSON artifact'

    def add_arguments(self, parser):
        parser.add_argument('--release-id', required=True)
        parser.add_argument('--release-version', dest='release_version', required=True)
        parser.add_argument('--checks-file', required=True)
        parser.add_argument('--sbom-digest', default='')
        parser.add_argument('--signature', default='')

    def handle(self, *args, **options):
        try:
            payload = json.loads(Path(options['checks_file']).read_text(encoding='utf-8'))
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            raise CommandError(f'Invalid checks artifact: {exc}') from exc
        if not isinstance(payload, dict) or not isinstance(payload.get('checks'), dict):
            raise CommandError('Checks artifact must contain a checks object')
        try:
            record = qualify_release(release_id=options['release_id'], version=options['release_version'],
                                     checks=payload['checks'], rollback_evidence=payload.get('rollback_evidence'),
                                     sbom_digest=options['sbom_digest'], signature=options['signature'])
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f'{record.status}: {record.release_id} ({record.version})'))
