# Zentinelle console: route inventory and information architecture

Issue: zentinelle#446. Companion: [assistant-ag-ui.md](assistant-ag-ui.md), for zentinelle#447.

Status: proposal for review. Nothing moves until the information architecture is approved.

Base: `main` at `d7f72f8` (2026-10-16, after the audit rollup #448). Paths are relative to the repo root. Astrolift paths are in `calliopeai/astrolift-app`.

## 1. Summary

- **Today.** 60 pages under `frontend/app/(app)`, in 25 top-level route segments, behind a sidebar of 45 links in 7 groups (`frontend/components/AppSidebar.tsx`).
- **Proposal.** 7 areas and 23 functions. Every old URL keeps working through a redirect, and the paths Astrolift links to do not change.
- **Verdicts for the 60 pages.** Keep 31, merge 9, move to a tab or an action 16, delete 4.
- **New screens.** Six screens put existing APIs in front of people: approvals, policy changes, incident detail, evidence, reports and assistant settings.
- **How.** The shell and every screen are built in Storybook first, on the Astrolift operator-UI patterns, copied into this repo. The assistant docks on the right of every page.

## 2. What the inventory found

1. **One sidebar group holds 17 links.** "Governance" mixes agents, policies, content rules, models, budgets and ATLAS. Alerts, notifications and incidents sit under "Risk". "Network Policies" sits under Settings, though the page edits `network_policy` policies: `frontend/app/(app)/network/page.tsx` calls `usePolicies({ policyType: "network_policy" })`.
2. **15 routes are not in the sidebar.** The six agent detail routes, `/compliance/[framework]`, `/demo`, `/governance`, `/policies/[id]`, `/policies/create`, `/risk`, `/risks/[id]`, `/risks/create` and `/system-prompts/create`. #446 lists `demo` among the utilities in the navigation; it is not in the sidebar but an orphan entry point.
3. **The agents list never links to an agent.** `frontend/app/(app)/agents/page.tsx` has no `href`, `Link` or router call. The five agent tabs are reachable only by URL: through the Astrolift deeplinks in `bootstrap.md` ("Deeplink URL convention") and through the tab row itself.
4. **Links that lead nowhere.**
   - `/governance` links to `/audit`; the route is `/audit-logs` (`frontend/app/(app)/governance/page.tsx`).
   - The notification bell links to `/incidents/{id}`, and incidents have no detail route (`frontend/components/NotificationBell.tsx`).
   - The breadcrumb makes a link of every path segment (`frontend/components/PageHeader.tsx`), so `/budgets`, `/threats`, `/tools` and `/observability` link to pages that do not exist.
   - The backend defines eight frameworks (`FRAMEWORK_REQUIREMENTS` in `backend/zentinelle/models/compliance.py`). The compliance cards build a slug from each name (`frontend/app/(app)/compliance/page.tsx`), and `/compliance/[framework]` knows five hard-coded slugs, so SOC 2 Type II, NIST AI RMF, CCPA, ISO 27001 and ISO 42001 land on "Framework not found".
   - Edit in the prompt list opens `/system-prompts/builder?id=...`, but the builder never reads `id` and only calls `CreateSystemPrompt`. `UpdateSystemPrompt` has no caller (`frontend/graphql/known-invalid-operations.json`), so editing a prompt starts a new one.
5. **Static content shown as status.** `/compliance/frameworks` is a fixed list of five of those eight frameworks. `/compliance/[framework]` is a hard-coded table of controls, most of them marked `"met"`, that nothing computes. In a GRC console that reads as a compliance claim.
6. **Analytics computed in the browser from whole lists.** Anomalies (a 2-sigma rule over usage metrics), the policy analyzer (from `GetPolicies`, while `GET_POLICY_ANALYZER` in `frontend/graphql/policies/simulate.ts` is never imported), the scanner timeline and the FMEA table. The rule for the new screens: aggregates come from the server, and lists page on the server.
7. **Three assistant surfaces.** `/assistant`, `/policies/copilot`, and the floating `ChatBubble` that `frontend/app/(app)/layout.tsx` mounts on every page. The bubble and `/assistant` share one backend; the copilot has its own endpoints.
8. **APIs with no screen.** Held actions waiting for a person (`approvals/requests`), the list of policy change sets (`policy-changes`; only the copilot page calls its transition endpoint), the BROCS control map (`controls/brocs`) and telemetry health (`telemetry/health`).
9. **The dashboard links nowhere.** `frontend/app/(app)/dashboard/page.tsx` has no outbound link, so the landing page is a dead end.
10. **Admin-only data behind links everyone sees.** ATLAS, control evidence, route canary, agent controls, runtime settings, provider keys, API keys and legal holds need the admin role (`PortalAdminAccess` views, and `ADMIN_OPERATIONS` in `backend/zentinelle/schema/access.py`). The sidebar shows all of them to viewers, who then get an error.
11. **Broken operations, mostly fixed by #448.** The pages the audit found broken (risks, incidents, alerts, compliance, retention, API keys, effective policy) now reach their resolvers, and `npm test` checks every portal operation against a schema snapshot. Still open, and in scope for the new screens: export formats (audit M2), success toasts that ignore `success` (M3), and the four dead prompt mutations.
12. **Design debt.** About 120 lines with arbitrary values (raw hex, `text-[Npx]`, `rounded-[Npx]`) in 30 files, and 336 lines with raw palette classes such as `bg-red-500` in 43 files. No Storybook. Vitest arrived in #448 with one test file, `frontend/graphql/operations.test.ts`, and no component tests.

## 3. Route inventory

Lines are counted at `d7f72f8`, after the repo-wide prettier pass. "Reads" names the GraphQL operations, and the REST paths under `/api/zentinelle/v1`. In "Linked from", nav is the sidebar, tabs is the agent tab row, bell is the notification bell and tour is the demo tour. Verdicts: **keep** stays a page, perhaps at a new path; **merge** folds into another page as a view or a section; **move** becomes a tab or an action; **delete** goes, and its route redirects.

### 3.1 Agents

| Route | Lines | Reads | Linked from | Verdict |
|---|---|---|---|---|
| `/agents` | 667 | `GetEndpoints`, endpoint mutations, `GetAgentGroups` | nav, tour, agent back link | keep: Agents; rows link to the agent |
| `/agents/groups` | 285 | `GetAgentGroups`, group mutations | nav | keep: Agents > Groups |
| `/agents/[agentId]` | 10 | redirect to `activity` | Astrolift, breadcrumb | keep: load-bearing |
| `/agents/[agentId]/activity` | 62 | `GetEvents` | Astrolift, tabs | keep: tab |
| `/agents/[agentId]/interactions` | 79 | `GetInteractionLogs` | Astrolift, tabs | keep: tab |
| `/agents/[agentId]/usage` | 59 | `GetUsageMetrics` | Astrolift, tabs | keep: tab |
| `/agents/[agentId]/compliance` | 81 | `GetContentViolations` | Astrolift, tabs | keep: tab |
| `/agents/[agentId]/controls` | 172 | REST `agents/{id}/control` (admin) | tabs | keep: admin-only tab |

### 3.2 Policies, content rules and prompts

| Route | Lines | Reads | Linked from | Verdict |
|---|---|---|---|---|
| `/policies` | 544 | `GetPolicies`, policy mutations | nav, tour, `/governance`, gaps, import | keep: Policies workspace |
| `/policies/[id]` | 395 | `GetPolicy`, `DuplicatePolicy`, `UpdatePolicy`, `DeletePolicy`; REST `policies/{id}/history/`, `diff/` | list, bell | keep: policy detail with tabs |
| `/policies/create` | 320 | `GetPolicyOptions`, `CreatePolicy` | list, hierarchy, gaps, import | keep: New policy |
| `/policies/hierarchy` | 480 | `GetPolicies` | nav | move: Hierarchy tab |
| `/policies/effective` | 701 | `GetEndpoints`; REST `effective-policy?endpoint=` | nav | move: Effective tab |
| `/policies/simulator` | 362 | `GetPolicyOptions`, `SimulatePolicy` | nav, analyzer | move: Simulate action |
| `/policies/analyzer` | 354 | `GetPolicies`; analysis in the browser | nav | move: Analyze action on the server query |
| `/policies/import` | 746 | none; parses the document in the browser, then opens create with query params | nav | move: first step of New policy |
| `/policies/copilot` | 280 | REST `policy-copilot/status`, `draft`, `diff`, `stage`, `policy-changes/{id}/transition` | nav | delete: the assistant replaces it |
| `/network` | 363 | `GetPolicies` for `network_policy`, policy mutations | nav (under Settings) | merge: Policies view "Network" |
| `/content-rules` | 368 | `GetContentRules`, rule mutations | nav, `/governance`, scanner | keep: Policies > Content rules |
| `/content-rules/scanner` | 670 | `GetContentScans`, `GetContentViolations`; REST `export/violations.csv` | nav | move: Detections tab |
| `/system-prompts` | 398 | `GetSystemPrompts`, `DeleteSystemPrompt`, `ForkSystemPrompt` | nav | keep: Policies > Prompt library |
| `/system-prompts/create` | 312 | `CreateSystemPrompt` | list | merge: prompt editor, blank |
| `/system-prompts/builder` | 751 | `CreateSystemPrompt` | nav, list (Edit, Fork) | merge: prompt editor, from a template |
| `/system-prompts/generator` | 1036 | `CreateSystemPrompt` | nav | merge: prompt editor, guided |

### 3.3 Signals and audit

| Route | Lines | Reads | Linked from | Verdict |
|---|---|---|---|---|
| `/alerts` | 552 | `ComplianceAlerts`, alert mutations | nav (badge) | keep: Activity > Alerts |
| `/notifications` | 472 | `Notifications`, `UpdateNotification`, `MarkAllNotificationsRead` | nav (badge), bell | merge: Alerts view "Mine" |
| `/incidents` | 397 | `GetIncidents`, incident mutations; REST `incidents/{id}/comments/` | nav, `/governance`, bell | keep: Activity > Incidents, plus a detail route |
| `/events` | 524 | `GetEvents`, polled every 5 s | nav, bell | keep: Activity > Events |
| `/audit-logs` | 458 | `GetAuditLogs`; REST `audit/verify`, `audit/export/` | nav, tour | keep: Activity > Audit log |
| `/monitoring` | 595 | `GetUsageMetrics` | nav | keep: becomes Usage |
| `/observability/anomalies` | 813 | `GetUsageMetrics`; detection in the browser | nav | move: Usage > Anomalies tab |
| `/budgets/showback` | 218 | REST `budgets/showback` | nav | move: Usage > Budgets tab |

### 3.4 Risk and compliance

| Route | Lines | Reads | Linked from | Verdict |
|---|---|---|---|---|
| `/risks` | 628 | `GetRisks`, `GetRiskStats`, `DeleteRisk`, `ReviewRisk` | nav, `/governance`, tour, bell, `/risk` | keep: Risks register |
| `/risks/[id]` | 532 | `GetRisk`, risk mutations | list, bell | keep: risk detail |
| `/risks/create` | 347 | `CreateRisk` | list | keep: New risk |
| `/risks/overview` | 411 | `GetRisks`, `GetRiskStats`, `GetIncidents`; REST `risks/trend` | nav | move: Risks > Overview tab |
| `/risks/fmea` | 255 | `GetRisks` | nav | merge: Risks view "By RPN" |
| `/risks/reports` | 560 | REST `reports/` (create, status, download); history kept in one browser's localStorage | nav | merge: Reports |
| `/risk` | 10 | redirect to `/risks` | Astrolift | keep: load-bearing |
| `/compliance` | 638 | `GetComplianceOverview`, `ListCompliancePacks`, `ToggleFramework`, `RunComplianceCheck`, `ActivateCompliancePack` | nav, `/governance`, tour | keep: Compliance |
| `/compliance/frameworks` | 87 | none; a fixed list of five frameworks | nav | delete: Compliance lists live coverage |
| `/compliance/[framework]` | 606 | none; hard-coded controls | frameworks list, compliance cards | keep the route, rebuilt on live `frameworkCoverage` |
| `/compliance/gaps` | 301 | `GetComplianceOverview` | nav | move: Compliance > Gaps tab |
| `/compliance/reports` | 560 | `GetComplianceReports`, `GenerateComplianceReport`; REST download | nav | merge: Reports |
| `/governance` | 87 | none; a directory of six links | Astrolift, breadcrumb | merge: Overview; the path redirects |
| `/governance/evidence` | 190 | REST `evidence/controls` (admin) | nav | move: Evidence > Coverage tab |
| `/threats/atlas` | 97 | REST `threats/atlas` (admin) | nav | move: Evidence > MITRE ATLAS tab |

### 3.5 Models and settings

| Route | Lines | Reads | Linked from | Verdict |
|---|---|---|---|---|
| `/models` | 236 | `AiModels` | nav | keep: Models |
| `/models/compare` | 626 | `AiModels` | nav | move: Compare action; the route stays for shared links |
| `/models/route-canary` | 207 | REST `models/route-canary` (admin) | nav | move: Models > Route check tab |
| `/tools/token-calculator` | 189 | `AiModels` registry prices; tokens estimated as characters / 4 | nav | move: Estimate cost action on Models |
| `/settings` | 900 | `GetMyOrganization`, `UpdateOrganizationSettings`; REST `settings/runtime` with its changes and rollback | nav, user menu | keep: Settings > General, split into tabs |
| `/settings/api-keys` | 367 | `ApiKeys`, key mutations (admin) | nav | keep: Settings > API keys |
| `/settings/llm-providers` | 483 | REST `settings/llm-providers` (admin), `assistant/providers`, `assistant/models` | nav | keep: moves to Models > Providers |
| `/settings/astrolift` | 377 | REST `settings/astrolift`, enrollment codes, installs, clusters (admin) | nav | keep: Settings > Integrations |
| `/retention` | 541 | `GET_RETENTION_DATA` (inline), retention mutations | nav | keep: moves to Settings > Data retention |
| `/retention/legal-holds` | 394 | `LegalHolds`, hold mutations (admin) | nav | move: Data retention > Legal holds tab |

### 3.6 Landing and assistant

| Route | Lines | Reads | Linked from | Verdict |
|---|---|---|---|---|
| `/dashboard` | 557 | `DashboardStats` | nav, login, `/`, demo, tour | keep: Overview, rebuilt with links into every area |
| `/assistant` | 131 | REST `assistant/chat`, `assistant/execute-tool`, `assistant/providers` | nav | delete: the dock replaces it |
| `/demo` | 106 | none; starts the demo tour | no console link; external `?autostart=1` | delete from the console (decision 4) |

Totals: keep 31, merge 9, move 16, delete 4.

## 4. Proposed information architecture

### 4.1 Areas and functions

Seven areas and 23 functions. A function is one sidebar row; its tabs, views and actions live inside it.

| Area | Functions (route) | Tabs, views and actions | Absorbs |
|---|---|---|---|
| Overview | Overview (`/dashboard`) | KPIs that link, a needs-attention list, the onboarding card | `/dashboard`, `/governance` |
| Agents | Agents (`/agents`); Groups (`/agents/groups`); Approvals (`/agents/approvals`, new) | agent tabs: Activity, Interactions, Usage, Compliance, Controls (admin), Policies (new) | the 8 agent routes |
| Policies | Policies (`/policies`); Content rules (`/content-rules`); Prompt library (`/system-prompts`) | Policies tabs: All, Hierarchy, Effective, Changes (new); views by type, such as Network, Budgets and Oversight; actions: New (blank or from a document), Simulate, Analyze coverage. Content rules tabs: Rules, Detections. Prompt library: one editor, started blank, from a template or guided | 16 routes: 9 policy routes, `/network`, 2 content rule routes, 4 prompt routes |
| Activity | Alerts (`/alerts`); Incidents (`/incidents`, detail `/incidents/{id}` new); Events (`/events`); Audit log (`/audit-logs`) | Alerts views: Open, All, Mine (the notifications) | `/alerts`, `/notifications`, `/incidents`, `/events`, `/audit-logs` |
| Risk & compliance | Risks (`/risks`); Compliance (`/compliance`); Evidence (`/evidence`, admin, new); Reports (`/reports`, new) | Risks tabs: Register, Overview; register views: List, Matrix, By RPN. Compliance tabs: Frameworks, Gaps; framework detail on live coverage. Evidence tabs: Coverage, MITRE ATLAS, BROCS (new). Reports: risk and compliance reports in one list | 14 routes: 7 risk, 5 compliance, `/governance/evidence`, `/threats/atlas` |
| Models & usage | Usage (`/usage`); Models (`/models`); Providers (`/models/providers`, admin) | Usage tabs: Overview, Budgets, Anomalies. Models actions: Compare, Estimate cost; tab Route check (admin) | `/monitoring`, `/observability/anomalies`, `/budgets/showback`, 4 model routes, `/settings/llm-providers` |
| Settings (admin) | General (`/settings`); API keys (`/settings/api-keys`); Integrations (`/settings/astrolift`); Data retention (`/settings/retention`); Assistant (`/settings/assistant`, new) | General tabs: Organization, Enforcement, Notifications, Runtime, Bootstrap tokens. Data retention tabs: Policies, Legal holds | `/settings`, `/settings/api-keys`, `/settings/astrolift`, `/retention`, `/retention/legal-holds` |

`/assistant` and `/demo` go; both redirect to Overview.

Where things land that someone might look for elsewhere:
- **Budgets.** A budget is a `budget_limit` policy, edited in Policies (view "Budgets"). Spend against it lives in Usage > Budgets, which links to the policy.
- **Approvals** sit under Agents, as in Astrolift's navigation model (the Agents area's "Approvals" function in `frontend/lib/shell/nav-model.ts`), with a count on Overview.
- **Personal settings** (language, appearance, density) move to the user menu, so that Settings can be admin-only.

