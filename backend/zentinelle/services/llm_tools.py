"""
Tools the AI assistant can call to inspect and manipulate the GRC system.

Each tool has a JSON schema (Anthropic/OpenAI compatible) and a Python
implementation. Read-only tools execute freely; state-changing tools
require confirmation upstream (the chat returns a 'pending action' the
user has to confirm in the UI).

Tool naming convention: snake_case verb_noun, scoped to the tenant.
"""
import json
import logging
from typing import Optional

from django.utils import timezone

logger = logging.getLogger(__name__)


# ─── Tool schemas (Anthropic format; OpenAI maps 1:1) ──────────────────

TOOL_SCHEMAS = [
    {
        "name": "list_agents",
        "description": (
            "List registered AI agents in this tenant. Returns agent_id, "
            "name, agent_type, status, health, and registered_at."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["active", "suspended", "offline", "all"],
                    "description": "Filter by status (default: all)",
                },
                "agent_type": {
                    "type": "string",
                    "description": "Filter by agent type (e.g. claude_code, codex, langchain)",
                },
                "name_contains": {
                    "type": "string",
                    "description": "Case-insensitive substring match on agent name",
                },
            },
        },
    },
    {
        "name": "get_agent_details",
        "description": "Get full details for one agent by agent_id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string"},
            },
            "required": ["agent_id"],
        },
    },
    {
        "name": "list_policies",
        "description": (
            "List policies. Returns name, policy_type, scope_type, "
            "enforcement, enabled, priority, config."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "policy_type": {"type": "string", "description": "e.g. rate_limit, tool_permission"},
                "scope_type": {"type": "string", "enum": ["organization", "team", "deployment", "endpoint", "user"]},
                "enabled_only": {"type": "boolean", "default": True},
                "name_contains": {"type": "string", "description": "Case-insensitive substring match on policy name"},
            },
        },
    },
    {
        "name": "get_policy_details",
        "description": "Get full details for one policy including config JSON.",
        "input_schema": {
            "type": "object",
            "properties": {"policy_id": {"type": "string"}},
            "required": ["policy_id"],
        },
    },
    {
        "name": "list_recent_events",
        "description": (
            "Recent events from the audit/telemetry stream. Filter by "
            "event_type or category. Returns most recent first."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "event_type": {"type": "string"},
                "category": {"type": "string", "enum": ["telemetry", "audit", "alert", "compliance"]},
                "limit": {"type": "integer", "default": 20, "maximum": 100},
                "since_hours": {"type": "integer", "default": 24, "description": "Look back N hours"},
            },
        },
    },
    {
        "name": "list_open_incidents",
        "description": "Incidents not yet resolved or closed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                "title_contains": {"type": "string", "description": "Case-insensitive substring match on title"},
            },
        },
    },
    {
        "name": "list_open_risks",
        "description": "Open risks ranked by RPN (severity x likelihood x impact).",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string"},
                "min_rpn": {"type": "integer", "description": "Minimum risk priority number"},
                "name_contains": {"type": "string", "description": "Case-insensitive substring match on risk name"},
            },
        },
    },
    {
        "name": "list_open_alerts",
        "description": "Open compliance alerts.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "acknowledge_incident",
        "description": (
            "Acknowledge an open incident. Marks it as being worked on. "
            "Reversible — does not resolve."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"incident_id": {"type": "string"}},
            "required": ["incident_id"],
        },
    },
    {
        "name": "acknowledge_alert",
        "description": "Acknowledge a compliance alert.",
        "input_schema": {
            "type": "object",
            "properties": {"alert_id": {"type": "string"}},
            "required": ["alert_id"],
        },
    },
    {
        "name": "review_risk",
        "description": "Mark a risk as reviewed.",
        "input_schema": {
            "type": "object",
            "properties": {"risk_id": {"type": "string"}},
            "required": ["risk_id"],
        },
    },
    {
        "name": "toggle_policy",
        "description": "Enable or disable a policy (toggles current state).",
        "input_schema": {
            "type": "object",
            "properties": {"policy_id": {"type": "string"}},
            "required": ["policy_id"],
        },
    },
    {
        "name": "run_compliance_check",
        "description": "Trigger an immediate compliance assessment across all enabled frameworks.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "verify_audit_chain",
        "description": "Verify the integrity of the tamper-evident audit log chain.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "update_policy",
        "description": (
            "Update fields on an existing policy. Pass only fields you "
            "want changed. Config is shallow-merged with the existing "
            "config — to *replace* config wholesale, pass replace_config=true."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "policy_id": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "enforcement": {"type": "string", "enum": ["enforce", "audit", "disabled"]},
                "enabled": {"type": "boolean"},
                "priority": {"type": "integer"},
                "config": {"type": "object", "description": "Partial config; merged with existing"},
                "replace_config": {"type": "boolean", "default": False},
            },
            "required": ["policy_id"],
        },
    },
    {
        "name": "update_risk",
        "description": "Update an existing risk's score, mitigation, or status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "risk_id": {"type": "string"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "category": {"type": "string"},
                "severity": {"type": "integer", "enum": [1, 2, 3, 5, 8]},
                "likelihood": {"type": "integer", "enum": [1, 2, 3, 5, 8]},
                "impact": {"type": "integer", "enum": [1, 2, 3, 5, 8]},
                "mitigation_plan": {"type": "string"},
                "status": {"type": "string", "enum": ["open", "reviewed", "mitigated", "accepted", "closed"]},
            },
            "required": ["risk_id"],
        },
    },
    {
        "name": "resolve_incident",
        "description": "Mark an incident as resolved. Records resolution notes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "incident_id": {"type": "string"},
                "resolution_notes": {"type": "string"},
            },
            "required": ["incident_id"],
        },
    },
    {
        "name": "create_policy",
        "description": (
            "Create a new policy. Use this when the user asks to add or "
            "configure a new governance rule. Returns the new policy id."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "policy_type": {
                    "type": "string",
                    "description": (
                        "One of: rate_limit, tool_permission, "
                        "model_restriction, network_policy, output_filter, "
                        "budget_limit, agent_capability, secret_access, "
                        "context_limit, prompt_injection, system_prompt, "
                        "ai_guardrail, human_oversight, data_retention, "
                        "data_access, audit_policy, agent_delegation, "
                        "behavioral_baseline, session_quota, resource_quota, "
                        "agent_memory, safety_settings, multimodal_policy, "
                        "session_policy"
                    ),
                },
                "scope_type": {
                    "type": "string",
                    "enum": ["organization", "team", "deployment", "endpoint", "user"],
                    "default": "organization",
                },
                "enforcement": {
                    "type": "string",
                    "enum": ["enforce", "audit", "disabled"],
                    "default": "enforce",
                },
                "config": {
                    "type": "object",
                    "description": (
                        "Type-specific config JSON. Examples:\n"
                        "- rate_limit: {\"requests_per_minute\": 60, \"tokens_per_day\": 100000}\n"
                        "- tool_permission: {\"allowed_tools\": [\"read\"], \"denied_tools\": [\"shell\"]}\n"
                        "- model_restriction: {\"allowed_models\": [\"claude-sonnet-4-5-20250929\"]}\n"
                        "- network_policy: {\"allowed_domains\": [\"*.openai.com\"]}\n"
                        "- budget_limit: {\"monthly_budget_usd\": 500}"
                    ),
                },
                "priority": {"type": "integer", "default": 0},
            },
            "required": ["name", "policy_type", "config"],
        },
    },
    {
        "name": "create_risk",
        "description": (
            "Add a new risk to the register. Use FMEA scoring: severity, "
            "likelihood, and impact each on a Fibonacci scale (1, 2, 3, 5, 8)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "category": {
                    "type": "string",
                    "enum": ["ai_safety", "data_privacy", "compliance",
                             "operational", "security", "financial", "reputational"],
                },
                "severity": {"type": "integer", "enum": [1, 2, 3, 5, 8]},
                "likelihood": {"type": "integer", "enum": [1, 2, 3, 5, 8]},
                "impact": {"type": "integer", "enum": [1, 2, 3, 5, 8]},
                "mitigation_plan": {"type": "string"},
            },
            "required": ["name", "description", "severity", "likelihood", "impact"],
        },
    },
    {
        "name": "generate_compliance_report",
        "description": (
            "Trigger generation of a compliance report. Returns the report "
            "ID once queued; the user can download from /compliance/reports."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "framework_id": {
                    "type": "string",
                    "description": "soc2, gdpr, hipaa, eu_ai_act, nist_ai_rmf, or 'all'",
                },
            },
        },
    },
    {
        "name": "suggest_policies_for_gaps",
        "description": (
            "Identify uncovered policy types and suggest a policy template "
            "for each gap. Returns a list of recommended policies the user "
            "could create."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "navigate_to",
        "description": (
            "Suggest the user navigate to a specific portal page. The UI "
            "will render this as a clickable link. Use for routing the "
            "user to where they can take an action manually."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Portal route, e.g. /policies/simulator"},
                "label": {"type": "string", "description": "What the link should say"},
            },
            "required": ["path", "label"],
        },
    },
]


