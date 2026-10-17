/**
 * Where a notification leads, in the new routes. `metadata.relatedUrl` wins;
 * then the resource it names (an incident now has a page of its own); then a
 * fallback by type. Never null: a row that navigates always has a target.
 */
import type { NotificationData } from "@/graphql/notifications/types";

function id(md: Record<string, unknown>, camel: string, snake: string) {
  const value = md[camel] ?? md[snake];
  return typeof value === "string" && value ? encodeURIComponent(value) : null;
}

export function notificationHref(
  n: Pick<NotificationData, "type" | "metadata">,
): string {
  const md = (n.metadata ?? {}) as Record<string, unknown>;
  if (typeof md.relatedUrl === "string" && md.relatedUrl.startsWith("/"))
    return md.relatedUrl;
  const incident = id(md, "incidentId", "incident_id");
  if (incident) return `/incidents/${incident}`;
  const policy = id(md, "policyId", "policy_id");
  if (policy) return `/policies/${policy}`;
  const risk = id(md, "riskId", "risk_id");
  if (risk) return `/risks/${risk}`;
  switch (n.type) {
    case "incident_opened":
      return "/incidents";
    case "budget_warning":
      return "/usage/budgets";
    case "policy_violation":
      return "/events";
    case "high_risk":
      return "/risks";
    default:
      return "/alerts?view=mine";
  }
}