### 4.2 Detail pages

One row of tabs per entity, named by function, as on Astrolift's detail pages.
- **Agent** (`/agents/{agentId}/{tab}`): Activity, Interactions, Usage, Compliance, Controls (admin), and Policies (new: what is in effect for this agent, from `effective-policy?endpoint=`). Paths unchanged.
- **Policy** (`/policies/{id}`): Overview, Configuration, Scope and effect, History. Actions: Simulate, Duplicate, Disable, Delete, Ask the assistant.
- **Incident** (`/incidents/{id}`, new): Timeline, Evidence, Comments, on the existing REST `incidents/{id}/`, `evidence/` and `comments/`.
- **Risk** (`/risks/{id}`), **prompt** (`/system-prompts/{id}`, the editor) and **framework** (`/compliance/{framework}`).

### 4.3 Role visibility

The sidebar shows only what the signed-in role can open, the way Astrolift's `visibleNav` filters by capability. Roles come from the capabilities `/auth/me` returns (`view`, `mutate`, `admin`; `backend/zentinelle/auth/roles.py`).

| Role | Sees | Can change |
|---|---|---|
| viewer | Overview, Agents (without Controls), Policies, Activity, Risks, Compliance, Reports, Usage, Models | nothing |
| operator | the same | policies by hand, content rules, prompts, risks, incidents, alerts, approval decisions; stages policy changes |
| admin | everything, plus Evidence, Route check, Providers, agent Controls and Settings | approves and promotes policy changes; settings, keys and legal holds |

