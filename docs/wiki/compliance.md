# Compliance Frameworks

Zentinelle maps agent behaviour to regulatory controls across **six frameworks**. Dashboards are generated from event data and policy configurations — no manual attestation required.

The control catalogue lives in `backend/zentinelle/models/compliance.py` (`COMPLIANCE_CAPABILITIES`, `FRAMEWORK_REQUIREMENTS`). The portal UI mappings live in `frontend/app/(app)/compliance/[framework]/page.tsx`. Compliance packs (curated baseline policies per framework) live in `backend/zentinelle/services/compliance_packs.py` and are activated via `python manage.py activate_compliance_pack`.

## Supported Frameworks

| Framework | Slug | Region | Controls Mapped |
|-----------|------|--------|-----------------|
| SOC 2 Type II | `soc2` | Global | 12 |
| GDPR | `gdpr` | EU/EEA | 8 |
| HIPAA | `hipaa` | US | 8 |
| EU AI Act | `eu-ai-act` | EU | 8 |
| NIST AI RMF | `nist` | Global | 8 |
| ISO 42001 | `iso_42001` | Global | AI Management System |

Each framework page (`/compliance/<slug>`) shows a coverage score, control breakdown by category, and the Zentinelle feature that maps to each control.

---

## SOC 2 Type II

Trust Services Criteria for service organizations.

| Control | Name | Category | Zentinelle Feature |
|---------|------|----------|--------------------|
| CC6.1 | Logical Access Controls | Security | RBAC roles + API key auth |
| CC6.2 | Access Authentication | Security | Session auth + OIDC/SSO |
| CC6.3 | Access Authorization | Security | Policy engine + RBAC |
| CC7.1 | Monitoring Activities | Security | Event monitoring + audit logs |
| CC7.2 | Incident Response | Security | Incident management + webhooks |
| CC8.1 | Change Management | Security | Policy versioning |
| CC3.1 | Risk Assessment | Risk | Risk register + FMEA matrix |
| CC3.2 | Risk Mitigation | Risk | Policy enforcement + content scanning |
| CC5.1 | Activity Logging | Availability | Audit log chain + event pipeline |
| PI1.1 | Data Processing Integrity | Processing Integrity | Content scanning + output filters |
| C1.1 | Data Classification | Confidentiality | PII/PHI detection + secret scanning |
| P1.1 | Privacy Notice | Privacy | Out of scope — organisational policy |

**Compliance pack:** `python manage.py activate_compliance_pack soc2` provisions baseline `audit_policy`, `network_policy`, `session_policy`, and `ai_guardrail` policies.

---

## GDPR

EU regulation on data protection and privacy.

| Article | Name | Category | Zentinelle Feature |
|---------|------|----------|--------------------|
| Art. 5 | Data Processing Principles | Principles | Content scanning + data retention policies |
| Art. 6 | Lawful Basis | Principles | Out of scope — organisational policy |
| Art. 17 | Right to Erasure | Data Subject Rights | Data retention TTL + legal holds |
| Art. 25 | Data Protection by Design | Design | PII detection + content redaction |
| Art. 30 | Records of Processing | Accountability | Audit logs + interaction logs |
| Art. 32 | Security of Processing | Security | Encryption + access control + policy enforcement |
| Art. 33 | Breach Notification | Security | Incident management + webhook alerts |
| Art. 35 | DPIA | Accountability | Risk register + compliance reports |

---

## HIPAA

US Health Insurance Portability and Accountability Act — Security Rule.

| Control | Name | Category | Zentinelle Feature |
|---------|------|----------|--------------------|
| §164.312(a) | Access Control | Technical Safeguards | Policy engine + RBAC + API key auth |
| §164.312(b) | Audit Controls | Technical Safeguards | Tamper-evident audit log chain |
| §164.312(c) | Integrity Controls | Technical Safeguards | Content scanning + output filters |
| §164.312(d) | Person Authentication | Technical Safeguards | Session auth + OIDC/SSO + MFA via OIDC |
| §164.312(e) | Transmission Security | Technical Safeguards | HTTPS enforced + proxy TLS |
| §164.308(a)(1) | Risk Analysis | Administrative Safeguards | Risk register + FMEA matrix + gap analysis |
| §164.308(a)(6) | Incident Procedures | Administrative Safeguards | Incident management + SLA tracking |
| §164.530(j) | Retention Requirements | Administrative Safeguards | Data retention policies + legal holds |

**PHI handling:** the `phi_detection` content rule, combined with an `output_filter` policy in `redact` or `block` mode, prevents PHI patterns (SSN, MRN, NPI, diagnoses) from leaving the system. The `hipaa` compliance pack ships these defaults plus a 7-year retention window (2,555 days).

---

## EU AI Act

Risk-based AI governance regulation. Effective Aug 2026.

| Article | Name | Category | Zentinelle Feature |
|---------|------|----------|--------------------|
| Art. 9 | Risk Management System | High-Risk AI | Risk register + policy engine + evaluators |
| Art. 10 | Data Governance | High-Risk AI | Content scanning + data retention |
| Art. 11 | Technical Documentation | High-Risk AI | System prompts + policy documentation |
| Art. 12 | Record-Keeping | High-Risk AI | Audit logs + interaction logs + event pipeline |
| Art. 13 | Transparency | High-Risk AI | Policy evaluation results + monitoring dashboard |
| Art. 14 | Human Oversight | High-Risk AI | `human_oversight` policy + approval workflows |
| Art. 15 | Accuracy & Robustness | High-Risk AI | Model restrictions + output filters + safety settings |
| Art. 52 | Transparency Obligations | General | Application-level — out of scope |