# ─── Tool implementations ──────────────────────────────────────────────

def _list_agents(tenant_id: str, status: str = "all",
                agent_type: Optional[str] = None,
                name_contains: Optional[str] = None) -> dict:
    from zentinelle.models import AgentEndpoint
    qs = AgentEndpoint.objects.filter(tenant_id=tenant_id)
    if status and status != "all":
        qs = qs.filter(status=status)
    if agent_type:
        qs = qs.filter(agent_type=agent_type)
    if name_contains:
        qs = qs.filter(name__icontains=name_contains)
    agents = list(qs.values(
        "agent_id", "name", "agent_type", "status", "health", "created_at"
    )[:50])
    for a in agents:
        if a.get("created_at"):
            a["created_at"] = a["created_at"].isoformat()
    return {"agents": agents, "count": len(agents)}


def _get_agent_details(tenant_id: str, agent_id: str) -> dict:
    from zentinelle.models import AgentEndpoint
    obj = AgentEndpoint.objects.filter(
        tenant_id=tenant_id, agent_id=agent_id
    ).first()
    if not obj:
        return {"error": f"Agent '{agent_id}' not found"}
    return {
        "agent_id": obj.agent_id,
        "name": obj.name,
        "agent_type": obj.agent_type,
        "status": obj.status,
        "health": obj.health,
        "capabilities": obj.capabilities,
        "metadata": obj.metadata,
        "api_key_prefix": obj.api_key_prefix,
        "created_at": obj.created_at.isoformat(),
        "last_heartbeat": obj.last_heartbeat.isoformat() if obj.last_heartbeat else None,
    }