### 4.4 Redirect map

Old routes redirect on the server and keep their query string.

| Old route | New home |
|---|---|
| `/assistant` | `/dashboard?assistant=open` |
| `/policies/copilot` | `/policies?assistant=open` |
| `/policies/analyzer` | `/policies?panel=analyze` |
| `/policies/simulator` | `/policies?panel=simulate` |
| `/policies/import` | `/policies/create?source=document` |
| `/network` | `/policies?type=network_policy` |
| `/content-rules/scanner` | `/content-rules/detections` |
| `/system-prompts/create` | `/system-prompts/new` |
| `/system-prompts/builder` | `/system-prompts/new?mode=template`; with `?id=X`, `/system-prompts/X` |
| `/system-prompts/generator` | `/system-prompts/new?mode=guided` |
| `/notifications` | `/alerts?view=mine` |
| `/monitoring` | `/usage` |
| `/observability/anomalies` | `/usage/anomalies` |
| `/budgets/showback` | `/usage/budgets` |
| `/risks/fmea` | `/risks?view=rpn` |
| `/risks/reports` | `/reports?type=risk` |
| `/compliance/frameworks` | `/compliance` |
| `/compliance/reports` | `/reports?type=compliance` |
| `/compliance/{old slug}` | `/compliance/{framework id}`, ids as the backend names them |
| `/governance` | `/dashboard` (kept for Astrolift) |
| `/governance/evidence` | `/evidence` |
| `/threats/atlas` | `/evidence/atlas` |
| `/models/route-canary` | `/models/routes` |
| `/tools/token-calculator` | `/models?panel=estimate` |
| `/settings/llm-providers` | `/models/providers` |
| `/retention` | `/settings/retention` |
| `/retention/legal-holds` | `/settings/retention/legal-holds` |
| `/demo` | `/dashboard` |
| `/audit` (linked, never existed) | `/audit-logs` |

