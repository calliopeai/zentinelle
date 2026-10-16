/**
 * Usage, as the screens read it: `GetUsageMetrics` (graphql/usage/queries.ts)
 * mapped to what the Overview draws. Server aggregates only; nothing here
 * fetches a list to sum it.
 */
import type { UsageMetricsData } from "@/graphql/usage/types";

export type Metrics = NonNullable<UsageMetricsData["usageMetrics"]>;

export const PERIODS = [
  { value: "1", label: "1d" },
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
] as const;

export type Period = (typeof PERIODS)[number]["value"];

/** The query variables for the last `period` days. */
export function periodRange(period: Period, now: Date = new Date()) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - Number(period));
  return { startDate: start.toISOString(), endDate: now.toISOString() };
}

export interface UsageDay {
  date: string;
  tokens: number;
  cost: number;
  apiCalls: number;
}

export interface UsageOverview {
  totals: {
    tokens: number | null;
    cost: number | null;
    requests: number | null;
    activeAgents: number | null;
  };
  /** Weighted by calls across the endpoints that measured it; null when none did. */
  avgLatencyMs: number | null;
  endpointsMeasured: number;
  days: UsageDay[];
  topAgents: { id: string; name: string; cost: number }[];
  slowEndpoints: { endpoint: string; avgLatencyMs: number }[];
}

const TOP = 5;

export function toUsageOverview(metrics: Metrics | null): UsageOverview | null {
  if (!metrics) return null;
  const endpoints = (metrics.byEndpoint ?? []).filter(
    (
      e,
    ): e is {
      endpoint: string;
      apiCalls: number | null;
      avgLatencyMs: number;
    } => Boolean(e.endpoint) && (e.avgLatencyMs ?? 0) > 0,
  );
  const calls = endpoints.reduce((s, e) => s + (e.apiCalls ?? 0), 0);
  const avgLatencyMs =
    endpoints.length === 0
      ? null
      : calls > 0
        ? endpoints.reduce(
            (s, e) => s + e.avgLatencyMs * (e.apiCalls ?? 0),
            0,
          ) / calls
        : endpoints.reduce((s, e) => s + e.avgLatencyMs, 0) / endpoints.length;
  return {
    totals: {
      tokens: metrics.summary?.totalTokens ?? null,
      cost: metrics.summary?.totalCost ?? null,
      requests: metrics.summary?.totalApiCalls ?? null,
      activeAgents: metrics.summary?.activeAgents ?? null,
    },
    avgLatencyMs,
    endpointsMeasured: endpoints.length,
    days: (metrics.timeSeries ?? [])
      .filter((p): p is typeof p & { date: string } => Boolean(p.date))
      .map((p) => ({
        date: p.date,
        tokens: p.tokens ?? 0,
        cost: p.cost ?? 0,
        apiCalls: p.apiCalls ?? 0,
      })),
    topAgents: (metrics.byAgent ?? [])
      .filter((a) => (a.cost ?? 0) > 0 && (a.agentId || a.agentName))
      .map((a) => ({
        id: (a.agentId ?? a.agentName) as string,
        name: (a.agentName ?? a.agentId) as string,
        cost: a.cost as number,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, TOP),
    slowEndpoints: endpoints
      .map((e) => ({ endpoint: e.endpoint, avgLatencyMs: e.avgLatencyMs }))
      .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
      .slice(0, TOP),
  };
}

/** True when the period recorded nothing at all: the empty state, not a page of zeros. */
export function isEmptyUsage(overview: UsageOverview): boolean {
  return (
    !overview.totals.requests &&
    !overview.totals.tokens &&
    overview.days.every((d) => d.apiCalls === 0 && d.tokens === 0)
  );
}
