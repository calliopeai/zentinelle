"""
Compliance pack GraphQL mutations.

Provides a single mutation to activate a pre-configured compliance pack
(HIPAA, SOC2, GDPR, EU AI Act) for a tenant with one call.
"""
import logging
from typing import Optional

import strawberry

from zentinelle.schema.auth_helpers import (get_request_tenant_id,
                                            user_has_org_access)
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

    # A supplied tenant_id is checked against the caller rather than believed.
    # It used to win outright, so any authenticated caller could activate a
    # pack — or, with enforcement='disabled', deactivate the controls — in
    # somebody else's tenant, and the pack writes policies through
    # `Policy.objects.update_or_create`.
    user = info.context.request.user
    if tenant_id and not user_has_org_access(user, tenant_id):
        return ActivateCompliancePackPayload(success=False, error='Not permitted for that tenant')

    if not tenant_id:
        # The caller's own tenant, resolved the way every other resolver does.
        # A portal session has neither `tenant_id` nor `memberships`, which is
        # all this used to look for, so it never found one.
        tenant_id = get_request_tenant_id(user)
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