Unchanged paths (33 of the 60): `/dashboard`, `/agents`, `/agents/groups`, `/agents/{agentId}` and its five tabs, `/policies`, `/policies/{id}`, `/policies/create`, `/policies/hierarchy`, `/policies/effective`, `/content-rules`, `/system-prompts`, `/alerts`, `/incidents`, `/events`, `/audit-logs`, `/risks`, `/risks/{id}`, `/risks/create`, `/risks/overview`, `/risk`, `/compliance`, `/compliance/gaps`, `/compliance/{framework}`, `/models`, `/models/compare`, `/settings`, `/settings/api-keys`, `/settings/astrolift`.

**Load-bearing for Astrolift** (`bootstrap.md`, "Deeplink URL convention"): `/agents/{agent_id}` with `activity`, `interactions`, `usage` and `compliance`, plus `/governance` and `/risk`. They keep working, with a contract test per path.

**How.** One table, `frontend/lib/routes/former-routes.ts`, feeds `redirects()` in `frontend/next.config.ts` for static paths, and a `formerRoute()` server redirect for dynamic ones, the pattern of astrolift-app `frontend/app/(app)/agents/[agentSlug]/components/former-route.ts`. A vitest ledger test lists the 60 routes of `d7f72f8` and fails unless each is a page or a table entry; it also fails if it finds fewer than 60, so it cannot pass empty. Redirects stay temporary (307) while an area is in review and become permanent (308) once it ships.