def _list_policies(tenant_id: str, policy_type: Optional[str] = None,
                   scope_type: Optional[str] = None,
                   enabled_only: bool = True,
                   name_contains: Optional[str] = None) -> dict:
    from zentinelle.models import Policy
    qs = Policy.objects.filter(tenant_id=tenant_id)
    if enabled_only:
        qs = qs.filter(enabled=True)
    if policy_type:
        qs = qs.filter(policy_type=policy_type)
    if scope_type:
        qs = qs.filter(scope_type=scope_type)
    if name_contains:
        qs = qs.filter(name__icontains=name_contains)
    policies = list(qs.values(
        "id", "name", "policy_type", "scope_type", "enforcement",
        "enabled", "priority"
    ).order_by("-priority")[:50])
    for p in policies:
        p["id"] = str(p["id"])
    return {"policies": policies, "count": len(policies)}


def _get_policy_details(tenant_id: str, policy_id: str) -> dict:
    from zentinelle.models import Policy
    obj = Policy.objects.filter(tenant_id=tenant_id, id=policy_id).first()
    if not obj:
        return {"error": f"Policy {policy_id} not found"}
    return {
        "id": str(obj.id),
        "name": obj.name,
        "description": obj.description,
        "policy_type": obj.policy_type,
        "scope_type": obj.scope_type,
        "scope_id": obj.scope_id,
        "enforcement": obj.enforcement,
        "enabled": obj.enabled,
        "priority": obj.priority,
        "config": obj.config,
        "created_at": obj.created_at.isoformat(),
        "updated_at": obj.updated_at.isoformat(),
    }


