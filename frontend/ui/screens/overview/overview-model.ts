/**
 * The Overview's data, mapped from the operations the app already sends:
 * `DashboardStats`, `GetRiskStats` and `ComplianceAlerts(status: "open")`
 * (the sidebar's badge query, so the cache shares it). Pending approvals and
 * staged policy changes are REST today (`approvals/requests`,
 * `policy-changes`) with no client yet; they come in as counts, and an
 * absent count leaves its row out.
 */
import type { StatusTone } from "@calliopelabs/ui";

import type { ComplianceAlertData } from "@/graphql/alerts/types";
import type { DashboardStats } from "@/graphql/dashboard/types";
import type { RiskStatsData } from "@/graphql/risks/types";

export type RiskStats = NonNullable<RiskStatsData["riskStats"]>;

export interface Kpi {
  key: string;
  label: string;
  /** `null`: the number could not be read. */
  value: number | null;
  detail: string;
  href: string;
  tone?: StatusTone;
}

export type AttentionKind =
  "approvals" | "alerts" | "incidents" | "changes" | "agents" | "risks";

export interface AttentionItem {
  kind: AttentionKind;
  count: number;
  title: string;
  description: string;
  href: string;
  tone: StatusTone;
}

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

export interface ActivityEntry {
  id: string;
  description: string;
  actor: string | null;
  timestamp: string | null;
}

export interface OverviewData {
  kpis: Kpi[];
  attention: AttentionItem[];
  /** `null`: nothing left to set up, or the checklist was dismissed. */
  onboarding: OnboardingStep[] | null;
  activity: ActivityEntry[];
}

export interface OverviewInput {
  stats: DashboardStats | null;
  /** `null` when GetRiskStats failed or has not answered. */
  riskStats: RiskStats | null;
  openAlerts: readonly ComplianceAlertData[];
  pendingApprovals?: number | null;
  stagedChanges?: number | null;
}

const number = new Intl.NumberFormat("en");

export function formatCount(value: number | null): string | null {
  return value === null ? null : number.format(value);
}

function plural(n: number, one: string, many: string) {
  return `${number.format(n)} ${n === 1 ? one : many}`;
}

/** The checklist keys the backend may send, in words; unknown keys are humanized. */
const STEP_LABELS: Record<string, { label: string; href: string }> = {
  register_agent: { label: "Register an agent", href: "/agents" },
  create_policy: { label: "Create a policy", href: "/policies/create" },
  enable_compliance: {
    label: "Turn on a compliance framework",
    href: "/compliance",
  },
};

function stepFor(key: string, done: boolean): OnboardingStep {
  const known = STEP_LABELS[key];
  const words = key.replace(/[_-]+/g, " ");
  return {
    key,
    done,
    label: known?.label ?? words.charAt(0).toUpperCase() + words.slice(1),
    href: known?.href ?? "/dashboard",
  };
}

function onboardingFor(stats: DashboardStats | null): OnboardingStep[] | null {
  const checklist = stats?.checklist;
  const steps = checklist
    ? checklist.dismissed
      ? []
      : checklist.items
          .filter((item) => item.key)
          .map((item) => stepFor(item.key as string, item.isComplete))
    : // Standalone deployments send no checklist; the counts say the same.
      [
        stepFor("register_agent", (stats?.agents?.total ?? 0) > 0),
        stepFor("create_policy", (stats?.policies?.total ?? 0) > 0),
      ];
  return steps.length > 0 && steps.some((s) => !s.done) ? steps : null;
}

function trendDetail(trend: number) {
  if (trend === 0) return "No change from last week";
  const sign = trend > 0 ? "+" : "";
  return `${sign}${number.format(trend)}% this week against last`;
}

