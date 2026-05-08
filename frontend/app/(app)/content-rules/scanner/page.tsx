"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useContentScans, useContentViolations } from "@/graphql/content-scanner/hooks";
import type { ContentViolationData } from "@/graphql/content-scanner/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ScanSearchIcon,
  ScanLineIcon,
  ShieldAlertIcon,
  ShieldBanIcon,
  EraserIcon,
  SettingsIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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

/* ── Period helpers ─────────────────────────────────────────────── */

type Period = "1h" | "24h" | "7d" | "30d";

function getPeriodDates(period: Period) {
  const end = new Date();
  const start = new Date();
  switch (period) {
    case "1h":
      start.setHours(start.getHours() - 1);
      break;
    case "24h":
      start.setDate(start.getDate() - 1);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function periodLabel(period: Period) {
  switch (period) {
    case "1h":
      return "Last hour";
    case "24h":
      return "Last 24 hours";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
  }
}

/* ── Severity helpers ──────────────────────────────────────────── */

function severityVariant(severity: string) {
  switch (severity) {
    case "critical":
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    default:
      return "outline";
  }
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

const RULE_TYPE_LABELS: Record<string, string> = {
  secret_detection: "Secrets",
  pii_detection: "PII",
  prompt_injection: "Prompt Injection",
  jailbreak_detection: "Jailbreak",
  keyword_filter: "Keywords",
  regex_pattern: "Regex",
  custom: "Custom",
};

/* ── Main page ─────────────────────────────────────────────────── */

export default function ScannerDashboardPage() {
  const [period, setPeriod] = useState<Period>("24h");
  const dates = useMemo(() => getPeriodDates(period), [period]);

  const { scans, loading: scansLoading } = useContentScans({
    startDate: dates.startDate,
    endDate: dates.endDate,
  });

  const { violations, loading: violationsLoading } = useContentViolations({
    startDate: dates.startDate,
    endDate: dates.endDate,
  });

  const loading = scansLoading || violationsLoading;
  const hasData = violations.length > 0 || scans.length > 0;

  // Summary stats from real data only
  const totalScans = scans.length;
  const violationCount = violations.length;
  const blockedCount = violations.filter((v) => v.wasBlocked).length;
  const redactedCount = violations.filter((v) => v.wasRedacted).length;

  const timelineData = useMemo(
    () => buildTimelineFromViolations(violations),
    [violations],
  );

  // Violations by type
  const byType = useMemo(() => {
    const counts: Record<string, number> = {};
    violations.forEach((v) => {
      const label = RULE_TYPE_LABELS[v.ruleType] ?? v.ruleTypeDisplay ?? v.ruleType;
      counts[label] = (counts[label] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [violations]);

  // Violations by severity
  const bySeverity = useMemo(() => {
    const counts: Record<string, number> = {};
    violations.forEach((v) => {
      const sev = v.severity ?? "low";
      counts[sev] = (counts[sev] ?? 0) + 1;
    });
    return ["critical", "high", "medium", "low"]
      .filter((s) => counts[s])
      .map((severity) => ({
        name: severity,
        value: counts[severity],
      }));
  }, [violations]);

  // Chart configs
  const timelineConfig: ChartConfig = {
    critical: { label: "Critical", color: SEVERITY_COLORS.critical },
    high: { label: "High", color: SEVERITY_COLORS.high },
    medium: { label: "Medium", color: SEVERITY_COLORS.medium },
    low: { label: "Low", color: SEVERITY_COLORS.low },
  };

  const byTypeConfig: ChartConfig = {
    count: { label: "Violations", color: "#37efed" },
  };

  const donutConfig: ChartConfig = {
    critical: { label: "Critical", color: SEVERITY_COLORS.critical },
    high: { label: "High", color: SEVERITY_COLORS.high },
    medium: { label: "Medium", color: SEVERITY_COLORS.medium },
    low: { label: "Low", color: SEVERITY_COLORS.low },
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <Skeleton className="h-7 w-52" />
            <Skeleton className="mt-1 h-4 w-80" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[240px] w-full rounded-md" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Scans",
      value: totalScans,
      icon: ScanSearchIcon,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Violations Found",
      value: violationCount,
      icon: ShieldAlertIcon,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Blocked",
      value: blockedCount,
      icon: ShieldBanIcon,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
    },
    {
      label: "Redacted",
      value: redactedCount,
      icon: EraserIcon,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/10",
    },
  ];

  const recentViolations = [...violations]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Scanner Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Real-time content violation analytics and scanning metrics
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last hour</SelectItem>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!hasData ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-muted/50 mb-4 rounded-full p-4">
              <ScanLineIcon className="text-muted-foreground h-10 w-10" />
            </div>
            <h2 className="text-lg font-semibold">No content scans yet</h2>
            <p className="text-muted-foreground mt-2 max-w-md text-sm">
              Configure content rules to start scanning agent traffic for
              secrets, PII, prompt injection, and other policy violations.
              Results from the {periodLabel(period).toLowerCase()} will appear
              here once scanning is active.
            </p>
            <Button asChild className="mt-6">
              <Link href="/content-rules">
                <SettingsIcon className="mr-2 h-4 w-4" />
                Configure Content Rules
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map(({ label, value, icon: Icon, color, bg }) => (
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
                  <p className="text-muted-foreground mt-1 text-xs">
                    {periodLabel(period)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Violation timeline - full width */}
          <Card>
            <CardHeader>
              <CardTitle>Violation Timeline</CardTitle>
              <CardDescription>
                Violations over time by severity
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timelineData.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No violations in this period
                </p>
              ) : (
                <ChartContainer config={timelineConfig} className="h-[280px] w-full">
                  <AreaChart
                    data={timelineData}
                    margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      className="[&_.recharts-text]:fill-muted-foreground"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      width={32}
                      className="[&_.recharts-text]:fill-muted-foreground"
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area
                      type="monotone"
                      dataKey="critical"
                      stackId="1"
                      stroke={SEVERITY_COLORS.critical}
                      fill={SEVERITY_COLORS.critical}
                      fillOpacity={0.4}
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="high"
                      stackId="1"
                      stroke={SEVERITY_COLORS.high}
                      fill={SEVERITY_COLORS.high}
                      fillOpacity={0.3}
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="medium"
                      stackId="1"
                      stroke={SEVERITY_COLORS.medium}
                      fill={SEVERITY_COLORS.medium}
                      fillOpacity={0.3}
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="low"
                      stackId="1"
                      stroke={SEVERITY_COLORS.low}
                      fill={SEVERITY_COLORS.low}
                      fillOpacity={0.2}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Charts row */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Violations by type - horizontal bar */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Violations by Type</CardTitle>
                <CardDescription>
                  Distribution across content rule categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                {byType.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    No violations recorded
                  </p>
                ) : (
                  <ChartContainer config={byTypeConfig} className="h-[240px] w-full">
                    <BarChart
                      data={byType}
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
                        fill="#37efed"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Violations by severity - donut */}
            <Card>
              <CardHeader>
                <CardTitle>By Severity</CardTitle>
                <CardDescription>Severity breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {bySeverity.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    No violations recorded
                  </p>
                ) : (
                  <ChartContainer config={donutConfig} className="h-[240px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                      <Pie
                        data={bySeverity}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {bySeverity.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={SEVERITY_COLORS[entry.name] ?? "#a1a1aa"}
                          />
                        ))}
                      </Pie>
                      <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent violations table */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Violations</CardTitle>
              <CardDescription>
                Most recent content violations detected
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentViolations.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No violations in this period
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Matched Text</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentViolations.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">
                          {v.ruleName ?? "--"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {RULE_TYPE_LABELS[v.ruleType] ?? v.ruleTypeDisplay ?? v.ruleType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={severityVariant(v.severity)}>
                            {v.severityDisplay ?? v.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="text-muted-foreground block truncate font-mono text-xs">
                            {v.matchedText
                              ? v.matchedText.length > 40
                                ? `${v.matchedText.slice(0, 40)}...`
                                : v.matchedText
                              : "--"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {v.wasBlocked ? (
                            <Badge variant="destructive">Blocked</Badge>
                          ) : v.wasRedacted ? (
                            <Badge variant="secondary">Redacted</Badge>
                          ) : (
                            <Badge variant="outline">Logged</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatTimestamp(v.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ── Utility ───────────────────────────────────────────────────── */

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTimelineFromViolations(violations: ContentViolationData[]) {
  if (violations.length === 0) return [];

  const buckets = new Map<
    string,
    { time: string; critical: number; high: number; medium: number; low: number }
  >();

  violations.forEach((v) => {
    const d = new Date(v.createdAt);
    const key = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (!buckets.has(key)) {
      buckets.set(key, { time: key, critical: 0, high: 0, medium: 0, low: 0 });
    }
    const bucket = buckets.get(key)!;
    const sev = v.severity ?? "low";
    if (sev === "critical") bucket.critical += 1;
    else if (sev === "high") bucket.high += 1;
    else if (sev === "medium") bucket.medium += 1;
    else bucket.low += 1;
  });

  return Array.from(buckets.values());
}