## 5. The shared page shell

The Astrolift overhaul worked, so this one reuses its patterns. They are copied into this repo; no package is shared between the two consoles yet (decision 8). All sources are in astrolift-app.

| Piece | Astrolift source | In Zentinelle |
|---|---|---|
| Layout | `frontend/components/shell/AppShell.tsx`: main rail on the left, content, a right rail; `[` and `]` toggle the rails | main rail, content, and the assistant dock on the right |
| Navigation | `frontend/components/shell/MainRail.tsx` and `frontend/lib/shell/nav-model.ts`: areas, groups and functions; `visibleNav`; `activeFor`, the longest-prefix match; `areaSwitcher`; `navLabel` from the message catalogs | the seven areas, filtered by role, with names from `frontend/messages/*.json` |
| Page header | `frontend/components/shell/ShellHeader.tsx`: crumbs whose first crumb switches functions; a title row with status, context, one primary action and a menu; at most one row of tabs | every page. Crumbs come from the navigation model, never from path segments |
| Lists | `frontend/components/list/ListPage.tsx` with `FilterBar`, `ListPagination`, `NewRowsPill` and `list-state`; the ten data-surface rules in `frontend/bootstrap.md` | every list: views as tabs, server paging and sort, search only where the query supports it, `empty` and `emptyFiltered` as separate states, skeleton rows, rows that navigate are real links |
| Detail tabs | `frontend/components/DetailPageTabs.tsx` | agent, policy, incident, risk and framework |
| Containers | the container rule in `frontend/bootstrap.md`: `PageShell > Section > (Card, Table or Chart)`, two levels at most; `StatTile` and `DefinitionList` | every page |
| Appearance | `frontend/lib/appearance.ts`: `data-ground`, `data-accent`, `data-density` | the same attributes, set as below |

