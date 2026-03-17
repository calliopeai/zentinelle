---
name: codemap
description: Query the codebase knowledge graph to find components, trace data flows, and understand how code connects.
argument-hint: "<query | show <name> | stats | build>"
---

Query the Zentinelle codebase knowledge graph (SQLite-backed, 1300+ nodes).

**Mode: $ARGUMENTS**

## Commands

**Search** (default — find nodes by name, file path, or description):
```bash
python3 scripts/codemap.py query "$ARGUMENTS"
```

**Show** (show a specific node and all its connections):
```bash
python3 scripts/codemap.py show "$ARGUMENTS"
```
Strip "show " prefix from $ARGUMENTS first.

**Stats** (graph overview):
```bash
python3 scripts/codemap.py stats
```

**Build** (rebuild the graph from source — do this after significant code changes):
```bash
python3 scripts/codemap.py build
```

## Examples

- `/codemap PolicyEngine` — find the policy engine and related components
- `/codemap show EvaluateView` — show the evaluate view and everything it connects to
- `/codemap proxy` — find all proxy-related code
- `/codemap rate_limit` — find rate limit evaluator and config
- `/codemap stats` — see node/edge type counts
- `/codemap build` — rebuild after code changes

## When to use

- Before modifying a component: `/codemap show <ComponentName>` to see what depends on it
- When looking for where something is defined: `/codemap <name>`
- After making significant changes: `/codemap build` to update the graph
