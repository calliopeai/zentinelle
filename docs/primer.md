
# Methodology Primer

How we build software at Calliope AI. This applies to all repos in the ecosystem.

---

## Knowledge System

Every repo has a structured knowledge graph that agents and humans read before working.

### File schema

```
bootstrap.md      # canonical technical reference — architecture, models, commands, naming
memory.md         # persistent decisions, milestones, open questions, project state
CLAUDE.md         # Claude Code shim → points to bootstrap.md + memory.md
agents.md         # generic agents shim (Codex, etc.)
gemini.md         # Gemini CLI shim
calliope.md       # internal-only shim (gitignored — auth wiring, env vars, internal URLs)
docs/wiki/        # deep technical docs (architecture, API, policies, compliance, SDK, deployment)
docs/primer.md    # this file — methodology and practices
```

### Rules

1. **Write once.** All knowledge goes in `bootstrap.md` and `memory.md`. Agent shims are thin pointers — never duplicate content.
2. **In-repo only.** No external note-taking systems, no Claude auto-memory for project knowledge. The repo is the source of truth.
3. **`calliope.md` is always gitignored.** Internal wiring (auth, env vars, internal URLs) never in public repos.
4. **Update on change.** When you change models, API surfaces, evaluators, or architecture — update `bootstrap.md` in the same commit.
5. **`memory.md` is append-friendly.** Add milestone progress, decisions, open questions. Don't delete history.

### What goes where

| Content | File |
|---------|------|
| Architecture, models, commands, naming conventions | `bootstrap.md` |
| "Why" decisions, milestone progress, open questions | `memory.md` |
| API reference, deep dives | `docs/wiki/*.md` |
| This methodology | `docs/primer.md` |
| Issue-level work | GitHub Issues |

---

## Issue Workflow

1. **Move to In Progress** when you start working on an issue
2. **Update** with progress notes on non-trivial tasks
3. **Close** when committed and verified
4. **File tickets for bugs found** during other work — don't silently fix unrelated things

Issues live at: https://github.com/calliopeai/zentinelle/issues
Project board: https://github.com/orgs/calliopeai/projects/4

---

## Git Practices

- **No co-authorship messages** in commits. Ever.
- **No rebasing.** No force-push.
- **Commit directly to `main`.**
- **Don't push** unless explicitly asked.
- **Submodule push order:** always push submodules before parent repo.
- **Commit messages:** imperative mood, explain the "why" not the "what". One-liner for small changes, multi-line for significant ones.

---

## Pre-Commit Checklist (Backend)

Run in order. Stop and fix if any step fails.

```bash
# 1. Django startup — catches schema ordering violations and import errors
cd backend && pipenv run python -c \
  "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup()"

# 2. Migration check
pipenv run python manage.py makemigrations --check --dry-run

# 3. Tests
pipenv run pytest

# 4. Lint
pipenv run ruff check
pipenv run isort --check-only .
```

---

## Multi-Agent Development

We develop with multiple AI coding agents simultaneously. Each agent registers with Zentinelle and is governed by the same policies.

### Agent integration patterns

| Agent | Integration | How it connects |
|-------|------------|-----------------|
| Claude Code | Hooks (PreToolUse/PostToolUse) | Calls `/evaluate` before tool calls, `/events` after |
| Codex (OpenAI) | LLM Proxy | `OPENAI_BASE_URL` → local proxy → Zentinelle → OpenAI |
| Gemini | Hooks (native) or LLM Proxy | `install-gemini` for hooks, or `GOOGLE_GEMINI_BASE_URL` → proxy |
| Custom agents | REST API or Proxy | Call `/evaluate` directly or route through proxy |

### SDK

Package: `zentinelle-agent` (in `zentinelle-sdk.git/plugins/agent/`)

```bash
zentinelle-agent install    # Claude Code hooks
zentinelle-agent proxy      # Local proxy (--provider anthropic|openai|google)
zentinelle-agent status     # Show current state
```

---

## Policy-Driven Development

All agent activity goes through the policy engine. Policies are the primary governance mechanism.

### Policy types that matter during development

| Policy | What it catches | Enforcement |
|--------|----------------|-------------|
| `rate_limit` | Request rate, token budget | enforce |
| `tool_permission` | Deny dangerous tools, require approval | enforce |
| `model_restriction` | Only approved models/providers | enforce |
| `agent_capability` | Action-level RBAC | audit or enforce |
| `network_policy` | Block risky domains | enforce |

### Enforcement modes

- **enforce** — blocks the action, agent sees the reason
- **audit** — logs the violation, doesn't block
- **disabled** — policy exists but doesn't evaluate

### Cache behavior

Policy changes take effect immediately (versioned cache keys). No 5-minute delay.

---

## Monitoring

The GRC portal at `/zentinelle/monitoring/` shows live agent activity:

- **Live Activity tab** — every tool call and LLM invocation, with endpoint, model, tokens, latency
- **Content Scanner** — PII detection, content moderation
- **Anomalies** — usage spikes, repeat violations
- **Compliance Alerts** — drift detection, policy health checks

Data flows:
```
Hook (PreToolUse) → /evaluate → PolicyEngine → Event + InteractionLog
Hook (PostToolUse) → /events → Event
Proxy → PolicyEngine → upstream → InteractionLog
```

---

## Timestamps

- **Backend:** all `DateTimeField` values stored in UTC (Django `USE_TZ=True`)
- **Frontend:** display conversion happens in the browser based on user timezone preference
- **Logs/events:** always include timezone context when displaying to users

---

## Documentation Site

- Domain: `zentinelle.dev` (GitHub Pages)
- Source: `docs/` directory
- Includes: primer, wiki, API reference, SDK guide

---

## What Not To Do

- Don't keep project notes outside the repo (no Notion, no Claude auto-memory for project state)
- Don't hardcode agent types, model lists, or provider URLs in the frontend — pull from the backend
- Don't create `InteractionLog` and `Event` for the same thing separately — wire them at the source
- Don't skip the pre-commit checklist
- Don't silently fix bugs found during other work — file a ticket
- Don't rebase or force-push