def _list_recent_events(tenant_id: str, event_type: Optional[str] = None,
                       category: Optional[str] = None, limit: int = 20,
                       since_hours: int = 24) -> dict:
    from datetime import timedelta
    from zentinelle.models import Event
    qs = Event.objects.filter(tenant_id=tenant_id)
    if event_type:
        qs = qs.filter(event_type=event_type)
    if category:
        qs = qs.filter(event_category=category)
    if since_hours:
        cutoff = timezone.now() - timedelta(hours=since_hours)
        qs = qs.filter(occurred_at__gte=cutoff)
    events = list(
        qs.order_by("-occurred_at")
        .values("event_type", "event_category", "occurred_at", "payload")[:limit]
    )
    for e in events:
        if e.get("occurred_at"):
            e["occurred_at"] = e["occurred_at"].isoformat()
    return {"events": events, "count": len(events)}


def _list_open_incidents(tenant_id: str, severity: Optional[str] = None,
                        title_contains: Optional[str] = None) -> dict:
    from zentinelle.models import Incident
    qs = Incident.objects.filter(tenant_id=tenant_id).exclude(
        status__in=["resolved", "closed"]
    )
    if severity:
        qs = qs.filter(severity=severity)
    if title_contains:
        qs = qs.filter(title__icontains=title_contains)
    incidents = list(
        qs.values(
            "id", "title", "severity", "status", "incident_type",
            "occurred_at", "root_cause"
        ).order_by("-occurred_at")[:50]
    )
    for i in incidents:
        i["id"] = str(i["id"])
        if i.get("occurred_at"):
            i["occurred_at"] = i["occurred_at"].isoformat()
    return {"incidents": incidents, "count": len(incidents)}


def _list_open_risks(tenant_id: str, category: Optional[str] = None,
                    min_rpn: Optional[int] = None,
                    name_contains: Optional[str] = None) -> dict:
    from zentinelle.models import Risk
    qs = Risk.objects.filter(tenant_id=tenant_id).exclude(
        status__in=["closed", "accepted"]
    )
    if category:
        qs = qs.filter(category=category)
    if name_contains:
        qs = qs.filter(name__icontains=name_contains)
    risks = list(
        qs.values(
            "id", "name", "category", "status", "severity", "likelihood",
            "impact", "mitigation_plan"
        )[:100]
    )
    # Compute RPN, filter, and sort
    for r in risks:
        r["id"] = str(r["id"])
        sev = r.get("severity") or 1
        like = r.get("likelihood") or 1
        impact = r.get("impact") or 1
        r["rpn"] = sev * like * impact
    if min_rpn:
        risks = [r for r in risks if r["rpn"] >= min_rpn]
    risks.sort(key=lambda r: r["rpn"], reverse=True)
    return {"risks": risks[:50], "count": len(risks)}


def _list_open_alerts(tenant_id: str) -> dict:
    from zentinelle.models import ComplianceAlert
    alerts = list(
        ComplianceAlert.objects.filter(
            tenant_id=tenant_id, status="open"
        )
        .order_by("-created_at")
        .values("id", "title", "severity", "status", "alert_type", "created_at")[:50]
    )
    for a in alerts:
        a["id"] = str(a["id"])
        if a.get("created_at"):
            a["created_at"] = a["created_at"].isoformat()
    return {"alerts": alerts, "count": len(alerts)}


def _acknowledge_incident(tenant_id: str, incident_id: str) -> dict:
    from zentinelle.models import Incident
    obj = Incident.objects.filter(tenant_id=tenant_id, id=incident_id).first()
    if not obj:
        return {"error": f"Incident {incident_id} not found"}
    obj.status = "acknowledged"
    obj.acknowledged_at = timezone.now()
    obj.save(update_fields=["status", "acknowledged_at", "updated_at"])
    return {"success": True, "incident_id": str(obj.id), "new_status": "acknowledged"}


