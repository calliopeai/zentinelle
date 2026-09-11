# MITRE ATLAS guardrail map

MITRE ATLAS is a living knowledge base of adversary tactics and techniques involving AI-enabled systems, including generative and agentic AI. Zentinelle uses the technique IDs as threat-model vocabulary and evidence labels. A mapping is not a MITRE endorsement, certification, or a claim that a control eliminates the threat.

Source: [MITRE ATLAS](https://atlas.mitre.org/), accessed 2026-09-10. Record the source revision and retrieval date whenever this map is refreshed.

| ATLAS technique | Zentinelle control | Enforcement point | Evidence to retain | Residual risk |
|---|---|---|---|---|
| `AML.T0051` LLM Prompt Injection | Prompt-injection evaluator and support-assistant preflight | Evaluation envelope before provider/tool execution | Injection fixture, decision, request ID, policy version | Novel or obfuscated injections can evade pattern detection. |
| AI Agent Tool Invocation | Tool permission, exact argument digest, scoped approval and one-time consumption | Assistant execution and policy admission | Approval record, tool name/args digest, actor, tenant, result | A permitted tool can still have an unsafe implementation or side effect. |
| AI Agent Context Poisoning / AI Agent Tool Data Poisoning | Provenance-aware tool/RAG context contract and indirect injection scanning | Context normalization before model and tool loop | Source identity, content classification, scan result, decision trace | Untrusted sources can contain unknown instructions or misleading data. |
| Extract LLM System Prompt / LLM Data Leakage | System-prompt policy, output filter, capture redaction and secret-key protection | Prompt assembly, output release and durable capture | Policy result, withheld output, redaction profile, audit record | A model may reveal derived or memorized information without a literal match. |
| AI Agent Tool Credential Harvesting / Credentials from AI Agent Configuration | Provider-key role boundary, secret redaction, no credential-bearing context | Key management, capture and tool dispatch | Access audit, redaction test, denied tool attempt | Runtime infrastructure or a provider may expose credentials outside the application path. |
| Exfiltration via AI Agent Tool Invocation | Tenant/workload/user scoped authority and egress/network policy | Tool dispatch and network gateway | Tool decision, destination, bytes/result metadata, incident link | Direct provider or unmanaged tool paths remain deployment responsibilities. |
| Modify AI Agent Configuration | Reviewed policy changes, immutable history, staged rollout and rollback | Policy mutation and deployment acknowledgement | Before/after snapshot, reviewer, effective version, rollback result | A compromised administrator or deployment pipeline can still change authority. |

## Support assistant product contract

The built-in assistant is a Zentinelle support agent. Before any provider call it must:

- accept questions about Zentinelle governance, agents, policies, security, compliance, risk, audit, operations, evidence and related ATLAS controls;
- reject random or unrelated questions with a short scope explanation;
- reject direct prompt-injection attempts and tenant-configured blocked topics;
- avoid echoing the rejected prompt or sensitive content;
- expose the policy IDs used for the refusal to the audit/evidence path.

The current implementation uses deterministic topic terms plus the existing `ai_guardrail` and `prompt_injection` evaluators. It is intentionally conservative. Output-side buffering and adversarial evaluation across models remain tracked in [#344](https://github.com/calliopeai/zentinelle/issues/344); the broader ATLAS evidence and threat-model workflow is [#343](https://github.com/calliopeai/zentinelle/issues/343).

The map should be versioned with the product. When ATLAS changes, retain the previous mapping, identify added/removed techniques, rerun the linked adversarial fixtures, and update control owners and evidence freshness rather than silently relabeling historical results.
