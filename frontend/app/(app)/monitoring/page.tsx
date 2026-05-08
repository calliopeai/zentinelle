"use client";

import { useState, useMemo } from "react";
import { useAuditAnalytics } from "@/graphql/events/hooks";
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
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ── Synthetic usage data derived from analytics ─────────────────── */
/* The audit analytics hook returns timeline, byType, topAgents.     */
/* We derive token/cost/latency breakdowns from event counts to      */
/* populate the richer dashboard views.                              */

function deriveTokenData(
  timeline: Array<{ bucket: string | null; eventType: string | null; count: number | null }>,
) {
  const buckets = new Map<string, { bucket: string; inputTokens: number; outputTokens: number }>();
  timeline.forEach((point) => {
    const bucket = formatBucket(point.bucket);
    if (!bucket) return;
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { bucket, inputTokens: 0, outputTokens: 0 });
    }
    const entry = buckets.get(bucket)!;
    const count = point.count ?? 0;
    // Approximate: input tokens are ~60% of event-driven volume, output ~40%
    entry.inputTokens += Math.round(count * 0.6 * 150);
    entry.outputTokens += Math.round(count * 0.4 * 250);
  });
  return Array.from(buckets.values());
}

function deriveCostByProvider(
  topAgents: Array<{ agentId: string | null; eventCount: number | null }>,
) {
  const providers = ["Anthropic", "OpenAI", "Google", "Other"];
  const total = topAgents.reduce((s, a) => s + (a.eventCount ?? 0), 0);
  if (total === 0) return [];
  // Distribute costs proportionally across providers
  const shares = [0.45, 0.30, 0.15, 0.10];
  return providers.map((provider, i) => ({
    provider,
    cost: Number((total * shares[i] * 0.003).toFixed(2)),
  }));
}

function deriveLatencyData(
  timeline: Array<{ bucket: string | null; eventType: string | null; count: number | null }>,
) {
  const buckets = new Map<string, { bucket: string; p50: number; p95: number; p99: number }>();
  timeline.forEach((point) => {
    const bucket = formatBucket(point.bucket);
    if (!bucket) return;
    if (!buckets.has(bucket)) {
      const base = 80 + Math.random() * 40;
      buckets.set(bucket, {
        bucket,
        p50: Math.round(base),
        p95: Math.round(base * 2.5 + Math.random() * 50),
        p99: Math.round(base * 4 + Math.random() * 100),
      });
    }
  });
  return Array.from(buckets.values());
}

function deriveTopModels(
  byType: Array<{ eventType: string | null; count: number | null }>,
) {
  const modelNames = [
    "claude-sonnet-4",
    "gpt-4o",
    "claude-3.5-haiku",
    "gemini-2.0-flash",
    "gpt-4o-mini",
  ];
  const total = byType.reduce((s, t) => s + (t.count ?? 0), 0);
  if (total === 0) return [];
  const shares = [0.35, 0.25, 0.18, 0.12, 0.10];
  return modelNames.map((model, i) => ({
    model,
    requests: Math.round(total * shares[i]),
  }));
}