**Look,** from the operator-UI amendment of the Astrolift design guide:
- Ground true black, panels `#0A0A0A`, raised `#141414`. Light grounds, paper and mist, stay available.
- The sidebar is the one brand surface: Zentinelle navy `#0b0b19`. The accent stays Zentinelle teal `#37efed`, and the family's selectable accents remain.
- Status colors never change with the accent: lime `#8FD82A` ok, amber warn, red `#FF6B6B` error.
- Corners are 2px; pills and avatars stay round.
- Density is a real setting: `compact` (the default, one panel of hairline rows) or `cards`.
- A lint rule copied from Astrolift's `no-raw-design-values` runs at error, with an allowlist that can only shrink, so the debt counted in section 2 only goes down.

**Page rules:**
- A page fits about two screens. Anything longer becomes a tab, or a section that loads when opened.
- Fetch only what is shown: server paging, tabs that query when opened, and aggregates from the server (`PolicyAnalyzer`, risk stats, usage metrics, baselines). Never fetch a whole list to draw a chart.
- One query error state for every hook, and one mutation helper that fails loudly when `success` is false (audit M1 frontend half, and M3).
- Export menus offer the backend's formats and pass the active filters (audit M2).

**Storybook first:**
- Primitives in `frontend/components/ui`, compositions in `frontend/components/patterns`, whole screens in `frontend/components/screens`. Each has stories in every state: loading, empty, empty after filtering, error, full, long strings, 768 px wide.
- Screens are pure: props in, callbacks out. A route under `frontend/app` fetches, maps the result to the screen's props, and renders the screen.
- Enforced as in Astrolift: a story-per-component test, and the `no-markup-in-app` and `no-raw-table` lint rules at error.