def _acknowledge_alert(tenant_id: str, alert_id: str) -> dict:
    from zentinelle.models import ComplianceAlert
    obj = ComplianceAlert.objects.filter(tenant_id=tenant_id, id=alert_id).first()
    if not obj:
        return {"error": f"Alert {alert_id} not found"}
    obj.status = "acknowledged"
    obj.acknowledged_at = timezone.now()
    obj.save(update_fields=["status", "acknowledged_at"])
    return {"success": True, "alert_id": str(obj.id), "new_status": "acknowledged"}


def _review_risk(tenant_id: str, risk_id: str) -> dict:
    from zentinelle.models import Risk
    obj = Risk.objects.filter(tenant_id=tenant_id, id=risk_id).first()
    if not obj:
        return {"error": f"Risk {risk_id} not found"}
    obj.status = "reviewed"
    obj.last_reviewed_at = timezone.now()
    obj.save(update_fields=["status", "last_reviewed_at", "updated_at"])
    return {"success": True, "risk_id": str(obj.id), "new_status": "reviewed"}


def _toggle_policy(tenant_id: str, policy_id: str) -> dict:
    from zentinelle.models import Policy
    obj = Policy.objects.filter(tenant_id=tenant_id, id=policy_id).first()
    if not obj:
        return {"error": f"Policy {policy_id} not found"}
    obj.enabled = not obj.enabled
    obj.save(update_fields=["enabled", "updated_at"])
    return {
        "success": True,
        "policy_id": str(obj.id),
        "name": obj.name,
        "enabled": obj.enabled,
    }


def _run_compliance_check(tenant_id: str) -> dict:
    """Trigger compliance assessment (uses celery task entry-point synchronously)."""
    try:
        from zentinelle.tasks.compliance import run_compliance_check_task
        # Run inline (apply) so the assistant gets the result back
        result = run_compliance_check_task.apply(
            kwargs={'organization_id': tenant_id, 'assessment_type': 'assistant'}
        )
        return {
            "success": True,
            "assessment_id": str(result.result) if result.successful() else None,
            "navigation": {
                "path": "/compliance/reports",
                "label": "View compliance reports",
            },
        }
    except Exception as e:
        return {"error": f"Compliance check failed: {e}"}


def _verify_audit_chain(tenant_id: str) -> dict:
    from zentinelle.services.audit_chain import verify_chain
    result = verify_chain(tenant_id=tenant_id)
    return result


def _navigate_to(path: str, label: str) -> dict:
    return {"navigation": {"path": path, "label": label}}


def _create_policy(tenant_id: str, name: str, policy_type: str, config: dict,
                  description: str = "", scope_type: str = "organization",
                  enforcement: str = "enforce", priority: int = 0) -> dict:
    from zentinelle.models import Policy
    obj = Policy.objects.create(
        tenant_id=tenant_id,
        name=name,
        description=description,
        policy_type=policy_type,
        scope_type=scope_type,
        enforcement=enforcement,
        config=config,
        enabled=True,
        priority=priority,
    )
    return {
        "success": True,
        "policy_id": str(obj.id),
        "name": obj.name,
        "navigation": {
            "path": f"/policies/{obj.id}",
            "label": f"View policy '{obj.name}'",
        },
    }


def _create_risk(tenant_id: str, name: str, description: str,
                severity: int, likelihood: int, impact: int,
                category: str = "operational",
                mitigation_plan: str = "") -> dict:
    from zentinelle.models import Risk
    obj = Risk.objects.create(
        tenant_id=tenant_id,
        name=name,
        description=description,
        category=category,
        severity=severity,
        likelihood=likelihood,
        impact=impact,
        mitigation_plan=mitigation_plan,
        status="open",
    )
    return {
        "success": True,
        "risk_id": str(obj.id),
        "name": obj.name,
        "rpn": severity * likelihood * impact,
        "navigation": {
            "path": f"/risks/{obj.id}",
            "label": f"View risk '{obj.name}'",
        },
    }


