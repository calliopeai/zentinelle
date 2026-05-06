"""
Content Rule Mutations.

GraphQL mutations for managing content scanning/filtering rules.

These mutations require the MONITORING_CUSTOM_RULES feature (Business or Enterprise plan).
"""
import re
import strawberry
from strawberry.scalars import JSON
from typing import Optional
from graphql import GraphQLError
from graphql_relay import from_global_id

try:
    from billing.features import Features, require_feature_for_mutation
except ImportError:
    class Features:
        MONITORING_CUSTOM_RULES = 'monitoring_custom_rules'

    def require_feature_for_mutation(feature):
        def decorator(fn):
            return fn
        return decorator
from zentinelle.models import ContentRule
from zentinelle.schema.auth_helpers import user_has_org_access


@strawberry.input
class CreateContentRuleInput:
    name: str
    description: Optional[str] = None
    rule_type: str
    severity: Optional[str] = None
    enforcement: Optional[str] = None
    scan_mode: Optional[str] = None
    scan_input: Optional[bool] = None
    scan_output: Optional[bool] = None
    scan_context: Optional[bool] = None
    scope_type: Optional[str] = None
    scope_deployment_id: Optional[strawberry.ID] = None
    scope_endpoint_id: Optional[strawberry.ID] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    notify_user: Optional[bool] = None
    notify_admins: Optional[bool] = None
    webhook_url: Optional[str] = None
    config: Optional[JSON] = None


@strawberry.input
class UpdateContentRuleInput:
    id: strawberry.ID
    name: Optional[str] = None
    description: Optional[str] = None
    rule_type: Optional[str] = None
    severity: Optional[str] = None
    enforcement: Optional[str] = None
    scan_mode: Optional[str] = None
    scan_input: Optional[bool] = None
    scan_output: Optional[bool] = None
    scan_context: Optional[bool] = None
    scope_type: Optional[str] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    notify_user: Optional[bool] = None
    notify_admins: Optional[bool] = None
    webhook_url: Optional[str] = None
    config: Optional[JSON] = None


@strawberry.type
class CreateContentRulePayload:
    success: Optional[bool] = None
    rule_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class UpdateContentRulePayload:
    success: Optional[bool] = None
    rule_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class DeleteContentRulePayload:
    success: Optional[bool] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class ToggleContentRuleEnabledPayload:
    success: Optional[bool] = None
    rule_id: Optional[strawberry.ID] = None


@strawberry.type
class DuplicateContentRulePayload:
    success: Optional[bool] = None
    rule_id: Optional[strawberry.ID] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class TestContentRulePayload:
    success: Optional[bool] = None
    matched: Optional[bool] = None
    matches: Optional[list[JSON]] = None
    errors: list[str] = strawberry.field(default_factory=list)


@require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
def create_content_rule(info: strawberry.types.Info, input: CreateContentRuleInput) -> CreateContentRulePayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        from deployments.models import Deployment
        from zentinelle.models import AgentEndpoint

        scope_deployment = None
        scope_endpoint = None

        if input.scope_deployment_id:
            _, dep_pk = from_global_id(input.scope_deployment_id)
            scope_deployment = Deployment.objects.get(pk=dep_pk)

        if input.scope_endpoint_id:
            _, ep_pk = from_global_id(input.scope_endpoint_id)
            scope_endpoint = AgentEndpoint.objects.get(pk=ep_pk)

        rule = ContentRule.objects.create(
            organization=user.organization,
            name=input.name,
            description=input.description or '',
            rule_type=input.rule_type,
            severity=input.severity or ContentRule.Severity.MEDIUM,
            enforcement=input.enforcement or ContentRule.Enforcement.LOG_ONLY,
            scan_mode=input.scan_mode or ContentRule.ScanMode.REALTIME,
            scan_input=input.scan_input if input.scan_input is not None else True,
            scan_output=input.scan_output if input.scan_output is not None else True,
            scan_context=input.scan_context if input.scan_context is not None else False,
            scope_type=input.scope_type or ContentRule.ScopeType.ORGANIZATION,
            scope_deployment=scope_deployment,
            scope_endpoint=scope_endpoint,
            priority=input.priority or 0,
            enabled=input.enabled if input.enabled is not None else True,
            notify_user=input.notify_user or False,
            notify_admins=input.notify_admins or False,
            webhook_url=input.webhook_url or '',
            config=input.config or {},
        )
        return CreateContentRulePayload(success=True, rule_id=str(rule.id))
    except Exception as e:
        return CreateContentRulePayload(success=False, errors=[str(e)])