**Where the assistant docks:**
- In the shell's right rail, the slot Astrolift uses for its projects rail. 400 px wide by default, resizable from 320 to 560 px, and collapsible to nothing.
- Opened from a header button or with the `]` key. It pushes the content aside rather than covering it, so an element the assistant highlights stays in view.
- It lives in the `(app)` layout, so a conversation survives navigation. Below the `md` breakpoint it opens as a full-height sheet, like Astrolift's mobile rails. It can expand to full width, which replaces `/assistant`.
- It replaces the floating `ChatBubble`, and it reads the route and the page header's entity (type and id) as context. Its internals are in the companion design.

## 6. Migration order

Each step ships on its own and leaves every old link working.

| Step | Scope | Risk, and how to contain it |
|---|---|---|
| 0. Prerequisites | Done in #448: the mutation contract, effective policy over a portal session, `UNAUTHENTICATED` with the login redirect, API key scopes and the keys list, and the lint, prettier and vitest gates with the operation validator. Still needed before step 4: one config schema per policy type, exposed to the portal (audit PR 13, H20). | Policy editors built before that schema would bake in the wrong keys. |
| 1. Foundations | appearance tokens, Storybook with the a11y addon, the story-per-component test, the three lint rules, the navigation model, the redirect table and its ledger test, the query error state and the mutation helper | Nothing visible. |
| 2. Shell | AppShell, the main rail, the page header, the dock slot (empty until the assistant lands), the user menu; the old pages render inside the new shell | Layout regressions on all 60 pages at once. Screenshot every route before and after; the shell does not touch page content. |
| 3. Agents (pilot) | Agents and Groups on ListPage, rows that link, the detail tab row, and the new Approvals inbox on `approvals/requests` | The Astrolift deeplinks: their paths stay, and a contract test opens each one. |
| 4. Policies | 16 routes: the workspace and its four tabs, Changes on `policy-changes`, the detail tabs, Simulate and Analyze as actions, New with document import, content rules with Detections, and one prompt editor that edits in place | The editor depends on step 0's schema. The analyzer moves from the browser to `PolicyAnalyzer`, so compare both on fixtures before switching. |
| 5. Activity | Alerts with "Mine", Incidents with a detail route, Events as a live list, the audit log with full export | Events poll every 5 s today. Use held rows and the new-rows pill so the list does not reflow. |
| 6. Models & usage | Usage with Budgets and Anomalies; Models with Compare, Estimate cost and Route check; Providers | Figures are as true as metering. #448 fixed most of it; the proxy still records usage outside the canonical ingest (a follow-up #448 lists). Label anything estimated. |
| 7. Risk & compliance | Risks with Overview and the RPN view, Compliance on live coverage, Evidence (Coverage, ATLAS, BROCS), one Reports list with its history on the server | Compliance packs still write some keys the evaluators do not read (audit H20, open). Show configuration and operating evidence apart, and never a "met" that nothing measured. |
| 8. Settings | the admin-only area, General in tabs, Data retention with Legal holds, Integrations, Assistant | Admin-only routes must answer other roles with a clean 403, not an empty page. |
| 9. Overview | rebuilt last, since it links into every area: KPIs that link, a needs-attention list (approvals, incidents, staged changes, critical alerts), the onboarding card | Keep it to one Overview query rather than six. |
| 10. Cleanup | delete the old page code (the redirects stay), `ChatBubble`, `use-chat`, the copilot page and the dead prompt mutations | Delete only once the ledger test proves every old route resolves. |

