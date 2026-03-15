"""
Compliance GraphQL Mutations.

These mutations require the ZENTINELLE_COMPLIANCE_CHECKS feature (Enterprise plan).
"""
import graphene
from graphene import relay

try:
    from billing.features import Features, require_feature_for_mutation
except ImportError:
    class Features:
        ZENTINELLE_COMPLIANCE_CHECKS = 'zentinelle_compliance_checks'
    def require_feature_for_mutation(feature):
        def decorator(fn):
            return fn
        return decorator


class RunComplianceCheck(graphene.Mutation):
    """Run a compliance check for all or a specific framework."""

    class Arguments:
        framework_id = graphene.ID(required=False)
        async_mode = graphene.Boolean(
            required=False,
            default_value=False,
            description='Run in background (returns immediately with task ID)'
        )

    success = graphene.Boolean()
    check_id = graphene.String()
    assessment_id = graphene.String()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_COMPLIANCE_CHECKS)
    def mutate(cls, root, info, framework_id=None, async_mode=False):
        if not info.context.user.is_authenticated:
            return cls(success=False, errors=['Authentication required'])

        user = info.context.user
        membership = user.memberships.filter(is_active=True).first()
        if not membership:
            return cls(success=False, errors=['No active organization membership'])

        org = membership.organization

        if async_mode:
            # Run in background via Celery
            from zentinelle.tasks.compliance import run_compliance_check_task
            task = run_compliance_check_task.delay(
                organization_id=str(org.id),
                framework_id=framework_id,
                user_id=str(user.id),
                assessment_type='manual',
            )
            return cls(success=True, check_id=task.id)
        else:
            # Run synchronously
            from zentinelle.tasks.compliance import run_compliance_check_task
            try:
                assessment_id = run_compliance_check_task(
                    None,  # self (not bound)
                    organization_id=str(org.id),
                    framework_id=framework_id,
                    user_id=str(user.id),
                    assessment_type='manual',
                )
                return cls(success=True, assessment_id=assessment_id)
            except Exception as e:
                return cls(success=False, errors=[str(e)])


class GenerateComplianceReport(graphene.Mutation):
    """
    Trigger a compliance assessment and return a download URL or inline JSON.

    Runs run_compliance_check_task asynchronously and returns the assessment ID
    along with a link to the JSON export endpoint.
    """

    class Arguments:
        framework = graphene.String(
            required=False,
            description='Optional framework slug, e.g. "soc2", "gdpr"'
        )
        start_date = graphene.Date(required=False)
        end_date = graphene.Date(required=False)

    success = graphene.Boolean()
    report_url = graphene.String(description='URL to the export summary, e.g. /api/zentinelle/v1/export/summary.json')
    assessment_id = graphene.UUID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_COMPLIANCE_CHECKS)
    def mutate(cls, root, info, framework=None, start_date=None, end_date=None):
        if not info.context.user.is_authenticated:
            return cls(success=False, errors=['Authentication required'])

        user = info.context.user
        membership = user.memberships.filter(is_active=True).first()
        if not membership:
            return cls(success=False, errors=['No active organization membership'])

        org = membership.organization

        # Build export URL with optional query params
        report_url = '/api/zentinelle/v1/export/summary.json'
        params = []
        if start_date:
            params.append(f'start={start_date.isoformat()}')
        if end_date:
            params.append(f'end={end_date.isoformat()}')
        if params:
            report_url = f'{report_url}?{"&".join(params)}'

        from zentinelle.tasks.compliance import run_compliance_check_task
        try:
            task = run_compliance_check_task.delay(
                organization_id=str(org.id),
                framework_id=framework,
                user_id=str(user.id),
                assessment_type='manual',
            )
            return cls(
                success=True,
                report_url=report_url,
                assessment_id=None,
                errors=None,
            )
        except Exception as e:
            return cls(success=False, errors=[str(e)])


class ComplianceFrameworkOutput(graphene.ObjectType):
    id = graphene.String()
    enabled = graphene.Boolean()


class ToggleFramework(graphene.Mutation):
    """Enable or disable a compliance framework."""

    class Arguments:
        framework_id = graphene.ID(required=True)
        enabled = graphene.Boolean(required=True)

    framework = graphene.Field(ComplianceFrameworkOutput)
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.ZENTINELLE_COMPLIANCE_CHECKS)
    def mutate(cls, root, info, framework_id, enabled):
        if not info.context.user.is_authenticated:
            return cls(framework=None, errors=['Authentication required'])

        from zentinelle.models import ComplianceFrameworkConfig
        from zentinelle.schema.auth_helpers import get_request_tenant_id
        tenant_id = get_request_tenant_id(info.context.user) or 'default'

        config, _ = ComplianceFrameworkConfig.objects.update_or_create(
            tenant_id=tenant_id,
            framework_id=framework_id,
            defaults={'is_enabled': enabled},
        )
        return cls(
            framework=ComplianceFrameworkOutput(
                id=str(config.id),
                enabled=config.is_enabled,
            ),
            errors=None,
        )
