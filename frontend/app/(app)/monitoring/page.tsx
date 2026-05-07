"use client";

import { useAuditAnalytics } from "@/graphql/events/hooks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

function formatBucket(bucket: string | null) {
  if (!bucket) return "";
  const d = new Date(bucket);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MonitoringPage() {
  const { analytics, loading } = useAuditAnalytics({ days: 30 });

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
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

  const timelineBuckets = new Map<string, Record<string, string | number>>();
  (analytics?.timeline ?? []).forEach((point) => {
    const bucket = formatBucket(point.bucket);
    if (!bucket) return;
    if (!timelineBuckets.has(bucket)) {
      timelineBuckets.set(bucket, { bucket });
    }
    const entry = timelineBuckets.get(bucket)!;
    const key = point.eventType ?? "unknown";
    entry[key] = ((entry[key] as number) ?? 0) + (point.count ?? 0);
  });
  const timelineData = Array.from(timelineBuckets.values());

  const eventTypeKeys = [
    ...new Set(
      (analytics?.timeline ?? [])
        .map((p) => p.eventType ?? "unknown")
    ),
  ];

  const timelineConfig: ChartConfig = {};
  const chartColors = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];
  eventTypeKeys.forEach((key, i) => {
    timelineConfig[key] = {
      label: key,
      color: chartColors[i % chartColors.length],
    };
  });

  const byTypeData = (analytics?.byType ?? []).map((t) => ({
    type: t.eventType ?? "Unknown",
    count: t.count ?? 0,
  }));

  const byTypeConfig: ChartConfig = {
    count: { label: "Events", color: "var(--color-chart-1)" },
  };

  const topAgentsData = (analytics?.topAgents ?? []).map((a) => ({
    agent: a.agentId ?? "Unknown",
    events: a.eventCount ?? 0,
  }));

  const topAgentsConfig: ChartConfig = {
    events: { label: "Events", color: "var(--color-chart-2)" },
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Monitoring</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Usage analytics and activity monitoring across your organization
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Event Timeline</CardTitle>
            <CardDescription>Events over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {timelineData.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No timeline data available
              </p>
            ) : (
              <ChartContainer config={timelineConfig} className="h-[280px] w-full">
                <AreaChart data={timelineData} margin={{ left: 0, right: 0 }}>
                  <defs>
                    {eventTypeKeys.map((key, i) => (
                      <linearGradient
                        key={key}
                        id={`fill-${key}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={chartColors[i % chartColors.length]}
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="95%"
                          stopColor={chartColors[i % chartColors.length]}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="bucket"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {eventTypeKeys.map((key, i) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={chartColors[i % chartColors.length]}
                      strokeWidth={2}
                      fill={`url(#fill-${key})`}
                      dot={false}
                      stackId="1"
                    />
                  ))}
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Events by Type</CardTitle>
            <CardDescription>Distribution of event types</CardDescription>
          </CardHeader>
          <CardContent>
            {byTypeData.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No data available
              </p>
            ) : (
              <ChartContainer config={byTypeConfig} className="h-[240px] w-full">
                <BarChart
                  data={byTypeData}
                  layout="vertical"
                  margin={{ left: 0, right: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="type"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={120}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Agents by Activity</CardTitle>
            <CardDescription>Most active agent endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            {topAgentsData.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No agent data available
              </p>
            ) : (
              <ChartContainer config={topAgentsConfig} className="h-[240px] w-full">
                <BarChart
                  data={topAgentsData}
                  layout="vertical"
                  margin={{ left: 0, right: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="agent"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={120}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="events"
                    fill="var(--color-events)"
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
