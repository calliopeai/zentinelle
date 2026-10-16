export const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  agents: "Agents",
  groups: "Agent Groups",
  policies: "Policies",
  "content-rules": "Content Rules",
  events: "Events",
  "audit-logs": "Audit Logs",
  monitoring: "Monitoring",
  risks: "Risks",
  incidents: "Incidents",
  compliance: "Compliance",
  "system-prompts": "System Prompts",
  astrolift: "Astrolift",
  settings: "Settings",
  notifications: "Notifications",
  retention: "Data Retention",
  "legal-holds": "Legal Holds",
  builder: "Prompt Builder",
  generator: "Prompt Generator",
  assistant: "AI Assistant",
  new: "Create",
  create: "Create",
};

/**
 * Path prefixes that group pages but are not pages themselves, such as
 * /budgets in /budgets/showback. The breadcrumb shows them as text rather than
 * as a link to a 404. routes.test.ts keeps this equal to the prefixes under
 * app/(app) that have no page.tsx.
 */
export const sectionsWithoutPage: ReadonlySet<string> = new Set([
  "/budgets",
  "/observability",
  "/threats",
  "/tools",
]);
