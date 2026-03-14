# Compliance Frameworks

Zentinelle maps agent behavior to regulatory controls across five frameworks. Dashboards are generated from event data and policy configurations — no manual attestation required.

## Supported Frameworks

| Framework | Scope | Dashboard | Report Export |
|-----------|-------|-----------|---------------|
| SOC2 Type II | Trust Service Criteria | ✓ | PDF, CSV |
| GDPR | Articles 5, 13, 22, 25 | ✓ | PDF |
| HIPAA | §164.312 Technical Safeguards | ✓ | PDF |
| EU AI Act | Risk classification + transparency | ✓ | PDF |
| NIST AI RMF | Govern, Map, Measure, Manage | ✓ | PDF |

---

## SOC2 Type II

Zentinelle provides evidence for the following Trust Service Criteria:

| Criteria | Control | Zentinelle Evidence |
|----------|---------|---------------------|
| CC6.1 | Logical access controls | Agent registration + API key auth |
| CC6.2 | Authentication mechanisms | JWT validation, API key hashing (bcrypt) |
| CC6.3 | Access removal | Agent deregistration, key revocation |
| CC7.1 | Threat detection | Anomaly detection on event streams |
| CC7.2 | Security incidents | Incident tracking, timeline audit |
| CC8.1 | Change management | Policy versioning + audit trail |
| CC9.2 | Third party monitoring | LLM provider cost/usage tracking |
| A1.1 | Availability monitoring | Heartbeat tracking, health status |
| C1.1 | Confidentiality | PII detection + redaction in logs |
| P3.1 | Data collection notice | System prompt enforcement |
| P6.1 | Data retention | Configurable retention + archival |

The SOC2 dashboard shows control status (pass/fail/partial) based on current policy configuration and event data.

---

## GDPR

Relevant articles for automated AI agent processing:

| Article | Requirement | Zentinelle Coverage |
|---------|-------------|---------------------|
| Art. 5(1)(a) | Lawfulness, fairness, transparency | Audit trail of all agent decisions |
| Art. 5(1)(b) | Purpose limitation | Policy enforcement on agent capabilities |
| Art. 5(1)(c) | Data minimisation | PII detection + redaction policies |
| Art. 5(1)(e) | Storage limitation | Configurable retention policies |
| Art. 13 | Right to information | System prompt transparency logging |
| Art. 22 | Automated decision-making | Interaction logs with decision rationale |
| Art. 25 | Privacy by design | PII policies enforced at evaluation time |
| Art. 32 | Security of processing | Encryption at rest + in transit, audit logs |
| Art. 33 | Breach notification | Incident creation + notification routing |

**GDPR Report** includes: data flows, processing purposes, retention schedules, and incident log.

---

## HIPAA

Technical safeguard controls (§164.312):

| Safeguard | Requirement | Zentinelle Coverage |
|-----------|-------------|---------------------|
| §164.312(a)(1) | Access control | Agent registration, API key scoping |
| §164.312(a)(2)(i) | Unique user identification | `user_id` on all interaction logs |
| §164.312(a)(2)(ii) | Emergency access | Fail-open mode (configurable) |
| §164.312(b) | Audit controls | Full interaction logs, tamper-evident |
| §164.312(c)(1) | Integrity | Immutable audit log storage |
| §164.312(d) | Person or entity authentication | JWT validation, API key auth |
| §164.312(e)(1) | Transmission security | TLS enforced, no PHI in logs (PII policy) |

**Important:** Zentinelle detects PHI patterns via PII detection (SSN, DOB, MRN patterns). Configure `pii_detection` policy with `action: redact` to prevent PHI from appearing in interaction logs.

---

## EU AI Act

The EU AI Act (effective Aug 2026) requires risk classification and transparency for AI systems.

### Risk Classification

| Risk Level | Examples | Zentinelle Role |
|------------|----------|-----------------|
| Unacceptable | Social scoring, subliminal manipulation | Block via policy |
| High | Healthcare decisions, legal, hiring | Mandatory audit + approval workflows |
| Limited | Chatbots, emotion recognition | Transparency disclosure enforcement |
| Minimal | Spam filters, AI in games | Standard monitoring |

Zentinelle's **Model Registry** tracks risk classification per model. The **Approval Workflow** policy type enforces human oversight for high-risk AI decisions.

### Key Requirements Covered

| Requirement | Coverage |
|-------------|----------|
| Art. 9 — Risk management system | Risk register + incident tracking |
| Art. 10 — Data governance | PII detection, data residency policies |
| Art. 12 — Record-keeping | Full audit trail, immutable logs |
| Art. 13 — Transparency | System prompt enforcement, interaction logging |
| Art. 14 — Human oversight | Approval workflow policy type |
| Art. 17 — Quality management | Policy versioning, compliance monitoring |

---

## NIST AI RMF

The NIST AI Risk Management Framework (AI RMF 1.0) organizes AI risk across four functions:

### GOVERN

Policies, processes, and accountability for AI risk management.

| Practice | Zentinelle Support |
|----------|--------------------|
| GV.1 — Organizational policies | Policy engine with org-level scope |
| GV.2 — Accountability | Tenant-scoped audit trails, incident ownership |
| GV.3 — Organizational teams | Team-scoped policies |
| GV.4 — Risk tolerance | Cost limits, rate limits, model restrictions |
| GV.6 — Policies for third-party risk | Model registry, provider allowlists |

### MAP

Categorize AI risks in context.

| Practice | Zentinelle Support |
|----------|--------------------|
| MP.1 — Context established | Agent registration with capabilities declaration |
| MP.2 — Scientific uncertainty | Model registry with risk classification |
| MP.3 — AI risk categorization | EU AI Act risk levels in model registry |
| MP.5 — Impacts identified | Risk register |

### MEASURE

Analyze and assess AI risks.

| Practice | Zentinelle Support |
|----------|--------------------|
| MS.1 — Risk metrics | Token costs, error rates, policy violations |
| MS.2 — AI risk evaluation | Compliance dashboards |
| MS.3 — Internal experts | Approval workflow for high-risk decisions |
| MS.4 — Measurement approaches | Content scanning, jailbreak detection |

### MANAGE

Prioritize and address AI risks.

| Practice | Zentinelle Support |
|----------|--------------------|
| MG.1 — Risk treatments | Policy enforcement (block, alert, restrict) |
| MG.2 — Risk monitoring | Real-time monitoring, anomaly detection |
| MG.3 — Residual risk | Risk register with likelihood × impact matrix |
| MG.4 — Risk communication | Incident notification routing |

---

## Compliance Reports

All framework dashboards support exporting a compliance report (PDF or CSV). Reports include:

- Control status (pass / fail / partial / not applicable)
- Evidence summary (policy configurations, event counts, incident log)
- Period covered
- Tenant and agent scope

Reports are generated on-demand from live data. For scheduled reports, configure a Celery periodic task.
