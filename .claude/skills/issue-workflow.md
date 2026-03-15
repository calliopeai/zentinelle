# Skill: Issue Workflow

Use this workflow whenever working on a GitHub issue in calliopeai/zentinelle.

## State Machine

```
open → in_progress → [done/closed]
              ↓
           blocked (add label, comment with blocker)
```

## Workflow

### 1. Starting an Issue

```bash
# Move to In Progress (add label or use project board)
gh issue edit <number> --repo calliopeai/zentinelle --add-label "in-progress"

# Read the issue thoroughly
gh issue view <number> --repo calliopeai/zentinelle
```

- [ ] Read the full issue body and comments
- [ ] Identify affected files (check bootstrap.md impact table for blast radius)
- [ ] If touching policy engine or GraphQL schema, read the relevant skill file first

### 2. Implementation

Follow the appropriate skill for the type of change:
- Backend Python → `.claude/skills/backend-changes.md`
- GraphQL schema → `.claude/skills/graphql-schema.md`
- Policy engine → `.claude/skills/policy-impact.md`

### 3. Closing the Issue

```bash
# Close with a comment referencing the commit
gh issue close <number> --repo calliopeai/zentinelle \
  --comment "Fixed in <commit-sha>. <one-line summary of what was done>"
```

- [ ] Issue is closed ONLY after the commit is on `main` and validated
- [ ] MUST NOT close speculatively before validation passes
- [ ] Remove the `in-progress` label if added

### 4. If Blocked

```bash
gh issue comment <number> --repo calliopeai/zentinelle \
  --body "Blocked: <description of blocker>"
gh issue edit <number> --repo calliopeai/zentinelle \
  --add-label "blocked" --remove-label "in-progress"
```

## Issue Board

Project board: https://github.com/orgs/calliopeai/projects/4