def _generate_compliance_report(tenant_id: str, framework_id: str = "all") -> dict:
    try:
        from zentinelle.tasks.compliance import run_compliance_check_task
        kwargs = {
            'organization_id': tenant_id,
            'assessment_type': 'manual',
        }
        if framework_id and framework_id != "all":
            kwargs['framework_id'] = framework_id
        result = run_compliance_check_task.apply(kwargs=kwargs)
        return {
            "success": result.successful(),
            "assessment_id": str(result.result) if result.successful() else None,
            "navigation": {
                "path": "/compliance/reports",
                "label": "View compliance reports",
            },
        }
    except Exception as e:
        return {"error": f"Report generation failed: {e}"}


def _update_policy(tenant_id: str, policy_id: str,
                  name: Optional[str] = None,
                  description: Optional[str] = None,
                  enforcement: Optional[str] = None,
                  enabled: Optional[bool] = None,
                  priority: Optional[int] = None,
                  config: Optional[dict] = None,
                  replace_config: bool = False) -> dict:
    from zentinelle.models import Policy
    obj = Policy.objects.filter(tenant_id=tenant_id, id=policy_id).first()
    if not obj:
        return {"error": f"Policy {policy_id} not found"}
    fields = ["updated_at"]
    if name is not None:
        obj.name = name
        fields.append("name")
    if description is not None:
        obj.description = description
        fields.append("description")
    if enforcement is not None:
        obj.enforcement = enforcement
        fields.append("enforcement")
    if enabled is not None:
        obj.enabled = enabled
        fields.append("enabled")
    if priority is not None:
        obj.priority = priority
        fields.append("priority")
    if config is not None:
        if replace_config:
            obj.config = config
        else:
            merged = dict(obj.config or {})
            merged.update(config)
            obj.config = merged
        fields.append("config")
    obj.save(update_fields=fields)
    return {
        "success": True,
        "policy_id": str(obj.id),
        "name": obj.name,
        "config": obj.config,
        "navigation": {
            "path": f"/policies/{obj.id}",
            "label": f"View policy '{obj.name}'",
        },
    }


def _update_risk(tenant_id: str, risk_id: str, **kwargs) -> dict:
    from zentinelle.models import Risk
    obj = Risk.objects.filter(tenant_id=tenant_id, id=risk_id).first()
    if not obj:
        return {"error": f"Risk {risk_id} not found"}
    allowed = {"name", "description", "category", "severity", "likelihood",
               "impact", "mitigation_plan", "status"}
    fields = ["updated_at"]
    for k, v in kwargs.items():
        if k in allowed and v is not None:
            setattr(obj, k, v)
            fields.append(k)
    obj.save(update_fields=fields)
    rpn = (obj.severity or 1) * (obj.likelihood or 1) * (obj.impact or 1)
    return {
        "success": True,
        "risk_id": str(obj.id),
        "name": obj.name,
        "rpn": rpn,
        "navigation": {
            "path": f"/risks/{obj.id}",
            "label": f"View risk '{obj.name}'",
        },
    }


def _resolve_incident(tenant_id: str, incident_id: str,
                     resolution_notes: str = "") -> dict:
    from zentinelle.models import Incident
    obj = Incident.objects.filter(tenant_id=tenant_id, id=incident_id).first()
    if not obj:
        return {"error": f"Incident {incident_id} not found"}
    obj.status = "resolved"
    obj.resolved_at = timezone.now()
    fields = ["status", "resolved_at", "updated_at"]
    if resolution_notes and hasattr(obj, "root_cause"):
        existing = obj.root_cause or ""
        obj.root_cause = (existing + "\n\nResolution: " + resolution_notes).strip()
        fields.append("root_cause")
    obj.save(update_fields=fields)
    return {
        "success": True,
        "incident_id": str(obj.id),
        "new_status": "resolved",
    }


