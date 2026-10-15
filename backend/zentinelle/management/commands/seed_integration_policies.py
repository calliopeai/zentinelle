"""
Seed the agent governance policies an integration starts with (installer#431).

Usage:
    python manage.py seed_integration_policies --tenant <id> --source <workbench|astrolift>

Creates one organization-wide agent_delegation, human_oversight and
budget_limit policy for the tenant, in audit mode: a match is logged and
never blocks. Operators tighten them later by switching a policy to enforce.

A type the tenant already has an organization-wide policy of is skipped,
whatever its name, mode or settings, so an operator's policy is never
overwritten and never doubled. Safe to run again. The installer runs it once
when Zentinelle is enabled with the Workbench or with Astrolift.
"""
from django.core.management.base import BaseCommand, CommandError

from zentinelle.models import Policy

SOURCES = {'workbench': 'the Workbench', 'astrolift': 'Astrolift'}

# Defaults to watch with, not limits anyone chose. Each matches its evaluator's
# config schema (services/evaluators/).
SEEDS = (
    (Policy.PolicyType.AGENT_DELEGATION, 'Agent delegation', {
        'max_delegation_depth': 3,
        'child_cannot_exceed_parent_trust': True,
        'require_signed_delegation_token': False,
        'allowed_parent_agents': [],
        'blocked_parent_agents': [],
    }),
    (Policy.PolicyType.HUMAN_OVERSIGHT, 'Human oversight', {
        'require_approval_for': ['high_cost', 'sensitive_data'],
        'approval_timeout_seconds': 300,
    }),
    (Policy.PolicyType.BUDGET_LIMIT, 'Monthly budget', {
        'monthly_budget_usd': 500,
        'alert_threshold_percent': 80,
        'hard_limit': True,
    }),
)


class Command(BaseCommand):
    help = 'Seed agent_delegation, human_oversight and budget_limit policies in audit mode'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', required=True, help='The tenant to seed the policies for')
        parser.add_argument('--source', required=True, choices=sorted(SOURCES),
                            help='The integration being enabled')

    def handle(self, *args, **options):
        tenant = options['tenant'].strip()
        if not tenant:
            raise CommandError('A tenant id cannot be empty')
        source = SOURCES[options['source']]
        created = 0
        for policy_type, name, config in SEEDS:
            existing = Policy.objects.filter(
                tenant_id=tenant, policy_type=policy_type, scope_type=Policy.ScopeType.ORGANIZATION,
            ).first()
            if existing is not None:
                self.stdout.write(f'skipped {policy_type}: the tenant has "{existing.name}" already')
                continue
            Policy.objects.create(
                tenant_id=tenant,
                scope_type=Policy.ScopeType.ORGANIZATION,
                policy_type=policy_type,
                name=name,
                description=(
                    f'Seeded in audit mode when Zentinelle was enabled with {source}. It logs '
                    'matches and never blocks; switch it to enforce once the settings fit.'
                ),
                config=dict(config),
                enforcement=Policy.Enforcement.AUDIT,
            )
            created += 1
            self.stdout.write(f'created {policy_type}: "{name}" in audit mode')
        self.stdout.write(self.style.SUCCESS(
            f'Done: {created} created, {len(SEEDS) - created} already present, for tenant {tenant}.'
        ))
