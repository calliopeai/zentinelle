"use client";

import { useEffect, useMemo, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/zentinelle/v1";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GaugeIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  ShieldAlertIcon,
  CheckCircleIcon,
  ClockIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useRisks, useRiskStats, useIncidents } from "@/graphql/risks/hooks";

function riskIndexColor(index: number) {
  if (index <= 30) return "text-emerald-500";
  if (index <= 60) return "text-yellow-500";
  if (index <= 80) return "text-orange-500";
  return "text-red-500";
}

function riskIndexLabel(index: number) {
  if (index <= 30) return "Low";
  if (index <= 60) return "Moderate";
  if (index <= 80) return "High";
  return "Critical";
}

function riskIndexBg(index: number) {
  if (index <= 30) return "bg-emerald-500";
  if (index <= 60) return "bg-yellow-500";
  if (index <= 80) return "bg-orange-500";
  return "bg-red-500";
}

const CATEGORY_COLORS: Record<string, string> = {
  ai_safety: "#22d3ee",
  data_privacy: "#818cf8",
  compliance: "#34d399",
  operational: "#fbbf24",
  security: "#f87171",
  financial: "#f97316",
  reputational: "#a78bfa",
};

export default function RiskOverviewPage() {
  const { risks, loading: risksLoading } = useRisks();
  const { stats, loading: statsLoading } = useRiskStats();
  const { incidents, loading: incidentsLoading } = useIncidents();

  const loading = risksLoading || statsLoading || incidentsLoading;

  const riskIndex = useMemo(() => {
    if (!risks.length) return 0;
    const openRisks = risks.filter(
      (r: any) => r.status !== "closed" && r.status !== "accepted",
    );
    if (!openRisks.length) return 0;
    const totalScore = openRisks.reduce(
      (sum: number, r: any) => sum + (r.riskScore ?? 0),
      0,
    );
    const maxPossible = openRisks.length * 25;
    return Math.round((totalScore / maxPossible) * 100);
  }, [risks]);

  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    risks.forEach((r: any) => {
      const cat = r.category ?? "other";
      counts[cat] = (counts[cat] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [risks]);

  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    risks.forEach((r: any) => {
      counts[r.status ?? "open"] = (counts[r.status ?? "open"] ?? 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [risks]);

  const topRisks = useMemo(() => {
    return [...risks]
      .filter((r: any) => r.status !== "closed")
      .sort((a: any, b: any) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
      .slice(0, 5);
  }, [risks]);

  const mitigationRate = useMemo(() => {
    if (!risks.length) return 0;
    const withMitigation = risks.filter(
      (r: any) => r.mitigationPlan && r.mitigationPlan.trim().length > 0,
    ).length;
    return Math.round((withMitigation / risks.length) * 100);
  }, [risks]);

  // Fetch real risk index trend from backend (computed from risk register history)
  const [trendData, setTrendData] = useState<Array<{ day: string; index: number }>>(
    [],
  );

  useEffect(() => {
    fetch(`${API_URL}/risks/trend?days=30`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.trend) return;
        const points = data.trend.map((p: { day: string; index: number }) => ({
          day: p.day.slice(5, 10),
          index: p.index,
        }));
        setTrendData(points);
      })
      .catch(() => {});
  }, [risks.length]);

  const trendConfig: ChartConfig = {
    index: { label: "Risk Index", color: "#22d3ee" },
  };

  const categoryConfig: ChartConfig = {};
  categoryDistribution.forEach((item) => {
    categoryConfig[item.name] = {
      label: item.name.replace(/_/g, " "),
      color: CATEGORY_COLORS[item.name] ?? "#64748b",
    };
  });

  const statusConfig: ChartConfig = {
    count: { label: "Count", color: "#22d3ee" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-muted-foreground">Loading risk overview...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Risk Overview</h1>
        <p className="text-muted-foreground">
          Organizational risk posture and trends
        </p>
      </div>

      {/* Risk Index + Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1">
          <CardContent className="pt-6 text-center">
            <GaugeIcon className={`mx-auto h-8 w-8 ${riskIndexColor(riskIndex)}`} />
            <div className={`mt-2 text-5xl font-bold ${riskIndexColor(riskIndex)}`}>
              {riskIndex}
            </div>
            <div className="text-muted-foreground text-sm mt-1">Risk Index</div>
            <Badge className={`mt-2 ${riskIndexBg(riskIndex)} text-white border-0`}>
              {riskIndexLabel(riskIndex)}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ShieldAlertIcon className="mx-auto h-6 w-6 text-muted-foreground" />
            <div className="mt-2 text-3xl font-bold">{stats?.totalRisks ?? risks.length}</div>
            <div className="text-muted-foreground text-sm">Total Risks</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircleIcon className="mx-auto h-6 w-6 text-emerald-500" />
            <div className="mt-2 text-3xl font-bold">{mitigationRate}%</div>
            <div className="text-muted-foreground text-sm">With Mitigation Plans</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ClockIcon className="mx-auto h-6 w-6 text-muted-foreground" />
            <div className="mt-2 text-3xl font-bold">{incidents.length}</div>
            <div className="text-muted-foreground text-sm">Active Incidents</div>
          </CardContent>
        </Card>
      </div>

      {/* Trend + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Risk Index Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="h-[220px] w-full">
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  interval={4}
                  tickMargin={6}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="index"
                  stroke="#22d3ee"
                  fill="#22d3ee"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryDistribution.length > 0 ? (
              <ChartContainer config={categoryConfig} className="h-[220px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                  <Pie
                    data={categoryDistribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {categoryDistribution.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={CATEGORY_COLORS[entry.name] ?? "#64748b"}
                      />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-center py-8 text-sm">
                No risks to categorize
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status Bar + Top Risks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Risk by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusDistribution.length > 0 ? (
              <ChartContainer config={statusConfig} className="h-[200px] w-full">
                <BarChart data={statusDistribution} layout="vertical">
                  <XAxis type="number" />
                  <YAxis dataKey="status" type="category" width={80} tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="#22d3ee" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-center py-8 text-sm">
                No risks registered
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 Highest Risks</CardTitle>
            <CardDescription>Open risks ranked by score</CardDescription>
          </CardHeader>
          <CardContent>
            {topRisks.length > 0 ? (
              <div className="space-y-3">
                {topRisks.map((risk: any, i: number) => (
                  <div
                    key={risk.id}
                    className="flex items-center gap-3 rounded border p-3"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {risk.name}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {risk.category?.replace(/_/g, " ")} · {risk.status}
                      </div>
                    </div>
                    <Badge
                      className={
                        (risk.riskScore ?? 0) >= 16
                          ? "bg-red-500/10 text-red-500 border-red-500/20"
                          : (risk.riskScore ?? 0) >= 10
                            ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                            : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                      }
                    >
                      Score: {risk.riskScore ?? "?"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8 text-sm">
                No open risks — looking good!
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Progress bar for overall risk index */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Organizational Risk Index</span>
            <span className={`text-sm font-bold ${riskIndexColor(riskIndex)}`}>
              {riskIndex}/100
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${riskIndexBg(riskIndex)}`}
              style={{ width: `${riskIndex}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs mt-2">
            Based on {risks.filter((r: any) => r.status !== "closed").length} open risks.
            Lower is better. Target: below 30.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
