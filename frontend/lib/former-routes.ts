/**
 * Pages that moved to their ui-overhaul-ia §4.4 address. Each old path
 * redirects to the new one (next.config.ts), keeping its query string, so
 * bookmarks, notification links and docs keep working.
 *
 * Only pages that moved as they are belong here. Routes the IA folds into a
 * tab, view or action of another page (`/settings/retention/legal-holds`) keep their address until that screen exists.
 *
 * Temporary (307) while the areas are in review; permanent once they ship.
 */
export interface FormerRoute {
  from: string;
  to: string;
}

export const FORMER_ROUTES: readonly FormerRoute[] = [
  { from: "/approvals", to: "/agents/approvals" },
  { from: "/monitoring", to: "/usage" },
  { from: "/observability/anomalies", to: "/usage/anomalies" },
  { from: "/budgets/showback", to: "/usage/budgets" },
  { from: "/governance/evidence", to: "/evidence" },
  { from: "/threats/atlas", to: "/evidence/atlas" },
  { from: "/models/route-canary", to: "/models/routes" },
  { from: "/settings/llm-providers", to: "/models/providers" },
  { from: "/retention", to: "/settings/retention" },
  { from: "/retention/legal-holds", to: "/settings/retention/legal-holds" },
  { from: "/content-rules/scanner", to: "/content-rules/detections" },
  { from: "/system-prompts/create", to: "/system-prompts/new" },
  { from: "/system-prompts/generator", to: "/system-prompts/new?mode=guided" },
  { from: "/policies/analyzer", to: "/policies?panel=analyze" },
  { from: "/policies/simulator", to: "/policies?panel=simulate" },
  { from: "/policies/import", to: "/policies/create?source=document" },
  { from: "/network", to: "/policies?type=network_policy" },
  { from: "/risks/fmea", to: "/risks?view=rpn" },
  { from: "/risks/reports", to: "/reports?type=risk" },
  { from: "/compliance/frameworks", to: "/compliance" },
  { from: "/compliance/reports", to: "/reports?type=compliance" },
  { from: "/tools/token-calculator", to: "/models?panel=estimate" },
  // Astrolift's SECURE portal links here; the Overview is the landing now.
  { from: "/governance", to: "/dashboard" },
  // The demo landing; `?autostart=1` (and `?embed=1`) still start the tour.
  { from: "/demo", to: "/dashboard" },
  // Alerts' Mine view replaced the notifications page.
  { from: "/notifications", to: "/alerts?view=mine" },
  // Linked once, never a page.
  { from: "/audit", to: "/audit-logs" },
];