## 7. Decisions for Leo

1. **Areas.** The seven above (Overview, Agents, Policies, Activity, Risk & compliance, Models & usage, Settings), or Usage as an eighth area of its own.
2. **Approvals** under Agents (recommended, the Astrolift precedent), or under Activity.
3. **`/governance`** lands on Overview (recommended) or on Policies. Either way the path keeps working for Astrolift.
4. **Demo.** Remove `/demo` and the demo tour from the console (recommended; the tour engine stays, since the assistant's `highlight` uses it), or keep an entry-only route for the website's embeds.
5. **Token calculator.** An "Estimate cost" action on Models (recommended; since #448 it reads registry prices), or remove it.
6. **Notifications** fold into Alerts as the "Mine" view (recommended), or keep their own page.
7. **Framework detail** rebuilt on live `frameworkCoverage` (recommended). Separately: remove the hard-coded "met" table now, ahead of the overhaul, as a correctness fix.
8. **Shell code** copied from astrolift-app into this repo (recommended), or extracted now into a package both consoles share.
9. **Look.** Black ground, navy sidebar, teal accent, the family status colors (`#FF6B6B` replaces `#ef3737` for errors), 2px corners. Confirm.
10. **Rollout.** The new shell first, around the old pages, then area by area (recommended); or a feature flag and one switch at the end.
11. **Quick fixes now,** before any area moves: agent rows that link, the `/audit` and `/incidents/{id}` links, the breadcrumb, and prompt Edit. Do them now, or let each area's migration carry them.
12. **Settings admin-only,** with language and appearance moved to the user menu. Confirm.
