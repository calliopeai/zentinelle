"""
Compliance pack definitions and activation service.

Each pack is a curated set of Policy configs that, when activated,
bring a tenant to baseline compliance for that framework.
"""
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


COMPLIANCE_PACKS: Dict[str, dict] = {
    "hipaa": {
        "name": "hipaa",
        "display_name": "HIPAA Security Rule",
        "version": "2024-01",
        "description": (
            "Baseline policies for HIPAA Security Rule compliance. "
            "Covers PHI output blocking, comprehensive audit logging, "
            "session management, data retention, and access controls."
        ),
        "policies": [
            {
                "name": "HIPAA: PHI Output Blocking",
                "policy_type": "output_filter",
                "enforcement": "enforce",
                "priority": 90,
                "config": {
                    "block_pii": True,
                    "block_secrets": True,
                    "blocked_patterns": [
                        r"\b\d{3}-\d{2}-\d{4}\b",   # SSN
                        r"\b\d{10,11}\b",             # NPI / phone
                    ],
                    "filter_code_blocks": False,
                },
            },
            {
                "name": "HIPAA: Comprehensive Audit Logging",
                "policy_type": "audit_policy",
                "enforcement": "enforce",
                "priority": 85,
                "config": {
                    "log_all_prompts": True,
                    "log_all_responses": True,
                    "log_tool_calls": True,
                    "retention_days": 2555,  # 7 years
                },
            },
            {
                "name": "HIPAA: Session Security",
                "policy_type": "session_policy",
                "enforcement": "enforce",
                "priority": 80,
                "config": {
                    "max_session_duration_hours": 8,
                    "idle_timeout_minutes": 15,
                    "require_mfa": True,
                },
            },
            {
                "name": "HIPAA: Data Retention",
                "policy_type": "data_retention",
                "enforcement": "enforce",
                "priority": 75,
                "config": {
                    "event_retention_days": 2555,
                    "audit_log_retention_days": 2555,
                    "auto_delete_user_data": False,
                },
            },
            {
                "name": "HIPAA: Data Access Controls",
                "policy_type": "data_access",
                "enforcement": "enforce",
                "priority": 85,
                "config": {
                    "allowed_databases": [],
                    "read_only_databases": [],
                    "blocked_tables": ["phi_raw", "patient_records"],
                },
            },
        ],
    },

    "soc2": {
        "name": "soc2",
        "display_name": "SOC 2 Type II",
        "version": "2024-01",
        "description": (
            "Baseline policies for SOC 2 Type II audit readiness. "
            "Covers audit logging, network access, session controls, "
            "AI guardrails, and data access restrictions."
        ),
        "policies": [
            {
                "name": "SOC2: Audit Logging",
                "policy_type": "audit_policy",
                "enforcement": "enforce",
                "priority": 85,
                "config": {
                    "log_all_prompts": True,
                    "log_all_responses": True,
                    "log_tool_calls": True,
                    "retention_days": 365,
                },
            },
            {
                "name": "SOC2: Network Access Control",
                "policy_type": "network_policy",
                "enforcement": "enforce",
                "priority": 80,
                "config": {
                    "allowed_outbound_domains": [],
                    "blocked_outbound_domains": [],
                    "block_public_internet": False,
                },
            },
            {
                "name": "SOC2: Session Policy",
                "policy_type": "session_policy",
                "enforcement": "enforce",
                "priority": 75,
                "config": {
                    "max_session_duration_hours": 12,
                    "idle_timeout_minutes": 30,
                    "require_mfa": True,
                },
            },
            {
                "name": "SOC2: AI Guardrails",
                "policy_type": "ai_guardrail",
                "enforcement": "enforce",
                "priority": 70,
                "config": {
                    "blocked_topics": [],
                    "pii_redaction": True,
                    "toxicity_threshold": 0.8,
                    "prompt_injection_detection": True,
                },
            },
            {
                "name": "SOC2: Data Access Restrictions",
                "policy_type": "data_access",
                "enforcement": "audit",
                "priority": 65,
                "config": {
                    "allowed_databases": [],
                    "read_only_databases": [],
                    "blocked_tables": [],
                },
            },
        ],
    },

    "gdpr": {
        "name": "gdpr",
        "display_name": "GDPR",
        "version": "2024-01",
        "description": (
            "Baseline policies for GDPR compliance. "
            "Covers PII output filtering, data retention limits, "
            "audit logging, session controls, and data access governance."
        ),
        "policies": [
            {
                "name": "GDPR: PII Output Filter",
                "policy_type": "output_filter",
                "enforcement": "enforce",
                "priority": 90,
                "config": {
                    "block_pii": True,
                    "block_secrets": False,
                    "blocked_patterns": [],
                    "filter_code_blocks": False,
                    "filter_urls": False,
                },
            },
            {
                "name": "GDPR: Data Retention Limits",
                "policy_type": "data_retention",
                "enforcement": "enforce",
                "priority": 85,
                "config": {
                    "event_retention_days": 365,
                    "audit_log_retention_days": 730,
                    "auto_delete_user_data": True,
                },
            },
            {
                "name": "GDPR: Audit Logging",
                "policy_type": "audit_policy",
                "enforcement": "enforce",
                "priority": 80,
                "config": {
                    "log_all_prompts": True,
                    "log_all_responses": False,
                    "log_tool_calls": True,
                    "retention_days": 730,
                },
            },
            {
                "name": "GDPR: Session Controls",
                "policy_type": "session_policy",
                "enforcement": "enforce",
                "priority": 70,
                "config": {
                    "max_session_duration_hours": 24,
                    "idle_timeout_minutes": 60,
                    "require_mfa": False,
                },
            },
            {
                "name": "GDPR: Data Access Governance",
                "policy_type": "data_access",
                "enforcement": "enforce",
                "priority": 75,
                "config": {
                    "allowed_databases": [],
                    "read_only_databases": [],
                    "blocked_tables": ["personal_data_raw", "user_profiles"],
                },
            },
        ],
    },

    "eu_ai_act": {
        "name": "eu_ai_act",
        "display_name": "EU AI Act (High-Risk)",
        "version": "2024-08",
        "description": (
            "Baseline policies for EU AI Act compliance for high-risk AI systems. "
            "Covers human oversight requirements, AI guardrails, comprehensive audit logging, "
            "output filtering, and network access controls."
        ),
        "policies": [
            {
                "name": "EU AI Act: Human Oversight",
                "policy_type": "ai_guardrail",
                "enforcement": "enforce",
                "priority": 95,
                "config": {
                    "blocked_topics": [],
                    "pii_redaction": True,
                    "toxicity_threshold": 0.7,
                    "prompt_injection_detection": True,
                },
            },
            {
                "name": "EU AI Act: Comprehensive Audit Trail",
                "policy_type": "audit_policy",
                "enforcement": "enforce",
                "priority": 90,
                "config": {
                    "log_all_prompts": True,
                    "log_all_responses": True,
                    "log_tool_calls": True,
                    "retention_days": 3650,  # 10 years for high-risk
                },
            },
            {
                "name": "EU AI Act: Output Transparency Filter",
                "policy_type": "output_filter",
                "enforcement": "enforce",
                "priority": 85,
                "config": {
                    "block_pii": True,
                    "block_secrets": True,
                    "blocked_patterns": [],
                    "filter_code_blocks": False,
                    "filter_urls": False,
                },
            },
            {
                "name": "EU AI Act: Data Retention",
                "policy_type": "data_retention",
                "enforcement": "enforce",
                "priority": 80,
                "config": {
                    "event_retention_days": 3650,
                    "audit_log_retention_days": 3650,
                    "auto_delete_user_data": False,
                },
            },
            {
                "name": "EU AI Act: Network Access Restrictions",
                "policy_type": "network_policy",
                "enforcement": "audit",
                "priority": 70,
                "config": {
                    "allowed_outbound_domains": [],
                    "blocked_outbound_domains": [],
                    "block_public_internet": False,
                },
            },
        ],
    },
}


