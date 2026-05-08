"use client";

import { useMemo, useState } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  CoinsIcon,
  EyeIcon,
  ShieldAlertIcon,
  TimerIcon,
  ZapIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useUsageMetrics } from "@/graphql/usage/hooks";

/* ── Types ───────────────────────────────────────────────────────── */

type AnomalyType =
  | "token_spike"
  | "cost_anomaly"
  | "error_rate"
  | "latency_spike"
  | "policy_violations";

type AnomalySeverity = "low" | "medium" | "high" | "critical";

type AnomalyStatus = "open" | "acknowledged" | "resolved";

interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  agent: string;
  description: string;
  detectedAt: string;
  status: AnomalyStatus;
  metric?: {
    label: string;
    actual: number;
    expected: number;
    sigma: number;
  };
}

const TYPE_META: Record<
  AnomalyType,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
> = {
  token_spike: {
    label: "Token usage spike",
    icon: ActivityIcon,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
  cost_anomaly: {
    label: "Unusual cost pattern",
    icon: CoinsIcon,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  error_rate: {
    label: "Error rate increase",
    icon: ShieldAlertIcon,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
  },
  latency_spike: {
    label: "Latency spike",
    icon: TimerIcon,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  policy_violations: {
    label: "Blocked policy violations spike",
    icon: AlertTriangleIcon,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10",
  },
};

/* ── Statistics helpers ─────────────────────────────────────────── */

function meanAndStddev(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function severityFromSigma(sigma: number): AnomalySeverity {
  if (sigma >= 4) return "critical";
  if (sigma >= 3) return "high";
  if (sigma >= 2.5) return "medium";
  return "low";
}

function severityVariant(
  severity: AnomalySeverity,
): "default" | "secondary" | "destructive" | "outline" {
  switch (severity) {
    case "critical":
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
  }
}

function statusVariant(
  status: AnomalyStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "open":
      return "destructive";
    case "acknowledged":
      return "secondary";
    case "resolved":
      return "default";
  }
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(n % 1 === 0 ? 0 : 2);
}

/* ── Stat card ───────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
        <div className={`${bg} rounded-md p-1.5`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{sub}</p>
      </CardContent>
    </Card>
  );
}

/* ── Anomaly card ───────────────────────────────────────────────── */

function AnomalyCard({
  anomaly,
  onAcknowledge,
  onResolve,
}: {
  anomaly: Anomaly;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const meta = TYPE_META[anomaly.type];
  const Icon = meta.icon;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`${meta.bg} shrink-0 rounded-md p-2`}>
            <Icon className={`h-5 w-5 ${meta.color}`} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{meta.label}</h3>
              <Badge variant={severityVariant(anomaly.severity)}>
                {anomaly.severity}
              </Badge>
              <Badge variant={statusVariant(anomaly.status)}>
                {anomaly.status}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {anomaly.description}
            </p>
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>
                <span className="font-medium">Agent:</span> {anomaly.agent}
              </span>
              <span>
                <span className="font-medium">Detected:</span>{" "}
                {formatTimestamp(anomaly.detectedAt)}
              </span>
              {anomaly.metric && (
                <>
                  <span>
                    <span className="font-medium">{anomaly.metric.label}:</span>{" "}
                    {formatNumber(anomaly.metric.actual)} (expected ~
                    {formatNumber(anomaly.metric.expected)})
                  </span>
                  <span>
                    <span className="font-medium">σ:</span>{" "}
                    {anomaly.metric.sigma.toFixed(1)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {anomaly.status === "open" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAcknowledge(anomaly.id)}
              >
                <EyeIcon className="mr-1 h-3.5 w-3.5" />
                Acknowledge
              </Button>
            )}
            {anomaly.status !== "resolved" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onResolve(anomaly.id)}
              >
                <CheckCircle2Icon className="mr-1 h-3.5 w-3.5" />
                Resolve
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export default function AnomaliesPage() {
  // Pull last 30 days of usage data — gives us enough history to compute
  // mean + stddev for the 2σ detection rule.
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, []);

  const { metrics, loading, error } = useUsageMetrics({ startDate, endDate });

  /**
   * Local override map — since there is no backend for anomalies yet, status
   * changes (acknowledge / resolve) live only in component state. The
   * underlying detected anomalies are recomputed from usage data.
   */
  const [overrides, setOverrides] = useState<Record<string, AnomalyStatus>>({});

  const detected: Anomaly[] = useMemo(() => {
    if (!metrics) return [];

    const out: Anomaly[] = [];

    /* ── 1. Day-level token & cost spikes (vs trailing window) ── */
    const series = (metrics.timeSeries ?? []).filter(
      (p): p is { date: string; tokens: number | null; cost: number | null; apiCalls: number | null } =>
        Boolean(p.date),
    );

    if (series.length >= 4) {
      // For each day starting at index 4, compare against the trailing window.
      for (let i = 3; i < series.length; i++) {
        const trailing = series.slice(Math.max(0, i - 7), i);
        const tokenVals = trailing.map((p) => p.tokens ?? 0);
        const costVals = trailing.map((p) => p.cost ?? 0);
        const today = series[i];
        const todayDate = today.date as string;

        // Token spike
        const { mean: tMean, std: tStd } = meanAndStddev(tokenVals);
        const tToday = today.tokens ?? 0;
        if (tStd > 0 && tToday > tMean + 2 * tStd && tToday > 0) {
          const sigma = (tToday - tMean) / tStd;
          out.push({
            id: `token-${todayDate}`,
            type: "token_spike",
            severity: severityFromSigma(sigma),
            agent: "All agents (aggregate)",
            description: `Daily token consumption was ${formatNumber(tToday)}, well above the ${formatNumber(tMean)} trailing-7d mean.`,
            detectedAt: todayDate,
            status: "open",
            metric: {
              label: "Tokens",
              actual: tToday,
              expected: tMean,
              sigma,
            },
          });
        }

        // Cost spike
        const { mean: cMean, std: cStd } = meanAndStddev(costVals);
        const cToday = today.cost ?? 0;
        if (cStd > 0 && cToday > cMean + 2 * cStd && cToday > 0) {
          const sigma = (cToday - cMean) / cStd;
          out.push({
            id: `cost-${todayDate}`,
            type: "cost_anomaly",
            severity: severityFromSigma(sigma),
            agent: "All agents (aggregate)",
            description: `Daily spend hit $${cToday.toFixed(2)}, well above the $${cMean.toFixed(2)} trailing-7d mean.`,
            detectedAt: todayDate,
            status: "open",
            metric: {
              label: "Cost",
              actual: cToday,
              expected: cMean,
              sigma,
            },
          });
        }
      }
    }

    /* ── 2. Per-agent outliers (vs peer mean) ── */
    const byAgent = (metrics.byAgent ?? []).filter(
      (a) => (a.tokens ?? 0) > 0,
    );
    if (byAgent.length >= 4) {
      const tokenVals = byAgent.map((a) => a.tokens ?? 0);
      const { mean, std } = meanAndStddev(tokenVals);
      if (std > 0) {
        const detectedAt = endDate;
        for (const a of byAgent) {
          const tokens = a.tokens ?? 0;
          if (tokens > mean + 2 * std) {
            const sigma = (tokens - mean) / std;
            out.push({
              id: `agent-tokens-${a.agentId ?? a.agentName ?? "unknown"}`,
              type: "token_spike",
              severity: severityFromSigma(sigma),
              agent: a.agentName ?? a.agentId ?? "Unknown agent",
              description: `Agent token usage of ${formatNumber(tokens)} is ${sigma.toFixed(1)}σ above the cross-agent mean (${formatNumber(mean)}).`,
              detectedAt,
              status: "open",
              metric: {
                label: "Tokens",
                actual: tokens,
                expected: mean,
                sigma,
              },
            });
          }
        }
      }
    }

    /* ── 3. Endpoint latency outliers ── */
    const byEndpoint = (metrics.byEndpoint ?? []).filter(
      (e) => (e.avgLatencyMs ?? 0) > 0,
    );
    if (byEndpoint.length >= 4) {
      const latVals = byEndpoint.map((e) => e.avgLatencyMs ?? 0);
      const { mean, std } = meanAndStddev(latVals);
      if (std > 0) {
        const detectedAt = endDate;
        for (const e of byEndpoint) {
          const lat = e.avgLatencyMs ?? 0;
          if (lat > mean + 2 * std) {
            const sigma = (lat - mean) / std;
            out.push({
              id: `latency-${e.endpoint ?? "unknown"}`,
              type: "latency_spike",
              severity: severityFromSigma(sigma),
              agent: e.endpoint ?? "Unknown endpoint",
              description: `Endpoint average latency of ${Math.round(lat)}ms is ${sigma.toFixed(1)}σ above the typical ${Math.round(mean)}ms.`,
              detectedAt,
              status: "open",
              metric: {
                label: "Latency (ms)",
                actual: lat,
                expected: mean,
                sigma,
              },
            });
          }
        }
      }
    }

    return out;
  }, [metrics, endDate]);

  // Apply overrides for status changes
  const anomalies: Anomaly[] = useMemo(
    () =>
      detected.map((a) =>
        overrides[a.id] ? { ...a, status: overrides[a.id] } : a,
      ),
    [detected, overrides],
  );

  /* ── Window stats ──────────────────────────────────────────────── */

  // Anchor the window to endDate (which itself is anchored at mount via
  // useMemo), keeping this computation pure.
  const counts = useMemo(() => {
    const now = new Date(endDate).getTime();
    const day = 24 * 60 * 60 * 1000;
    const within = (a: Anomaly, ms: number) =>
      now - new Date(a.detectedAt).getTime() <= ms;
    return {
      d1: anomalies.filter((a) => within(a, day)).length,
      d7: anomalies.filter((a) => within(a, 7 * day)).length,
      d30: anomalies.filter((a) => within(a, 30 * day)).length,
    };
  }, [anomalies, endDate]);

  const topTypes = useMemo(() => {
    const m = new Map<AnomalyType, number>();
    for (const a of anomalies) {
      m.set(a.type, (m.get(a.type) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [anomalies]);

  const sortedAnomalies = useMemo(
    () =>
      [...anomalies].sort(
        (a, b) =>
          new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
      ),
    [anomalies],
  );

  const handleAcknowledge = (id: string) =>
    setOverrides((prev) => ({ ...prev, [id]: "acknowledged" }));
  const handleResolve = (id: string) =>
    setOverrides((prev) => ({ ...prev, [id]: "resolved" }));

  /* ── Render ────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-2 h-8 w-20" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Anomaly Detection</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Statistical outliers in usage, cost, and latency. Detected client-side
          using a 2σ threshold on a trailing 7-day window.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          Failed to load usage metrics. Anomalies cannot be computed.
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Detected (24h)"
          value={String(counts.d1)}
          sub="In the last day"
          icon={AlertTriangleIcon}
          color="text-red-600 dark:text-red-400"
          bg="bg-red-500/10"
        />
        <StatCard
          label="Detected (7d)"
          value={String(counts.d7)}
          sub="In the last week"
          icon={ZapIcon}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-500/10"
        />
        <StatCard
          label="Detected (30d)"
          value={String(counts.d30)}
          sub="In the last 30 days"
          icon={ActivityIcon}
          color="text-blue-600 dark:text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          label="Open"
          value={String(
            anomalies.filter((a) => a.status === "open").length,
          )}
          sub="Awaiting acknowledgement"
          icon={ShieldAlertIcon}
          color="text-violet-600 dark:text-violet-400"
          bg="bg-violet-500/10"
        />
      </div>

      {/* Top anomaly types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top anomaly types</CardTitle>
          <CardDescription>
            Distribution of detections across categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topTypes.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No anomalies detected in the current window.
            </p>
          ) : (
            <div className="space-y-2">
              {topTypes.map(([type, count]) => {
                const meta = TYPE_META[type];
                const Icon = meta.icon;
                const max = topTypes[0][1];
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <div
                      className={`${meta.bg} shrink-0 rounded-md p-1.5`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium">{meta.label}</span>
                        <span className="text-muted-foreground">
                          {count} detection{count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Anomaly list */}
      <div>
        <h2 className="mb-3 text-base font-semibold">Detected anomalies</h2>
        {sortedAnomalies.length === 0 ? (
          <Card className="flex min-h-[200px] items-center justify-center">
            <CardContent className="flex flex-col items-center text-center">
              <CheckCircle2Icon className="text-muted-foreground h-10 w-10" />
              <p className="mt-3 text-sm font-medium">No anomalies detected</p>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Usage, cost, and latency metrics are within expected ranges
                across the trailing 30-day window.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedAnomalies.map((a) => (
              <AnomalyCard
                key={a.id}
                anomaly={a}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
