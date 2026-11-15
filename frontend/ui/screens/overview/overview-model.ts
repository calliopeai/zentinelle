/**
 * The Overview's data, mapped from the operations the app already sends:
 * `DashboardStats`, `GetRiskStats` and `ComplianceAlerts(status: "open")`
 * (the sidebar's badge query, so the cache shares it). Pending approvals and
 * staged policy changes are REST today (`approvals/requests`,
 * `policy-changes`) with no client yet; they come in as counts, and an
 * absent count leaves its row out.
 *
 * The model holds no copy: it names messages under the `overview` namespace
 * of `messages/en.json` (a `Copy`), and the components translate them.
 */
import type { StatusTone } from "@calliopelabs/ui";

import type { ComplianceAlertData } from "@/graphql/alerts/types";
import type { DashboardStats } from "@/graphql/dashboard/types";
import type { RiskStatsData } from "@/graphql/risks/types";

export type RiskStats = NonNullable<RiskStatsData["riskStats"]>;

/** A message of the `overview` namespace and its values. */
export interface Copy {
  key: string;
  values?: Record<string, number>;
}

export type KpiKey = "agents" | "policies" | "incidents" | "events";

export interface Kpi {
  /** Also names its label: `overview.kpis.<key>.label`. */
  key: KpiKey;
  /** `null`: the number could not be read. */
  value: number | null;
  /** Under `overview.kpis`; `null` while there is nothing to say. */
  detail: Copy | null;
  href: string;
  tone?: StatusTone;
}

export type AttentionKind =
  "approvals" | "alerts" | "incidents" | "changes" | "agents" | "risks";

export interface AttentionItem {
  /** Also names its title: `overview.attention.<kind>.title`, by `count`. */
  kind: AttentionKind;
  count: number;
  /** Under `overview.attention`. */
  description: Copy;
  href: string;
  tone: StatusTone;
}

export interface OnboardingStep {
  key: string;
  /** Known steps are named by `overview.onboarding.steps.<key>`; others by `label`. */
  known: boolean;
  /** The key in words, for a step the catalog does not name. */
  label: string;
  done: boolean;
  href: string;
}

export interface ActivityEntry {
  id: string;
  /** `null`: the entry says nothing about itself. */
  description: string | null;
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

/** The checklist keys the backend may send; unknown keys are humanized. */
const STEP_HREFS: Record<string, string> = {
  register_agent: "/agents",
  create_policy: "/policies/create",
  enable_compliance: "/compliance",
};

function stepFor(key: string, done: boolean): OnboardingStep {
  const href = STEP_HREFS[key];
  const words = key.replace(/[_-]+/g, " ");
  return {
    key,
    known: href !== undefined,
    label: words.charAt(0).toUpperCase() + words.slice(1),
    done,
    href: href ?? "/dashboard",
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

function trendDetail(trend: number): Copy {
  if (trend === 0) return { key: "events.noChange" };
  return {
    key: trend > 0 ? "events.up" : "events.down",
    values: { trend: Math.abs(trend) },
  };
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
  const active = agents?.active ?? 0;

  const kpis: Kpi[] = [
    {
      key: "agents",
      value: agents?.total ?? 0,
      detail:
        (agents?.total ?? 0) === 0
          ? { key: "agents.none" }
          : unhealthy === 0
            ? { key: "agents.healthy", values: { active } }
            : { key: "agents.unhealthy", values: { active, unhealthy } },
      href: "/agents",
      tone: (agents?.total ?? 0) === 0 ? undefined : unhealthy ? "warn" : "ok",
    },
    {
      key: "policies",
      value: policies?.total ?? 0,
      detail: {
        key: "policies.enabled",
        values: { enabled: policies?.enabled ?? 0 },
      },
      href: "/policies",
    },
    {
      key: "incidents",
      value: riskStats?.openIncidents ?? null,
      detail: !riskStats
        ? { key: "incidents.unread" }
        : riskStats.slaBreachedCount > 0
          ? {
              key: "incidents.pastSla",
              values: { count: riskStats.slaBreachedCount },
            }
          : { key: "incidents.withinSla" },
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
          description:
            critical > 0
              ? {
                  key: "alerts.mixed",
                  values: { critical, high: severe.length - critical },
                }
              : { key: "alerts.highOnly" },
          href: "/alerts",
          tone: critical > 0 ? "error" : "warn",
        }
      : null,
    riskStats && riskStats.openIncidents > 0
      ? {
          kind: "incidents",
          count: riskStats.openIncidents,
          description:
            riskStats.slaBreachedCount > 0
              ? {
                  key: "incidents.pastSla",
                  values: { count: riskStats.slaBreachedCount },
                }
              : { key: "incidents.withinSla" },
          href: "/incidents",
          tone: riskStats.slaBreachedCount > 0 ? "error" : "warn",
        }
      : null,
    pendingApprovals
      ? {
          kind: "approvals",
          count: pendingApprovals,
          description: { key: "approvals.description" },
          href: "/agents/approvals",
          tone: "warn",
        }
      : null,
    stagedChanges
      ? {
          kind: "changes",
          count: stagedChanges,
          description: { key: "changes.description" },
          href: "/policies?tab=changes",
          tone: "info",
        }
      : null,
    unhealthy > 0
      ? {
          kind: "agents",
          count: unhealthy,
          description: { key: "agents.description" },
          href: "/agents",
          tone: "warn",
        }
      : null,
    riskStats && riskStats.criticalRisks > 0
      ? {
          kind: "risks",
          count: riskStats.criticalRisks,
          description: { key: "risks.description" },
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
      description: a.description ?? a.type ?? null,
      actor: a.actor,
      timestamp: a.timestamp,
    })),
  };
}

/** "5 min ago", from an ISO time, against `now` (a fixed one in stories); under `overview.recentActivity.time`. */
export function timeAgo(iso: string | null, now: Date): Copy {
  if (!iso) return { key: "unknown" };
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return { key: "justNow" };
  if (mins < 60) return { key: "minutes", values: { count: mins } };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { key: "hours", values: { count: hours } };
  return { key: "days", values: { count: Math.floor(hours / 24) } };
}
