"use client";

import { useMemo, useState } from "react";
import { useUsageMetrics } from "@/graphql/usage/hooks";
import type { UsageTimeSeriesPoint, UsageByEndpoint } from "@/graphql/usage/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  CoinsIcon,
  ZapIcon,
  TimerIcon,
  ActivityIcon,
} from "lucide-react";

/* ── Time range options ──────────────────────────────────────────── */

const TIME_RANGES = [
  { label: "1d", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

function formatBucket(bucket: string | null) {
  if (!bucket) return "";
  const d = new Date(bucket);
  if (Number.isNaN(d.getTime())) return bucket;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ── Stat card helpers ───────────────────────────────────────────── */

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

function NoDataPlaceholder({ message }: { message: string }) {
  return (
    <p className="text-muted-foreground py-12 text-center text-sm">
      {message}
    </p>
  );
}

/* ── Chart configs ───────────────────────────────────────────────── */

const TEAL = "#37efed";

const tokenChartConfig: ChartConfig = {
  tokens: { label: "Tokens", color: TEAL },
};

const callsChartConfig: ChartConfig = {
  apiCalls: { label: "API Calls", color: "var(--color-chart-2)" },
};

const costChartConfig: ChartConfig = {
  cost: { label: "Cost ($)", color: TEAL },
};

const endpointLatencyConfig: ChartConfig = {
  avgLatencyMs: { label: "Avg latency (ms)", color: TEAL },
};

const agentCostConfig: ChartConfig = {
  cost: { label: "Cost ($)", color: "var(--color-chart-2)" },
};

/* ── Main page ───────────────────────────────────────────────────── */

export default function MonitoringPage() {
  const [selectedRange, setSelectedRange] = useState<number>(30);

  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - selectedRange);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [selectedRange]);

  const { metrics, loading } = useUsageMetrics({ startDate, endDate });

  const summary = metrics?.summary ?? null;
  const timeSeries: UsageTimeSeriesPoint[] = useMemo(
    () => metrics?.timeSeries ?? [],
    [metrics?.timeSeries],
  );
  const byAgent = useMemo(() => metrics?.byAgent ?? [], [metrics?.byAgent]);
  const byEndpoint: UsageByEndpoint[] = useMemo(
    () => metrics?.byEndpoint ?? [],
    [metrics?.byEndpoint],
  );

  // Token consumption — derived strictly from real time_series.tokens
  const tokenData = useMemo(
    () =>
      timeSeries.map((p) => ({
        bucket: formatBucket(p.date),
        tokens: p.tokens ?? 0,
      })),
    [timeSeries],
  );

  // API calls over time — derived strictly from real data
  const callsData = useMemo(
    () =>
      timeSeries.map((p) => ({
        bucket: formatBucket(p.date),
        apiCalls: p.apiCalls ?? 0,
      })),
    [timeSeries],
  );

  // Cost over time — real data only
  const costData = useMemo(
    () =>
      timeSeries.map((p) => ({
        bucket: formatBucket(p.date),
        cost: Number((p.cost ?? 0).toFixed(2)),
      })),
    [timeSeries],
  );

  // Per-endpoint latency — uses real avg_latency_ms aggregated by backend
  const endpointLatency = useMemo(
    () =>
      byEndpoint
        .filter((e) => e.endpoint && (e.avgLatencyMs ?? 0) > 0)
        .map((e) => ({
          endpoint: e.endpoint as string,
          avgLatencyMs: Math.round(e.avgLatencyMs ?? 0),
        }))
        .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
        .slice(0, 5),
    [byEndpoint],
  );

  // Top agents by cost — real data
  const topAgentsByCost = useMemo(
    () =>
      byAgent
        .filter((a) => (a.cost ?? 0) > 0)
        .map((a) => ({
          agent: a.agentName ?? a.agentId ?? "Unknown",
          cost: Number((a.cost ?? 0).toFixed(2)),
        }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5),
    [byAgent],
  );

  // Summary stat values — directly from backend summary, no fakes
  const totalTokens = summary?.totalTokens ?? 0;
  const totalCost = summary?.totalCost ?? 0;
  const totalRequests = summary?.totalApiCalls ?? 0;

  // Average latency: weighted average across endpoints, or null if not measured
  const avgLatency = useMemo(() => {
    if (byEndpoint.length === 0) return null;
    const sample = byEndpoint.filter((e) => (e.avgLatencyMs ?? 0) > 0);
    if (sample.length === 0) return null;
    const totalCalls = sample.reduce((s, e) => s + (e.apiCalls ?? 0), 0);
    if (totalCalls === 0) {
      // Plain mean fallback
      const sum = sample.reduce((s, e) => s + (e.avgLatencyMs ?? 0), 0);
      return Math.round(sum / sample.length);
    }
    const weighted = sample.reduce(
      (s, e) => s + (e.avgLatencyMs ?? 0) * (e.apiCalls ?? 0),
      0,
    );
    return Math.round(weighted / totalCalls);
  }, [byEndpoint]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-2 h-8 w-32" />
                <Skeleton className="h-3 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className={i === 0 ? "lg:col-span-2" : ""}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-56" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[240px] w-full rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Monitoring</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Usage analytics and activity monitoring across your organization
          </p>
        </div>
        {/* Time range selector */}
        <div className="bg-muted flex items-center rounded-lg p-0.5">
          {TIME_RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => setSelectedRange(range.days)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedRange === range.days
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Tokens"
          value={totalTokens.toLocaleString()}
          sub={`Last ${selectedRange}d`}
          icon={ActivityIcon}
          color="text-blue-600 dark:text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          label="Total Cost"
          value={`$${totalCost.toFixed(2)}`}
          sub={`Last ${selectedRange}d`}
          icon={CoinsIcon}
          color="text-emerald-600 dark:text-emerald-400"
          bg="bg-emerald-500/10"
        />
        <StatCard
          label="Avg Latency"
          value={avgLatency !== null ? `${avgLatency}ms` : "No data"}
          sub={
            avgLatency !== null
              ? `Across ${endpointLatency.length || byEndpoint.length} endpoint${
                  byEndpoint.length === 1 ? "" : "s"
                }`
              : "No latency measurements"
          }
          icon={TimerIcon}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-500/10"
        />
        <StatCard
          label="Total Requests"
          value={totalRequests.toLocaleString()}
          sub={`Last ${selectedRange}d`}
          icon={ZapIcon}
          color="text-violet-600 dark:text-violet-400"
          bg="bg-violet-500/10"
        />
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Token consumption area chart - full width */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Token Consumption</CardTitle>
            <CardDescription>
              Total tokens processed per day
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tokenData.length === 0 ? (
              <NoDataPlaceholder message="No token data available for this period" />
            ) : (
              <ChartContainer config={tokenChartConfig} className="h-[280px] w-full">
                <AreaChart data={tokenData} margin={{ left: 0, right: 0 }}>
                  <defs>
                    <linearGradient id="fillTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={TEAL} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) =>
                      v >= 1000000
                        ? `${(v / 1000000).toFixed(1)}M`
                        : v >= 1000
                          ? `${(v / 1000).toFixed(0)}k`
                          : String(v)
                    }
                  />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke={TEAL}
                    strokeWidth={2}
                    fill="url(#fillTokens)"
                    dot={false}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* API calls over time - line chart */}
        <Card>
          <CardHeader>
            <CardTitle>API Calls Over Time</CardTitle>
            <CardDescription>Daily request volume</CardDescription>
          </CardHeader>
          <CardContent>
            {callsData.length === 0 ? (
              <NoDataPlaceholder message="No API call data available" />
            ) : (
              <ChartContainer config={callsChartConfig} className="h-[240px] w-full">
                <LineChart data={callsData} margin={{ left: 0, right: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="apiCalls"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Cost over time - bar chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Over Time</CardTitle>
            <CardDescription>Daily spend across all providers</CardDescription>
          </CardHeader>
          <CardContent>
            {costData.length === 0 || costData.every((d) => d.cost === 0) ? (
              <NoDataPlaceholder message="No cost data available" />
            ) : (
              <ChartContainer config={costChartConfig} className="h-[240px] w-full">
                <BarChart data={costData} margin={{ left: 0, right: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `$${Number(value).toFixed(2)}`}
                      />
                    }
                  />
                  <Bar
                    dataKey="cost"
                    fill={TEAL}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Endpoint latency - horizontal bar (replaces fake percentile chart) */}
        <Card>
          <CardHeader>
            <CardTitle>Latency by Endpoint</CardTitle>
            <CardDescription>
              Average response latency per agent endpoint
            </CardDescription>
          </CardHeader>
          <CardContent>
            {endpointLatency.length === 0 ? (
              <NoDataPlaceholder message="No latency measurements available" />
            ) : (
              <ChartContainer
                config={endpointLatencyConfig}
                className="h-[240px] w-full"
              >
                <BarChart
                  data={endpointLatency}
                  layout="vertical"
                  margin={{ left: 0, right: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${v}ms`}
                  />
                  <YAxis
                    type="category"
                    dataKey="endpoint"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={130}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `${value}ms`}
                      />
                    }
                  />
                  <Bar
                    dataKey="avgLatencyMs"
                    fill={TEAL}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Top agents by cost - horizontal bar */}
        <Card>
          <CardHeader>
            <CardTitle>Top Agents by Cost</CardTitle>
            <CardDescription>Highest cost agent endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            {topAgentsByCost.length === 0 ? (
              <NoDataPlaceholder message="No agent cost data available" />
            ) : (
              <ChartContainer config={agentCostConfig} className="h-[240px] w-full">
                <BarChart
                  data={topAgentsByCost}
                  layout="vertical"
                  margin={{ left: 0, right: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="agent"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={120}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `$${Number(value).toFixed(2)}`}
                      />
                    }
                  />
                  <Bar
                    dataKey="cost"
                    fill="var(--color-chart-2)"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