export function toOverview({
  stats,
  riskStats,
  openAlerts,
  pendingApprovals,
  stagedChanges,
}: OverviewInput): OverviewData {
  const agents = stats?.agents;
  const policies = stats?.policies;
  const usage = stats?.apiUsage;
  const unhealthy = agents?.unhealthy ?? 0;

  const kpis: Kpi[] = [
    {
      key: "agents",
      label: "Agents",
      value: agents?.total ?? 0,
      detail:
        (agents?.total ?? 0) === 0
          ? "None registered yet"
          : `${number.format(agents?.active ?? 0)} active, ${
              unhealthy === 0
                ? "all healthy"
                : `${number.format(unhealthy)} not healthy`
            }`,
      href: "/agents",
      tone: (agents?.total ?? 0) === 0 ? undefined : unhealthy ? "warn" : "ok",
    },
    {
      key: "policies",
      label: "Policies",
      value: policies?.total ?? 0,
      detail: `${number.format(policies?.enabled ?? 0)} enabled`,
      href: "/policies",
    },
    {
      key: "incidents",
      label: "Open incidents",
      value: riskStats?.openIncidents ?? null,
      detail: !riskStats
        ? "Could not be read"
        : riskStats.slaBreachedCount > 0
          ? `${number.format(riskStats.slaBreachedCount)} past SLA`
          : "None past SLA",
      href: "/incidents",
      tone: !riskStats
        ? undefined
        : riskStats.slaBreachedCount > 0
          ? "error"
          : riskStats.openIncidents > 0
            ? "warn"
            : "ok",
    },
    {
      key: "events",
      label: "Events today",
      value: usage?.today ?? 0,
      detail: trendDetail(usage?.trend ?? 0),
      href: "/events",
    },
  ];

  const severe = openAlerts.filter(
    (a) => a.severity === "critical" || a.severity === "high",
  );
  const critical = severe.filter((a) => a.severity === "critical").length;

  const candidates: (AttentionItem | null)[] = [
    severe.length > 0
      ? {
          kind: "alerts",
          count: severe.length,
          title: plural(severe.length, "open alert", "open alerts"),
          description:
            critical > 0
              ? `${number.format(critical)} critical, ${number.format(severe.length - critical)} high`
              : "High severity",
          href: "/alerts",
          tone: critical > 0 ? "error" : "warn",
        }
      : null,
    riskStats && riskStats.openIncidents > 0
      ? {
          kind: "incidents",
          count: riskStats.openIncidents,
          title: plural(
            riskStats.openIncidents,
            "open incident",
            "open incidents",
          ),
          description:
            riskStats.slaBreachedCount > 0
              ? `${number.format(riskStats.slaBreachedCount)} past SLA`
              : "Within SLA",
          href: "/incidents",
          tone: riskStats.slaBreachedCount > 0 ? "error" : "warn",
        }
      : null,
    pendingApprovals
      ? {
          kind: "approvals",
          count: pendingApprovals,
          title: plural(
            pendingApprovals,
            "action waiting for approval",
            "actions waiting for approval",
          ),
          description: "Agents are holding these until someone decides",
          href: "/agents/approvals",
          tone: "warn",
        }
      : null,
    stagedChanges
      ? {
          kind: "changes",
          count: stagedChanges,
          title: plural(
            stagedChanges,
            "staged policy change",
            "staged policy changes",
          ),
          description: "Waiting for an admin to approve and promote",
          href: "/policies?tab=changes",
          tone: "info",
        }
      : null,
    unhealthy > 0
      ? {
          kind: "agents",
          count: unhealthy,
          title: plural(unhealthy, "agent not healthy", "agents not healthy"),
          description: "Not reporting a healthy heartbeat",
          href: "/agents",
          tone: "warn",
        }
      : null,
    riskStats && riskStats.criticalRisks > 0
      ? {
          kind: "risks",
          count: riskStats.criticalRisks,
          title: plural(
            riskStats.criticalRisks,
            "critical risk",
            "critical risks",
          ),
          description: "In the risk register",
          href: "/risks",
          tone: "warn",
        }
      : null,
  ];

  return {
    kpis,
    attention: candidates.filter((c): c is AttentionItem => c !== null),
    onboarding: onboardingFor(stats),
    activity: (stats?.recentActivity ?? []).slice(0, 6).map((a, i) => ({
      id: a.id ?? `activity-${i}`,
      description: a.description ?? a.type ?? "Activity",
      actor: a.actor,
      timestamp: a.timestamp,
    })),
  };
}

/** "5 min ago", from an ISO time, against `now` (a fixed one in stories). */
export function timeAgo(iso: string | null, now: Date): string {
  if (!iso) return "Unknown time";
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
