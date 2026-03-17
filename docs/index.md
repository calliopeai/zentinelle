
# Zentinelle

**Runtime governance for AI coding agents.**

Zentinelle sits between your AI agents and their LLM providers, enforcing policies, logging activity, and giving you a real-time compliance dashboard.

!!! warning "Alpha"
    **v0.0.1** — Working integrations with Claude Code and Codex. [Looking for contributors.](https://github.com/calliopeai/zentinelle/issues)

## How it works

```
Your Agent  ──►  Zentinelle  ──►  LLM Provider
               (policy check)    (Anthropic, OpenAI, Google)
               (audit log)
               (monitoring)
```

Two integration modes:

| Mode | How | Best for |
|------|-----|----------|
| **Hooks** | PreToolUse/PostToolUse intercepts | Claude Code, Gemini CLI |
| **Proxy** | Transparent HTTP proxy | Any agent (Codex, custom) |

## Quick links

- [Quick Start](getting-started) -- get running in 5 minutes
- [Architecture](wiki/architecture) -- how the system is built
- [API Reference](wiki/api) -- REST + GraphQL endpoints
- [Policy Reference](wiki/policies) -- all policy types and configs
- [SDK Guide](wiki/sdk) -- integrate your agent
- [Knowledge Graph](knowledge-graph) -- codebase architecture map
- [Contributing](contributing)
