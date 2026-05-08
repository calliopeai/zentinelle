
# Zentinelle

**Governance, Risk, and Compliance for AI agents.**

Zentinelle sits between your AI agents and their LLM providers, enforcing policies, scanning content, logging activity, and giving you a real-time GRC portal — without modifying agent code.

!!! success "v1.2.0 — Production Ready"
    24 policy evaluators · 24+ LLM providers · Multi-cloud Terraform · 5 SDK languages · 3 framework plugins · MIT Licensed

## How it works

```
Your Agent  ──►  Zentinelle  ──►  LLM Provider
               (policy check)    (Anthropic, OpenAI, Google,
               (content scan)     Bedrock, Mistral, Groq, Cerebras,
               (audit log)        Together, Fireworks, Ollama, ...)
               (usage tracking)
```

Three integration modes:

| Mode | How | Best for |
|------|-----|----------|
| **Hooks** | PreToolUse/PostToolUse intercepts | Claude Code, Gemini CLI |
| **Django proxy** | Transparent HTTP proxy with policy enforcement | Any agent — simple deployment |
| **Go gateway** | High-performance sidecar with credential injection | Enterprise — scales independently |

## Why Zentinelle?

- **Open source** (MIT) — derisks legal friction for enterprise procurement
- **24 policy evaluators** out of the box covering rate limits, tool permissions, model restrictions, network controls, content scanning, and more
- **Real GRC framework mapping** — SOC2, GDPR, HIPAA, EU AI Act, NIST AI RMF
- **Multi-tenant from day one** — isolated by `tenant_id` at every layer
- **Built-in AI assistant** — chat with Zentinelle to explain policies, suggest configs, summarize compliance status
- **Encrypted-at-rest LLM credentials** — Fernet-encrypted provider keys, never log plaintext
- **Live model discovery** — auto-populates from provider /models APIs, stays current as new models ship

## Quick links

**Get started**

- [Quick Start](getting-started.md) — Docker compose up in 5 minutes
- [Tech Stack](tech-stack.md)

**Reference**

- [Architecture](wiki/architecture.md)
- [API Reference](wiki/api.md) — REST + GraphQL endpoints
- [Policy Reference](wiki/policies.md) — all 24 policy types
- [SDK Guide](wiki/sdk.md) — Python, TypeScript, Go, Java, C#
- [Compliance Frameworks](wiki/compliance.md)
- [Deployment Guide](wiki/deployment.md) — Docker, Terraform, secrets

**Project**

- [Knowledge Graph](knowledge-graph.md) — codebase architecture map
- [Methodology](primer.md)
- [Contributing](contributing.md)
