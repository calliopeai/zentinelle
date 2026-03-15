"""
Compliance pack GraphQL mutations.

Provides a single mutation to activate a pre-configured compliance pack
(HIPAA, SOC2, GDPR, EU AI Act) for a tenant with one call.
"""
import logging

import graphene

from zentinelle.services.compliance_packs import activate_pack, list_packs

logger = logging.getLogger(__name__)


class CompliancePackMetaType(graphene.ObjectType):
    """Metadata about an available compliance pack."""
    name = graphene.String(description='Pack identifier (e.g. hipaa)')
    display_name = graphene.String(description='Human-readable name')
    version = graphene.String(description='Pack version string')
    description = graphene.String(description='What this pack covers')
    policy_count = graphene.Int(description='Number of policies in the pack')


class ActivateCompliancePack(graphene.Mutation):
    """
    Activate a compliance pack for a tenant.

    Creates or updates policies in bulk to bring the tenant to baseline
    compliance for the requested framework.

    Example:
        mutation {
            activateCompliancePack(pack: "hipaa", enforcement: "enforce") {
                policiesCreated
                policiesUpdated
                packVersion
                packName
            }
        }
    """

    class Arguments:
        pack = graphene.String(
            required=True,
            description='Pack name: hipaa | soc2 | gdpr | eu_ai_act',
        )
        tenant_id = graphene.String(
            required=False,
            description='Tenant ID. Defaults to the authenticated user\'s tenant.',
        )
        enforcement = graphene.String(
            required=False,
            default_value='enforce',
            description='enforce | audit | disabled (default: enforce)',
        )

    policies_created = graphene.Int()
    policies_updated = graphene.Int()
    pack_version = graphene.String()
    pack_name = graphene.String()
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, pack, tenant_id=None, enforcement='enforce'):
        if not info.context.user.is_authenticated:
            return cls(success=False, error='Authentication required')

        # Resolve tenant_id
        if not tenant_id:
            user = info.context.user
            if hasattr(user, 'tenant_id'):
                tenant_id = user.tenant_id
            elif hasattr(user, 'memberships'):
                membership = user.memberships.filter(is_active=True).first()
                if membership:
                    tenant_id = str(membership.organization_id)
            if not tenant_id:
                return cls(success=False, error='Could not determine tenant_id')

        # Validate enforcement value
        valid_enforcement = ['enforce', 'audit', 'disabled']
        if enforcement not in valid_enforcement:
            return cls(
                success=False,
                error=f"Invalid enforcement '{enforcement}'. Must be one of: {', '.join(valid_enforcement)}",
            )

        try:
            result = activate_pack(
                tenant_id=tenant_id,
                pack_name=pack,
                enforcement=enforcement,
            )
        except ValueError as e:
            return cls(success=False, error=str(e))
        except Exception as e:
            logger.exception("Error activating compliance pack '%s': %s", pack, e)
            return cls(success=False, error='Failed to activate compliance pack')

        return cls(
            success=True,
            policies_created=result['policies_created'],
            policies_updated=result['policies_updated'],
            pack_version=result['version'],
            pack_name=result['pack'],
        )


class ListCompliancePacks(graphene.Mutation):
    """
    List all available compliance packs.

    Returns metadata (without full policy lists) for all packs.
    """

    class Arguments:
        pass

    packs = graphene.List(CompliancePackMetaType)
    success = graphene.Boolean()

    @classmethod
    def mutate(cls, root, info):
        if not info.context.user.is_authenticated:
            return cls(success=False, packs=[])

        packs_data = list_packs()
        packs = [
            CompliancePackMetaType(
                name=p['name'],
                display_name=p['display_name'],
                version=p['version'],
                description=p['description'],
                policy_count=p['policy_count'],
            )
            for p in packs_data
        ]
        return cls(success=True, packs=packs)