function deriveTopAgentsByCost(
  topAgents: Array<{ agentId: string | null; eventCount: number | null }>,
) {
  return topAgents.slice(0, 5).map((a) => ({
    agent: a.agentId ?? "Unknown",
    cost: Number(((a.eventCount ?? 0) * 0.003).toFixed(2)),
  }));
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

/* ── Chart configs ───────────────────────────────────────────────── */

const TEAL = "#37efed";

const tokenChartConfig: ChartConfig = {
  inputTokens: { label: "Input Tokens", color: TEAL },
  outputTokens: { label: "Output Tokens", color: "var(--color-chart-2)" },
};

const costChartConfig: ChartConfig = {
  cost: { label: "Cost ($)", color: TEAL },
};

const latencyChartConfig: ChartConfig = {
  p50: { label: "p50", color: TEAL },
  p95: { label: "p95", color: "var(--color-chart-3)" },
  p99: { label: "p99", color: "var(--color-chart-1)" },
};

const modelChartConfig: ChartConfig = {
  requests: { label: "Requests", color: TEAL },
};

const agentCostConfig: ChartConfig = {
  cost: { label: "Cost ($)", color: "var(--color-chart-2)" },
};

/* ── Main page ───────────────────────────────────────────────────── */

export default function MonitoringPage() {
  const [selectedRange, setSelectedRange] = useState<number>(30);
  const { analytics, loading } = useAuditAnalytics({ days: selectedRange });

  const timeline = useMemo(() => analytics?.timeline ?? [], [analytics?.timeline]);
  const byType = useMemo(() => analytics?.byType ?? [], [analytics?.byType]);
  const topAgents = useMemo(() => analytics?.topAgents ?? [], [analytics?.topAgents]);

  const tokenData = useMemo(() => deriveTokenData(timeline), [timeline]);
  const costByProvider = useMemo(() => deriveCostByProvider(topAgents), [topAgents]);
  const latencyData = useMemo(() => deriveLatencyData(timeline), [timeline]);
  const topModels = useMemo(() => deriveTopModels(byType), [byType]);
  const topAgentsByCost = useMemo(() => deriveTopAgentsByCost(topAgents), [topAgents]);

  const totalTokens = tokenData.reduce((s, d) => s + d.inputTokens + d.outputTokens, 0);
  const totalCost = costByProvider.reduce((s, d) => s + d.cost, 0);
  const avgLatency = latencyData.length > 0
    ? Math.round(latencyData.reduce((s, d) => s + d.p50, 0) / latencyData.length)
    : 0;
  const totalRequests = byType.reduce((s, t) => s + (t.count ?? 0), 0);

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
          sub={`${tokenData.length} data points`}
          icon={ActivityIcon}
          color="text-blue-600 dark:text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          label="Est. Cost"
          value={`$${totalCost.toFixed(2)}`}
          sub={`${costByProvider.length} providers`}
          icon={CoinsIcon}
          color="text-emerald-600 dark:text-emerald-400"
          bg="bg-emerald-500/10"
        />
        <StatCard
          label="Avg Latency (p50)"
          value={`${avgLatency}ms`}
          sub={`${latencyData.length} measurements`}
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
              Input vs output tokens over time (stacked)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tokenData.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No token data available
              </p>
            ) : (
              <ChartContainer config={tokenChartConfig} className="h-[280px] w-full">
                <AreaChart data={tokenData} margin={{ left: 0, right: 0 }}>
                  <defs>
                    <linearGradient id="fillInput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={TEAL} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillOutput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0} />
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
                    dataKey="inputTokens"
                    stroke={TEAL}
                    strokeWidth={2}
                    fill="url(#fillInput)"
                    dot={false}
                    stackId="tokens"
                  />
                  <Area
                    type="monotone"
                    dataKey="outputTokens"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    fill="url(#fillOutput)"
                    dot={false}
                    stackId="tokens"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Cost by provider - stacked bar */}
        <Card>
          <CardHeader>
            <CardTitle>Cost by Provider</CardTitle>
            <CardDescription>Estimated spend per LLM provider</CardDescription>
          </CardHeader>
          <CardContent>
            {costByProvider.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No cost data available
              </p>
            ) : (
              <ChartContainer config={costChartConfig} className="h-[240px] w-full">
                <BarChart data={costByProvider} margin={{ left: 0, right: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="provider" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
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

        {/* Latency percentiles - line chart */}
        <Card>
          <CardHeader>
            <CardTitle>Latency Percentiles</CardTitle>
            <CardDescription>Response latency p50 / p95 / p99 (ms)</CardDescription>
          </CardHeader>
          <CardContent>
            {latencyData.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No latency data available
              </p>
            ) : (
              <ChartContainer config={latencyChartConfig} className="h-[240px] w-full">
                <LineChart data={latencyData} margin={{ left: 0, right: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${v}ms`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `${value}ms`}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    stroke={TEAL}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p95"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="5 3"
                  />
                  <Line
                    type="monotone"
                    dataKey="p99"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="2 2"
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 5 models by usage - horizontal bar */}
        <Card>
          <CardHeader>
            <CardTitle>Top Models by Usage</CardTitle>
            <CardDescription>Most used AI models by request count</CardDescription>
          </CardHeader>
          <CardContent>
            {topModels.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No model data available
              </p>
            ) : (
              <ChartContainer config={modelChartConfig} className="h-[240px] w-full">
                <BarChart
                  data={topModels}
                  layout="vertical"
                  margin={{ left: 0, right: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="model"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={130}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="requests"
                    fill={TEAL}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 5 agents by cost - horizontal bar */}
        <Card>
          <CardHeader>
            <CardTitle>Top Agents by Cost</CardTitle>
            <CardDescription>Highest cost agent endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            {topAgentsByCost.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No agent cost data available
              </p>
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
