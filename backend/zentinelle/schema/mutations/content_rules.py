"""
Content Rule Mutations.

GraphQL mutations for managing content scanning/filtering rules.

These mutations require the MONITORING_CUSTOM_RULES feature (Business or Enterprise plan).
"""
import graphene
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


# =============================================================================
# Content Rule Input Types
# =============================================================================

class CreateContentRuleInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    description = graphene.String()
    rule_type = graphene.String(required=True)
    severity = graphene.String()
    enforcement = graphene.String()
    scan_mode = graphene.String()
    scan_input = graphene.Boolean()
    scan_output = graphene.Boolean()
    scan_context = graphene.Boolean()
    scope_type = graphene.String()
    scope_deployment_id = graphene.ID()
    scope_endpoint_id = graphene.ID()
    priority = graphene.Int()
    enabled = graphene.Boolean()
    notify_user = graphene.Boolean()
    notify_admins = graphene.Boolean()
    webhook_url = graphene.String()
    config = graphene.JSONString()


class UpdateContentRuleInput(graphene.InputObjectType):
    id = graphene.ID(required=True)
    name = graphene.String()
    description = graphene.String()
    rule_type = graphene.String()
    severity = graphene.String()
    enforcement = graphene.String()
    scan_mode = graphene.String()
    scan_input = graphene.Boolean()
    scan_output = graphene.Boolean()
    scan_context = graphene.Boolean()
    scope_type = graphene.String()
    priority = graphene.Int()
    enabled = graphene.Boolean()
    notify_user = graphene.Boolean()
    notify_admins = graphene.Boolean()
    webhook_url = graphene.String()
    config = graphene.JSONString()


# =============================================================================
# Content Rule Mutations
# =============================================================================

class CreateContentRule(graphene.Mutation):
    """Create a new content scanning rule."""

    class Arguments:
        input = CreateContentRuleInput(required=True)

    success = graphene.Boolean()
    rule_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
    def mutate(cls, root, info, input):
        user = info.context.user
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
            return CreateContentRule(success=True, rule_id=str(rule.id))
        except Exception as e:
            return CreateContentRule(success=False, errors=[str(e)])


class UpdateContentRule(graphene.Mutation):
    """Update an existing content rule."""

    class Arguments:
        input = UpdateContentRuleInput(required=True)

    success = graphene.Boolean()
    rule_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
    def mutate(cls, root, info, input):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(input.id)
            rule = ContentRule.objects.get(pk=pk)
        except (ValueError, ContentRule.DoesNotExist):
            return UpdateContentRule(success=False, errors=["Rule not found"])

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
        return UpdateContentRule(success=True, rule_id=str(rule.id))


class DeleteContentRule(graphene.Mutation):
    """Delete a content rule."""

    class Arguments:
        id = graphene.ID(required=True)

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
    def mutate(cls, root, info, id):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            rule = ContentRule.objects.get(pk=pk)
        except (ValueError, ContentRule.DoesNotExist):
            return DeleteContentRule(success=False, errors=["Rule not found"])

        if not user_has_org_access(user, rule.organization_id):
            raise GraphQLError("Access denied")

        rule.delete()
        return DeleteContentRule(success=True)


class ToggleContentRuleEnabled(graphene.Mutation):
    """Toggle a content rule's enabled status."""

    class Arguments:
        id = graphene.ID(required=True)
        enabled = graphene.Boolean(required=True)

    success = graphene.Boolean()
    rule_id = graphene.ID()

    @classmethod
    @require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
    def mutate(cls, root, info, id, enabled):
        user = info.context.user
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

        return ToggleContentRuleEnabled(success=True, rule_id=str(rule.id))


class DuplicateContentRule(graphene.Mutation):
    """Duplicate an existing content rule."""

    class Arguments:
        id = graphene.ID(required=True)
        new_name = graphene.String()

    success = graphene.Boolean()
    rule_id = graphene.ID()
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
    def mutate(cls, root, info, id, new_name=None):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            original_rule = ContentRule.objects.get(pk=pk)
        except (ValueError, ContentRule.DoesNotExist):
            return DuplicateContentRule(success=False, errors=["Rule not found"])

        if not user_has_org_access(user, original_rule.organization_id):
            raise GraphQLError("Access denied")

        # Create a copy
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
            enabled=False,  # Start disabled
            notify_user=original_rule.notify_user,
            notify_admins=original_rule.notify_admins,
            webhook_url=original_rule.webhook_url,
            config=original_rule.config,
        )

        return DuplicateContentRule(success=True, rule_id=str(new_rule.id))


class TestContentRule(graphene.Mutation):
    """Test a content rule against sample input."""

    class Arguments:
        id = graphene.ID(required=True)
        test_content = graphene.String(required=True)

    success = graphene.Boolean()
    matched = graphene.Boolean()
    matches = graphene.List(graphene.JSONString)
    errors = graphene.List(graphene.String)

    @classmethod
    @require_feature_for_mutation(Features.MONITORING_CUSTOM_RULES)
    def mutate(cls, root, info, id, test_content):
        user = info.context.user
        if not user.is_authenticated:
            raise GraphQLError("Authentication required")

        try:
            _, pk = from_global_id(id)
            rule = ContentRule.objects.get(pk=pk)
        except (ValueError, ContentRule.DoesNotExist):
            return TestContentRule(success=False, errors=["Rule not found"])

        if not user_has_org_access(user, rule.organization_id):
            raise GraphQLError("Access denied")

        # Run the rule against test content
        # This is a simplified test - real implementation would use the scanner
        matches = []
        matched = False

        # Check for pattern matches based on rule type
        if rule.config and 'patterns' in rule.config:
            import re
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

        return TestContentRule(
            success=True,
            matched=matched,
            matches=matches,
        )
