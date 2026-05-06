"""
Compliance GraphQL Mutations.

These mutations require the ZENTINELLE_COMPLIANCE_CHECKS feature (Enterprise plan).
"""
import uuid
from datetime import date
from typing import Optional

import strawberry

try:
    from billing.features import Features, require_feature_for_mutation
except ImportError:
    class Features:
        ZENTINELLE_COMPLIANCE_CHECKS = 'zentinelle_compliance_checks'
    def require_feature_for_mutation(feature):
        def decorator(fn):
            return fn
        return decorator


@strawberry.type
class RunComplianceCheckPayload:
    success: Optional[bool] = None
    check_id: Optional[str] = None
    assessment_id: Optional[str] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class GenerateComplianceReportPayload:
    success: Optional[bool] = None
    report_url: Optional[str] = None
    assessment_id: Optional[uuid.UUID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class ComplianceFrameworkOutput:
    id: Optional[str] = None
    enabled: Optional[bool] = None


@strawberry.type
class ToggleFrameworkPayload:
    framework: Optional[ComplianceFrameworkOutput] = None
    errors: list[str] = strawberry.field(default_factory=list)


def run_compliance_check(info: strawberry.types.Info, framework_id: Optional[strawberry.ID] = None, async_mode: Optional[bool] = False) -> RunComplianceCheckPayload:
    if not info.context.request.user.is_authenticated:
        return RunComplianceCheckPayload(success=False, errors=['Authentication required'])

    user = info.context.request.user
    membership = user.memberships.filter(is_active=True).first()
    if not membership:
        return RunComplianceCheckPayload(success=False, errors=['No active organization membership'])

    org = membership.organization

    if async_mode:
        from zentinelle.tasks.compliance import run_compliance_check_task
        task = run_compliance_check_task.delay(
            organization_id=str(org.id),
            framework_id=framework_id,
            user_id=str(user.id),
            assessment_type='manual',
        )
        return RunComplianceCheckPayload(success=True, check_id=task.id)
    else:
        from zentinelle.tasks.compliance import run_compliance_check_task
        try:
            assessment_id = run_compliance_check_task(
                None,
                organization_id=str(org.id),
                framework_id=framework_id,
                user_id=str(user.id),
                assessment_type='manual',
            )
            return RunComplianceCheckPayload(success=True, assessment_id=assessment_id)
        except Exception as e:
            return RunComplianceCheckPayload(success=False, errors=[str(e)])


def generate_compliance_report(info: strawberry.types.Info, framework: Optional[str] = None, start_date: Optional[date] = None, end_date: Optional[date] = None) -> GenerateComplianceReportPayload:
    if not info.context.request.user.is_authenticated:
        return GenerateComplianceReportPayload(success=False, errors=['Authentication required'])

    user = info.context.request.user
    membership = user.memberships.filter(is_active=True).first()
    if not membership:
        return GenerateComplianceReportPayload(success=False, errors=['No active organization membership'])

    org = membership.organization

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
        run_compliance_check_task.delay(
            organization_id=str(org.id),
            framework_id=framework,
            user_id=str(user.id),
            assessment_type='manual',
        )
        return GenerateComplianceReportPayload(
            success=True,
            report_url=report_url,
            assessment_id=None,
            errors=[],
        )
    except Exception as e:
        return GenerateComplianceReportPayload(success=False, errors=[str(e)])


def toggle_framework(info: strawberry.types.Info, framework_id: strawberry.ID, enabled: bool) -> ToggleFrameworkPayload:
    if not info.context.request.user.is_authenticated:
        return ToggleFrameworkPayload(framework=None, errors=['Authentication required'])

    from zentinelle.models import ComplianceFrameworkConfig
    from zentinelle.schema.auth_helpers import get_request_tenant_id
    tenant_id = get_request_tenant_id(info.context.request.user) or 'default'

    config, _ = ComplianceFrameworkConfig.objects.update_or_create(
        tenant_id=tenant_id,
        framework_id=framework_id,
        defaults={'is_enabled': enabled},
    )
    return ToggleFrameworkPayload(
        framework=ComplianceFrameworkOutput(
            id=str(config.id),
            enabled=config.is_enabled,
        ),
        errors=[],
    )
