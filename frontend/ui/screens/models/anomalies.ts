/**
 * Anomalies over `GetUsageMetrics`: the rule the current page applies
 * (frontend/app/(app)/observability/anomalies), kept as a pure function so
 * the screen draws exactly what the detector saw. A day is anomalous when it
 * is more than two standard deviations above its trailing seven days; an
 * agent or endpoint when it is more than two above its peers.
 *
 * It runs in the browser over the server's daily and per-agent aggregates,
 * never over raw events. Nothing is stored: there is no anomaly record to
 * acknowledge or resolve until the backend keeps one.
 */
import type { TrendPoint } from "../../shared/TrendChart";
import { formatDay } from "../../shared/figures";
import type { Metrics } from "./usage";

export type AnomalyKind = "tokens" | "cost" | "agent_tokens" | "latency";
export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface Anomaly {
  id: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  /** What it is about: a day's total, an agent, an endpoint. */
  subject: string;
  /** The agent's id, when the subject is one, for a link to its usage. */
  agentId?: string;
  observed: number;
  expected: number;
  sigma: number;
  /** The day it covers, or the end of the period for peer comparisons. */
  at: string;
}

export const KIND_LABEL: Record<AnomalyKind, string> = {
  tokens: "Daily tokens",
  cost: "Daily cost",
  agent_tokens: "Agent tokens",
  latency: "Endpoint latency",
};

const TRAILING = 7;
const MIN_HISTORY = 3;
const MIN_PEERS = 4;

function meanStd(values: readonly number[]) {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

export function severityOf(sigma: number): AnomalySeverity {
  if (sigma >= 4) return "critical";
  if (sigma >= 3) return "high";
  if (sigma >= 2.5) return "medium";
  return "low";
}

function outlier(value: number, peers: readonly number[]) {
  const { mean, std } = meanStd(peers);
  if (std === 0 || value <= 0 || value <= mean + 2 * std) return null;
  return { expected: mean, sigma: (value - mean) / std };
}

export function detectAnomalies(metrics: Metrics | null, periodEnd: string) {
  if (!metrics) return [];
  const out: Anomaly[] = [];
  const days = (metrics.timeSeries ?? []).filter(
    (p): p is typeof p & { date: string } => Boolean(p.date),
  );
  if (days.length > MIN_HISTORY) {
    for (let i = MIN_HISTORY; i < days.length; i++) {
      const trailing = days.slice(Math.max(0, i - TRAILING), i);
      const day = days[i];
      for (const kind of ["tokens", "cost"] as const) {
        const value = day[kind] ?? 0;
        const hit = outlier(
          value,
          trailing.map((p) => p[kind] ?? 0),
        );
        if (hit) {
          out.push({
            id: `${kind}-${day.date}`,
            kind,
            severity: severityOf(hit.sigma),
            subject: "All agents",
            observed: value,
            ...hit,
            at: day.date,
          });
        }
      }
    }
  }
  const agents = (metrics.byAgent ?? []).filter((a) => (a.tokens ?? 0) > 0);
  if (agents.length >= MIN_PEERS) {
    const peers = agents.map((a) => a.tokens ?? 0);
    for (const a of agents) {
      const hit = outlier(a.tokens ?? 0, peers);
      if (hit) {
        out.push({
          id: `agent-${a.agentId ?? a.agentName}`,
          kind: "agent_tokens",
          severity: severityOf(hit.sigma),
          subject: a.agentName ?? a.agentId ?? "Unknown agent",
          agentId: a.agentId ?? undefined,
          observed: a.tokens ?? 0,
          ...hit,
          at: periodEnd,
        });
      }
    }
  }
  const endpoints = (metrics.byEndpoint ?? []).filter(
    (e) => (e.avgLatencyMs ?? 0) > 0,
  );
  if (endpoints.length >= MIN_PEERS) {
    const peers = endpoints.map((e) => e.avgLatencyMs ?? 0);
    for (const e of endpoints) {
      const hit = outlier(e.avgLatencyMs ?? 0, peers);
      if (hit) {
        out.push({
          id: `latency-${e.endpoint}`,
          kind: "latency",
          severity: severityOf(hit.sigma),
          subject: e.endpoint ?? "Unknown endpoint",
          observed: e.avgLatencyMs ?? 0,
          ...hit,
          at: periodEnd,
        });
      }
    }
  }
  return out.sort((a, b) => b.sigma - a.sigma);
}

/** Tokens per day against the band the detector used, with its detections marked. */
export function tokenBaseline(
  metrics: Metrics | null,
  locale = "en",
): TrendPoint[] {
  const days = (metrics?.timeSeries ?? []).filter(
    (p): p is typeof p & { date: string } => Boolean(p.date),
  );
  return days.map((day, i) => {
    const trailing = days
      .slice(Math.max(0, i - TRAILING), i)
      .map((p) => p.tokens ?? 0);
    const { mean, std } = meanStd(trailing);
    const value = day.tokens ?? 0;
    const banded = i >= MIN_HISTORY;
    return {
      label: formatDay(day.date, locale),
      value,
      band: banded
        ? { lower: Math.max(0, mean - 2 * std), upper: mean + 2 * std }
        : null,
      marked: banded && outlier(value, trailing) !== null,
    };
  });
}