def _suggest_policies_for_gaps(tenant_id: str) -> dict:
    """Find uncovered policy types and recommend templates."""
    from zentinelle.models import Policy

    all_types = [
        "rate_limit", "tool_permission", "model_restriction",
        "network_policy", "output_filter", "budget_limit",
        "agent_capability", "prompt_injection", "data_retention",
        "audit_policy", "human_oversight", "ai_guardrail",
    ]
    existing = set(
        Policy.objects.filter(tenant_id=tenant_id, enabled=True)
        .values_list("policy_type", flat=True)
    )
    gaps = [t for t in all_types if t not in existing]

    templates = {
        "rate_limit": {"requests_per_minute": 60, "tokens_per_day": 100000},
        "tool_permission": {"allowed_tools": ["read", "search"], "denied_tools": ["shell", "delete"]},
        "model_restriction": {"allowed_models": ["claude-sonnet-4-5-20250929"], "blocked_models": []},
        "network_policy": {"allowed_domains": ["*.your-company.com"], "blocked_domains": []},
        "output_filter": {"redact_pii": True, "block_secrets": True},
        "budget_limit": {"monthly_budget_usd": 500, "alert_threshold": 0.8},
        "agent_capability": {"allowed_actions": ["read.*"], "denied_actions": ["delete.*"]},
        "prompt_injection": {"detection_threshold": 0.7, "block_on_detection": True},
        "data_retention": {"retention_days": 90, "expiration_action": "delete"},
        "audit_policy": {"log_all_requests": True, "include_payloads": False},
        "human_oversight": {"required_for": ["high_risk"], "approval_timeout_seconds": 300},
        "ai_guardrail": {"check_harmful": True, "check_pii": True},
    }
    recommendations = [
        {
            "policy_type": t,
            "suggested_name": t.replace("_", " ").title() + " Policy",
            "template_config": templates.get(t, {}),
            "reasoning": f"No active {t} policy detected — recommended for baseline coverage",
        }
        for t in gaps
    ]
    return {
        "missing_count": len(gaps),
        "recommendations": recommendations,
        "navigation": {
            "path": "/policies",
            "label": "View policies",
        },
    }


# ─── Dispatch table ─────────────────────────────────────────────────────

TOOL_DISPATCH = {
    "list_agents": _list_agents,
    "get_agent_details": _get_agent_details,
    "list_policies": _list_policies,
    "get_policy_details": _get_policy_details,
    "list_recent_events": _list_recent_events,
    "list_open_incidents": _list_open_incidents,
    "list_open_risks": _list_open_risks,
    "list_open_alerts": _list_open_alerts,
    "acknowledge_incident": _acknowledge_incident,
    "acknowledge_alert": _acknowledge_alert,
    "review_risk": _review_risk,
    "toggle_policy": _toggle_policy,
    "run_compliance_check": _run_compliance_check,
    "verify_audit_chain": _verify_audit_chain,
    "navigate_to": lambda tenant_id, **kw: _navigate_to(**kw),
    "create_policy": _create_policy,
    "update_policy": _update_policy,
    "create_risk": _create_risk,
    "update_risk": _update_risk,
    "resolve_incident": _resolve_incident,
    "generate_compliance_report": _generate_compliance_report,
    "suggest_policies_for_gaps": _suggest_policies_for_gaps,
}


# Tools that mutate state (drive audit logs, eligible for confirmation)
MUTATION_TOOLS = frozenset({
    "acknowledge_incident", "acknowledge_alert", "review_risk",
    "toggle_policy", "create_policy", "update_policy",
    "create_risk", "update_risk", "resolve_incident",
    "run_compliance_check", "generate_compliance_report",
})

# Tools that require explicit user approval before execution.
# Read tools, ack/review (low-risk reversible), and navigation are exempt.
REQUIRES_CONFIRMATION = frozenset({
    "create_policy", "update_policy", "toggle_policy",
    "create_risk", "update_risk",
    "resolve_incident",
})


def execute_tool(name: str, args: dict, tenant_id: str) -> str:
    """Execute a tool and return its JSON-serialized result."""
    fn = TOOL_DISPATCH.get(name)
    if not fn:
        return json.dumps({"error": f"Unknown tool: {name}"})
    try:
        result = fn(tenant_id=tenant_id, **(args or {}))
        return json.dumps(result, default=str)
    except TypeError as e:
        # Bad arguments
        logger.warning("Tool %s invocation failed: %s", name, e)
        return json.dumps({"error": f"Invalid arguments: {e}"})
    except Exception as e:
        logger.exception("Tool %s execution failed", name)
        return json.dumps({"error": f"Execution failed: {e}"})
