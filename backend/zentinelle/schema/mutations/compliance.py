"""
Compliance GraphQL Mutations.

These mutations require the ZENTINELLE_COMPLIANCE_CHECKS feature (Enterprise plan).
"""
import graphene
from graphene import relay

from billing.features import Features, require_feature_for_mutation


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

        # For now, return stub response - in production this would
        # update a ComplianceFramework model
        return cls(
            framework=ComplianceFrameworkOutput(
                id=framework_id,
                enabled=enabled,
            ),
            errors=None,
        )