@require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
def update_content_rule(info: strawberry.types.Info, input: UpdateContentRuleInput) -> UpdateContentRulePayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(input.id)
        rule = ContentRule.objects.get(pk=pk)
    except (ValueError, ContentRule.DoesNotExist):
        return UpdateContentRulePayload(success=False, errors=["Rule not found"])

    if not user_has_org_access(user, rule.organization_id):
        raise GraphQLError("Access denied")

    update_fields = ['updated_at']

    if input.name is not None:
        rule.name = input.name
        update_fields.append('name')
    if input.description is not None:
        rule.description = input.description
        update_fields.append('description')
    if input.rule_type is not None:
        rule.rule_type = input.rule_type
        update_fields.append('rule_type')
    if input.severity is not None:
        rule.severity = input.severity
        update_fields.append('severity')
    if input.enforcement is not None:
        rule.enforcement = input.enforcement
        update_fields.append('enforcement')
    if input.scan_mode is not None:
        rule.scan_mode = input.scan_mode
        update_fields.append('scan_mode')
    if input.scan_input is not None:
        rule.scan_input = input.scan_input
        update_fields.append('scan_input')
    if input.scan_output is not None:
        rule.scan_output = input.scan_output
        update_fields.append('scan_output')
    if input.scan_context is not None:
        rule.scan_context = input.scan_context
        update_fields.append('scan_context')
    if input.scope_type is not None:
        rule.scope_type = input.scope_type
        update_fields.append('scope_type')
    if input.priority is not None:
        rule.priority = input.priority
        update_fields.append('priority')
    if input.enabled is not None:
        rule.enabled = input.enabled
        update_fields.append('enabled')
    if input.notify_user is not None:
        rule.notify_user = input.notify_user
        update_fields.append('notify_user')
    if input.notify_admins is not None:
        rule.notify_admins = input.notify_admins
        update_fields.append('notify_admins')
    if input.webhook_url is not None:
        rule.webhook_url = input.webhook_url
        update_fields.append('webhook_url')
    if input.config is not None:
        rule.config = input.config
        update_fields.append('config')

    rule.save(update_fields=update_fields)
    return UpdateContentRulePayload(success=True, rule_id=str(rule.id))


@require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
def delete_content_rule(info: strawberry.types.Info, id: strawberry.ID) -> DeleteContentRulePayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        rule = ContentRule.objects.get(pk=pk)
    except (ValueError, ContentRule.DoesNotExist):
        return DeleteContentRulePayload(success=False, errors=["Rule not found"])

    if not user_has_org_access(user, rule.organization_id):
        raise GraphQLError("Access denied")

    rule.delete()
    return DeleteContentRulePayload(success=True)


@require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
def toggle_content_rule_enabled(info: strawberry.types.Info, id: strawberry.ID, enabled: bool) -> ToggleContentRuleEnabledPayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        rule = ContentRule.objects.get(pk=pk)
    except (ValueError, ContentRule.DoesNotExist):
        raise GraphQLError("Rule not found")

    if not user_has_org_access(user, rule.organization_id):
        raise GraphQLError("Access denied")

    rule.enabled = enabled
    rule.save(update_fields=['enabled', 'updated_at'])

    return ToggleContentRuleEnabledPayload(success=True, rule_id=str(rule.id))


@require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
def duplicate_content_rule(info: strawberry.types.Info, id: strawberry.ID, new_name: Optional[str] = None) -> DuplicateContentRulePayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        original_rule = ContentRule.objects.get(pk=pk)
    except (ValueError, ContentRule.DoesNotExist):
        return DuplicateContentRulePayload(success=False, errors=["Rule not found"])

    if not user_has_org_access(user, original_rule.organization_id):
        raise GraphQLError("Access denied")

    new_rule = ContentRule.objects.create(
        organization=original_rule.organization,
        name=new_name or f"{original_rule.name} (Copy)",
        description=original_rule.description,
        rule_type=original_rule.rule_type,
        severity=original_rule.severity,
        enforcement=original_rule.enforcement,
        scan_mode=original_rule.scan_mode,
        scan_input=original_rule.scan_input,
        scan_output=original_rule.scan_output,
        scan_context=original_rule.scan_context,
        scope_type=original_rule.scope_type,
        scope_deployment=original_rule.scope_deployment,
        scope_endpoint=original_rule.scope_endpoint,
        priority=original_rule.priority,
        enabled=False,
        notify_user=original_rule.notify_user,
        notify_admins=original_rule.notify_admins,
        webhook_url=original_rule.webhook_url,
        config=original_rule.config,
    )

    return DuplicateContentRulePayload(success=True, rule_id=str(new_rule.id))


@require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
def test_content_rule(info: strawberry.types.Info, id: strawberry.ID, test_content: str) -> TestContentRulePayload:
    user = info.context.request.user
    if not user.is_authenticated:
        raise GraphQLError("Authentication required")

    try:
        _, pk = from_global_id(id)
        rule = ContentRule.objects.get(pk=pk)
    except (ValueError, ContentRule.DoesNotExist):
        return TestContentRulePayload(success=False, errors=["Rule not found"])

    if not user_has_org_access(user, rule.organization_id):
        raise GraphQLError("Access denied")

    matches = []
    matched = False

    if rule.config and 'patterns' in rule.config:
        for pattern in rule.config.get('patterns', []):
            try:
                regex = re.compile(pattern, re.IGNORECASE)
                for match in regex.finditer(test_content):
                    matches.append({
                        'pattern': pattern,
                        'match': match.group(),
                        'start': match.start(),
                        'end': match.end(),
                    })
                    matched = True
            except re.error:
                pass

    if rule.config and 'keywords' in rule.config:
        for keyword in rule.config.get('keywords', []):
            if keyword.lower() in test_content.lower():
                matches.append({
                    'keyword': keyword,
                    'matched': True,
                })
                matched = True

    return TestContentRulePayload(
        success=True,
        matched=matched,
        matches=matches,
    )
