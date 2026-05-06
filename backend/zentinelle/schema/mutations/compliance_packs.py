"""
Compliance pack GraphQL mutations.

Provides a single mutation to activate a pre-configured compliance pack
(HIPAA, SOC2, GDPR, EU AI Act) for a tenant with one call.
"""
import logging
from typing import Optional

import strawberry

from zentinelle.services.compliance_packs import activate_pack, list_packs

logger = logging.getLogger(__name__)


@strawberry.type
class CompliancePackMetaType:
    name: Optional[str] = None
    display_name: Optional[str] = None
    version: Optional[str] = None
    description: Optional[str] = None
    policy_count: Optional[int] = None


@strawberry.type
class ActivateCompliancePackPayload:
    policies_created: Optional[int] = None
    policies_updated: Optional[int] = None
    pack_version: Optional[str] = None
    pack_name: Optional[str] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class ListCompliancePacksPayload:
    packs: Optional[list[CompliancePackMetaType]] = None
    success: Optional[bool] = None


def activate_compliance_pack(info: strawberry.types.Info, pack: str, tenant_id: Optional[str] = None, enforcement: Optional[str] = 'enforce') -> ActivateCompliancePackPayload:
    if not info.context.request.user.is_authenticated:
        return ActivateCompliancePackPayload(success=False, error='Authentication required')

    if not tenant_id:
        user = info.context.request.user
        if hasattr(user, 'tenant_id'):
            tenant_id = user.tenant_id
        elif hasattr(user, 'memberships'):
            membership = user.memberships.filter(is_active=True).first()
            if membership:
                tenant_id = str(membership.organization_id)
        if not tenant_id:
            return ActivateCompliancePackPayload(success=False, error='Could not determine tenant_id')

    valid_enforcement = ['enforce', 'audit', 'disabled']
    if enforcement not in valid_enforcement:
        return ActivateCompliancePackPayload(
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
        return ActivateCompliancePackPayload(success=False, error=str(e))
    except Exception as e:
        logger.exception("Error activating compliance pack '%s': %s", pack, e)
        return ActivateCompliancePackPayload(success=False, error='Failed to activate compliance pack')

    return ActivateCompliancePackPayload(
        success=True,
        policies_created=result['policies_created'],
        policies_updated=result['policies_updated'],
        pack_version=result['version'],
        pack_name=result['pack'],
    )


def list_compliance_packs(info: strawberry.types.Info) -> ListCompliancePacksPayload:
    if not info.context.request.user.is_authenticated:
        return ListCompliancePacksPayload(success=False, packs=[])

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
    return ListCompliancePacksPayload(success=True, packs=packs)
