"use client";

import { useMemo } from "react";
import { useDashboardStats } from "@/graphql/dashboard/hooks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldIcon,
  FileTextIcon,
  ActivityIcon,
  AlertTriangleIcon,
  BotIcon,
  HeartPulseIcon,
  CheckCircleIcon,
  ClockIcon,
  ShieldAlertIcon,
  TrendingUpIcon,
  TrendingDownIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
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

function formatTimestamp(ts: string | null) {
  if (!ts) return "--";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function severityVariant(severity: string | null) {
  switch (severity?.toLowerCase()) {
    case "critical":
      return "destructive";
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    default:
      return "outline";
  }
}

/* ── Activity icon mapper ────────────────────────────────────────── */

function activityIcon(type: string | null) {
  switch (type) {
    case "agent_registered":
      return { Icon: BotIcon, bg: "bg-blue-500/15", fg: "text-blue-600 dark:text-blue-400" };
    case "policy_violation":
      return { Icon: ShieldAlertIcon, bg: "bg-red-500/15", fg: "text-red-600 dark:text-red-400" };
    case "health_check":
      return { Icon: HeartPulseIcon, bg: "bg-emerald-500/15", fg: "text-emerald-600 dark:text-emerald-400" };
    case "policy_created":
    case "policy_updated":
      return { Icon: FileTextIcon, bg: "bg-violet-500/15", fg: "text-violet-600 dark:text-violet-400" };
    case "alert":
      return { Icon: AlertTriangleIcon, bg: "bg-amber-500/15", fg: "text-amber-600 dark:text-amber-400" };
    default:
      return { Icon: CheckCircleIcon, bg: "bg-muted", fg: "text-muted-foreground" };
  }
}

/* ── Mini sparkline for stat cards ───────────────────────────────── */

function MiniSparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  const sparkData = data.map((v, i) => ({ i, v }));
  const config: ChartConfig = { v: { label: "Value", color } };

  return (
    <ChartContainer config={config} className="h-[32px] w-full">
      <LineChart data={sparkData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

/* ── Agent health donut ──────────────────────────────────────────── */

function AgentHealthDonut({
  healthy,
  unhealthy,
  inactive,
}: {
  healthy: number;
  unhealthy: number;
  inactive: number;
}) {
  const data = [
    { name: "healthy", value: healthy },
    { name: "unhealthy", value: unhealthy },
    { name: "inactive", value: inactive },
  ].filter((d) => d.value > 0);

  const colors: Record<string, string> = {
    healthy: "#22c55e",
    unhealthy: "#ef4444",
    inactive: "#a1a1aa",
  };

  const config: ChartConfig = {
    healthy: { label: "Healthy", color: colors.healthy },
    unhealthy: { label: "Unhealthy", color: colors.unhealthy },
    inactive: { label: "Inactive", color: colors.inactive },
  };

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No agents registered
      </p>
    );
  }

  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={45}
          outerRadius={70}
          paddingAngle={3}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={colors[entry.name]} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export default function DashboardPage() {
  const { stats, loading } = useDashboardStats();

  // Real 7-day API call series from backend; agents/policies/alerts are
  // current-state counts so we just show the latest value as a flat line.
  const sparklines = useMemo(() => {
    const apiSeries = stats?.apiUsage?.last7Days ?? [];
    const agentTotal = stats?.agents?.total ?? 0;
    const policyTotal = stats?.policies?.total ?? 0;
    const alertCount = stats?.alerts?.length ?? 0;

    return {
      agents: Array(7).fill(agentTotal),
      policies: Array(7).fill(policyTotal),
      apiCalls: apiSeries.length === 7 ? apiSeries : Array(7).fill(stats?.apiUsage?.today ?? 0),
      alerts: Array(7).fill(alertCount),
    };
  }, [stats]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
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
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[240px] w-full rounded-md" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full rounded-md" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const agents = stats?.agents;
  const policies = stats?.policies;
  const usage = stats?.apiUsage;

  const trendPercent = usage?.trend ?? 0;
  const TrendIcon = trendPercent >= 0 ? TrendingUpIcon : TrendingDownIcon;
  const trendColor = trendPercent >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  const statCards = [
    {
      label: "Agents",
      value: agents?.total ?? 0,
      sub: `${agents?.active ?? 0} active, ${agents?.healthy ?? 0} healthy`,
      icon: ShieldIcon,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
      sparkColor: "#3b82f6",
      sparkData: sparklines.agents,
    },
    {
      label: "Policies",
      value: policies?.total ?? 0,
      sub: `${policies?.enabled ?? 0} enabled`,
      icon: FileTextIcon,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/10",
      sparkColor: "#8b5cf6",
      sparkData: sparklines.policies,
    },
    {
      label: "API Calls Today",
      value: usage?.today ?? 0,
      sub: (
        <span className="flex items-center gap-1">
          <TrendIcon className={`h-3 w-3 ${trendColor}`} />
          <span className={trendColor}>
            {trendPercent >= 0 ? "+" : ""}{trendPercent}%
          </span>
          <span className="text-muted-foreground ml-0.5">vs last week</span>
        </span>
      ),
      icon: ActivityIcon,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      sparkColor: "#22c55e",
      sparkData: sparklines.apiCalls,
    },
    {
      label: "Active Alerts",
      value: stats?.alerts?.length ?? 0,
      sub: stats?.alerts?.length
        ? `${stats.alerts.filter((a) => a.severity === "critical").length} critical`
        : "No active alerts",
      icon: AlertTriangleIcon,
      color:
        (stats?.alerts?.length ?? 0) > 0
          ? "text-red-600 dark:text-red-400"
          : "text-emerald-600 dark:text-emerald-400",
      bg:
        (stats?.alerts?.length ?? 0) > 0
          ? "bg-red-500/10"
          : "bg-emerald-500/10",
      sparkColor: (stats?.alerts?.length ?? 0) > 0 ? "#ef4444" : "#22c55e",
      sparkData: sparklines.alerts,
    },
  ];

  const policyByTypeData = (policies?.byType ?? []).map((p) => ({
    type: p.type ?? "Unknown",
    count: p.count,
  }));

  const policyChartConfig: ChartConfig = {
    count: { label: "Policies", color: "var(--color-chart-1)" },
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Stat cards with sparklines */}
      <div data-tour="dashboard-stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, sub, icon: Icon, color, bg, sparkColor, sparkData }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {label}
              </CardTitle>
              <div className={`${bg} rounded-md p-1.5`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value.toLocaleString()}</p>
              <div className="text-muted-foreground mt-1 text-xs">
                {typeof sub === "string" ? <p>{sub}</p> : sub}
              </div>
              <div className="mt-2">
                <MiniSparkline data={sparkData} color={sparkColor} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent activity with typed icons */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest events across your organization</CardDescription>
          </CardHeader>
          <CardContent>
            {(stats?.recentActivity?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No recent activity
              </p>
            ) : (
              <div className="space-y-3">
                {stats?.recentActivity?.slice(0, 8).map((activity) => {
                  const { Icon, bg: iconBg, fg: iconFg } = activityIcon(activity.type);
                  return (
                    <div
                      key={activity.id ?? activity.timestamp}
                      className="flex items-start gap-3"
                    >
                      <div
                        className={`${iconBg} mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${iconFg}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{activity.description}</p>
                        <div className="text-muted-foreground flex items-center gap-2 text-xs">
                          {activity.actor && <span>{activity.actor}</span>}
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            {formatTimestamp(activity.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent health donut */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Health</CardTitle>
            <CardDescription>Health distribution across agents</CardDescription>
          </CardHeader>
          <CardContent>
            <AgentHealthDonut
              healthy={agents?.healthy ?? 0}
              unhealthy={agents?.unhealthy ?? 0}
              inactive={(agents?.total ?? 0) - (agents?.active ?? 0)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Policies by type */}
        <Card>
          <CardHeader>
            <CardTitle>Policies by Type</CardTitle>
            <CardDescription>Distribution of policy types</CardDescription>
          </CardHeader>
          <CardContent>
            {policyByTypeData.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No policies configured
              </p>
            ) : (
              <ChartContainer config={policyChartConfig} className="h-[240px] w-full">
                <BarChart data={policyByTypeData} layout="vertical" margin={{ left: 0, right: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="type"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={100}
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

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
            <CardDescription>
              {(stats?.alerts?.length ?? 0) === 0
                ? "No active alerts"
                : `${stats?.alerts?.length} alert${(stats?.alerts?.length ?? 0) !== 1 ? "s" : ""} requiring attention`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(stats?.alerts?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <CheckCircleIcon className="text-emerald-500 mb-2 h-8 w-8" />
                <p className="text-muted-foreground text-sm">All clear</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats?.alerts?.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={severityVariant(alert.severity)}>
                          {alert.severity}
                        </Badge>
                        <span className="truncate text-sm font-medium">{alert.title}</span>
                      </div>
                      {alert.description && (
                        <p className="text-muted-foreground mt-1 text-sm">
                          {alert.description}
                        </p>
                      )}
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatTimestamp(alert.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
