"use client";

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
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
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

export default function DashboardPage() {
  const { stats, loading } = useDashboardStats();

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
      </div>
    );
  }

  const agents = stats?.agents;
  const policies = stats?.policies;
  const usage = stats?.apiUsage;

  const statCards = [
    {
      label: "Agents",
      value: agents?.total ?? 0,
      sub: `${agents?.active ?? 0} active, ${agents?.healthy ?? 0} healthy`,
      icon: ShieldIcon,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Policies",
      value: policies?.total ?? 0,
      sub: `${policies?.enabled ?? 0} enabled`,
      icon: FileTextIcon,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/10",
    },
    {
      label: "API Calls Today",
      value: usage?.today ?? 0,
      sub: `${usage?.thisWeek ?? 0} this week`,
      icon: ActivityIcon,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, sub, icon: Icon, color, bg }) => (
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
              <p className="text-muted-foreground mt-1 text-xs">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
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
                {stats?.recentActivity?.slice(0, 8).map((activity) => (
                  <div
                    key={activity.id ?? activity.timestamp}
                    className="flex items-start gap-3"
                  >
                    <div className="bg-muted mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                      {activity.type === "agent_registered" ? (
                        <BotIcon className="h-3.5 w-3.5" />
                      ) : activity.type === "policy_violation" ? (
                        <AlertTriangleIcon className="h-3.5 w-3.5" />
                      ) : activity.type === "health_check" ? (
                        <HeartPulseIcon className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                      )}
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
      </div>

      {(stats?.alerts?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Alerts</CardTitle>
            <CardDescription>Alerts requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