**Risk classification.** The Model Registry (`backend/zentinelle/models/model_registry.py`) tags each AI model with an EU AI Act risk level (`unacceptable`, `high`, `limited`, `minimal`). The `human_oversight` policy enforces Art. 14 for high-risk models.

---

## NIST AI RMF

NIST AI Risk Management Framework (AI RMF 1.0). Voluntary framework organised around four functions.

| Function | Practice | Zentinelle Feature |
|----------|----------|--------------------|
| GOVERN | Cultivate AI risk-management culture | RBAC + policy engine + audit trails |
| MAP | Identify context and map AI risks | Risk register + model registry + agent inventory |
| MEASURE | Assess and track AI risks | Usage analytics + monitoring + compliance scoring |
| MANAGE | Prioritise and act on AI risks | Policy enforcement + incident response + remediation |
| GOV-1 | Legal & Regulatory | Compliance frameworks + gap analysis + reports |
| GOV-3 | Workforce Diversity | Out of scope — organisational concern |
| MAP-1 | AI System Inventory | Agent registry + model registry |
| MEASURE-2 | Performance Metrics | Usage metrics + latency tracking + cost monitoring |

---

## ISO 42001

AI Management System (AIMS) — the first ISO standard purpose-built for AI governance.

ISO 42001 is treated as a thin overlay on top of NIST AI RMF and the EU AI Act in `FRAMEWORK_REQUIREMENTS`:

| Capability | Required | Zentinelle Feature |
|------------|----------|--------------------|
| Model identification | Required | Model registry |
| Model restriction | Required | `model_restriction` policy |
| Audit logging | Recommended | Audit log chain |
| Human oversight | Recommended | `human_oversight` policy |
| Agent capability control | Recommended | `agent_capability` policy |

Reports for ISO 42001 can be exported via `/compliance/reports` (slug `iso_42001`).

---

## Compliance Frameworks Toggle — `/compliance/frameworks`

Each framework can be enabled or disabled per tenant via `ComplianceFrameworkConfig` (`backend/zentinelle/models/compliance.py`). Disabling a framework removes it from the dashboard and excludes it from coverage scoring — useful for tenants in jurisdictions where a given framework does not apply (e.g. a US-only deployment turning off GDPR).

Toggle is exposed through the GraphQL `toggleFramework` mutation and stored as `(tenant_id, framework_id, is_enabled)`.

---

## Compliance Overview — `/compliance`

The overview page renders a **radar chart** of required-capability coverage across all enabled frameworks (recharts `RadarChart`, see `frontend/app/(app)/compliance/page.tsx`). Each axis is one framework; the polygon shows coverage percentage. A balanced polygon means consistent posture; a skewed one highlights a framework you should focus on.

Below the radar, each framework gets its own card with a coverage badge linking to the detail page.

Coverage data comes from `get_framework_coverage(tenant_id)` in `backend/zentinelle/models/compliance.py`, which compares enabled capabilities (policies + content rules) against the framework's `required_capabilities` and `recommended_capabilities`.

---

## Gap Analysis — `/compliance/gaps`

Surfaces unmet **required** capabilities across enabled frameworks, with effort estimates and remediation hints (`frontend/app/(app)/compliance/gaps/page.tsx`).

For each gap, the page shows:

- The capability that's missing (e.g. `pii_detection`)
- Which framework requires it
- Severity (`required` vs `recommended`)
- Effort estimate (`easy` / `medium` / `hard` with hour ranges)
- Direct link to the policy creation flow with the right policy type pre-selected

Example: GDPR Art. 5 is partially covered. The gap analysis page suggests:

> **PII Detection** — required for GDPR. Effort: easy (< 1h). Create a `pii_filter` content rule or an `output_filter` policy with `block_pii: true`.

Each remediation links straight to `/policies/create?type=output_filter` so admins can close the gap in one click.

---

## Compliance Reports — `/compliance/reports`

All framework dashboards support exporting an evidence pack as JSON or CSV. Reports include:

- Control / capability coverage (met / partial / not met)
- Evidence summary — policy configurations, event counts, incident log
- Period covered
- Tenant and agent scope
- Generated `ComplianceAssessment` snapshot for trend analysis

Reports are generated on demand. For scheduled reports, use the `compliance_monitoring` Celery beat task (`backend/zentinelle/tasks/compliance_monitoring.py`).

---

## Compliance Packs

Compliance packs are curated bundles of baseline policies. Activate one with:

```bash
python manage.py activate_compliance_pack <pack_name> --tenant <tenant_id>
```

Available packs (see `backend/zentinelle/services/compliance_packs.py`): `hipaa`, `soc2`. Each pack provisions ~5 policies across `output_filter`, `audit_policy`, `session_policy`, `data_retention`, `data_access`, `network_policy`, and `ai_guardrail`.

Packs are idempotent — running `activate_compliance_pack` twice for the same tenant is safe.