def get_pack(pack_name: str) -> Optional[dict]:
    """
    Return the full pack definition for pack_name, or None if not found.
    """
    return COMPLIANCE_PACKS.get(pack_name)


def list_packs() -> List[dict]:
    """
    Return metadata for all available compliance packs (without policy lists).
    """
    return [
        {
            "name": pack["name"],
            "display_name": pack["display_name"],
            "version": pack["version"],
            "description": pack["description"],
            "policy_count": len(pack["policies"]),
        }
        for pack in COMPLIANCE_PACKS.values()
    ]


def activate_pack(
    tenant_id: str,
    pack_name: str,
    enforcement: str = "enforce",
) -> dict:
    """
    Activate a compliance pack for a tenant.

    For each policy in the pack, calls Policy.objects.update_or_create
    so the operation is idempotent — running it twice won't duplicate policies.

    Args:
        tenant_id:   Tenant to activate the pack for.
        pack_name:   One of the keys in COMPLIANCE_PACKS.
        enforcement: Override enforcement level for all policies in the pack.
                     Defaults to 'enforce'. Set to 'audit' for a non-blocking
                     trial activation.

    Returns:
        {
            'policies_created': int,
            'policies_updated': int,
            'pack': str,
            'version': str,
        }

    Raises:
        ValueError: If pack_name is not a known compliance pack.
    """
    from zentinelle.models import Policy

    pack = COMPLIANCE_PACKS.get(pack_name)
    if pack is None:
        raise ValueError(
            f"Unknown compliance pack: '{pack_name}'. "
            f"Available packs: {', '.join(COMPLIANCE_PACKS.keys())}"
        )

    policies_created = 0
    policies_updated = 0

    for policy_def in pack["policies"]:
        _obj, created = Policy.objects.update_or_create(
            tenant_id=tenant_id,
            name=policy_def["name"],
            defaults={
                "policy_type": policy_def["policy_type"],
                "enforcement": enforcement,
                "priority": policy_def["priority"],
                "config": policy_def["config"],
                "enabled": True,
                "description": (
                    f"Activated via {pack['display_name']} compliance pack "
                    f"v{pack['version']}."
                ),
            },
        )
        if created:
            policies_created += 1
        else:
            policies_updated += 1

    logger.info(
        "Compliance pack '%s' activated for tenant %s: %d created, %d updated",
        pack_name,
        tenant_id,
        policies_created,
        policies_updated,
    )

    return {
        "policies_created": policies_created,
        "policies_updated": policies_updated,
        "pack": pack_name,
        "version": pack["version"],
    }
