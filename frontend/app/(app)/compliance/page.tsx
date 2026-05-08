"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { toast } from "sonner";
import { useComplianceOverview } from "@/graphql/compliance/hooks";
import { RUN_COMPLIANCE_CHECK } from "@/graphql/compliance/mutations";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircleIcon, XCircleIcon, ShieldCheckIcon, ToggleLeftIcon, ToggleRightIcon, RefreshCwIcon } from "lucide-react";

const TOGGLE_FRAMEWORK = gql`
  mutation ToggleFramework($frameworkId: String!) {
    toggleFramework(frameworkId: $frameworkId) {
      success
      enabled
      frameworkId
    }
  }
`;
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

function coverageColor(percentage: number) {
  if (percentage >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (percentage >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function coverageBg(percentage: number) {
  if (percentage >= 80) return "bg-emerald-500";
  if (percentage >= 50) return "bg-amber-500";
  return "bg-red-500";
}

export default function CompliancePage() {
  const { overview, loading } = useComplianceOverview();

  const frameworks = useMemo(
    () => overview?.frameworkCoverage ?? [],
    [overview?.frameworkCoverage]
  );

  const radarData = useMemo(
    () =>
      frameworks.map((fw) => ({
        framework: fw.name ?? "Unknown",
        coverage: Math.round(fw.requiredPercentage),
        fullMark: 100,
      })),
    [frameworks]
  );

  const radarConfig: ChartConfig = {
    coverage: { label: "Coverage %", color: "#37efed" },
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <Skeleton className="h-[320px] w-full rounded-md" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const [enabledFrameworks, setEnabledFrameworks] = useState<Set<string>>(
    new Set(frameworks.map((fw) => fw.id)),
  );
  const [toggleFramework] = useMutation(TOGGLE_FRAMEWORK);
  const [runCheck, { loading: running }] = useMutation(RUN_COMPLIANCE_CHECK);

  const handleRunCheck = async () => {
    try {
      const result: any = await runCheck();
      if (result?.data?.runComplianceCheck?.success) {
        toast.success(
          `Created ${result.data.runComplianceCheck.assessmentsCreated} assessments`,
        );
      } else {
        toast.error(
          result?.data?.runComplianceCheck?.errors?.[0] ?? "Check failed",
        );
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to run compliance check");
    }
  };

  const handleToggleFramework = async (frameworkId: string) => {
    const newEnabled = new Set(enabledFrameworks);
    if (newEnabled.has(frameworkId)) {
      newEnabled.delete(frameworkId);
    } else {
      newEnabled.add(frameworkId);
    }
    setEnabledFrameworks(newEnabled);
    try {
      await toggleFramework({ variables: { frameworkId } });
      toast.success(`Framework ${newEnabled.has(frameworkId) ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update framework");
    }
  };

  const activeFrameworks = frameworks.filter((fw) => enabledFrameworks.has(fw.id));
  const activeRadarData = radarData.filter((d) =>
    activeFrameworks.some((fw) => fw.name === d.framework),
  );

  const totalCapabilities = overview?.capabilitiesTotal ?? 0;
  const enabledCapabilities = overview?.capabilitiesEnabled ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Compliance</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Framework coverage and compliance posture across your AI operations
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunCheck}
            disabled={running}
            className="text-xs uppercase"
          >
            <RefreshCwIcon className={`mr-1 h-3 w-3 ${running ? "animate-spin" : ""}`} />
            {running ? "Running" : "Run Check"}
          </Button>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1"}/export/summary.json`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-input bg-background hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium uppercase"
          >
            Export JSON
          </a>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1"}/export/compliance-report.csv`}
            target="_blank"
            rel="noopener noreferrer"
            className="border-input bg-background hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium uppercase"
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* Radar chart for framework coverage */}
      {activeRadarData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Framework Coverage Overview</CardTitle>
            <CardDescription>
              Required control coverage across compliance frameworks
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ChartContainer config={radarConfig} className="h-[320px] w-full max-w-[500px]">
              <RadarChart data={activeRadarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                />
                <PolarAngleAxis
                  dataKey="framework"
                  tick={{ fontSize: 12 }}
                  className="[&_.recharts-text]:fill-foreground"
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v}%`}
                  className="[&_.recharts-text]:fill-muted-foreground"
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${value}%`}
                    />
                  }
                />
                <Radar
                  name="Coverage"
                  dataKey="coverage"
                  stroke="#37efed"
                  strokeWidth={2}
                  fill="#37efed"
                  fillOpacity={0.2}
                />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Capabilities Overview</CardTitle>
            <CardDescription>
              Active compliance capabilities across observe and control domains
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="text-primary h-5 w-5" />
            <span className="text-lg font-bold">
              {enabledCapabilities} / {totalCapabilities}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full transition-all ${coverageBg(
                totalCapabilities > 0
                  ? (enabledCapabilities / totalCapabilities) * 100
                  : 0
              )}`}
              style={{
                width: `${
                  totalCapabilities > 0
                    ? (enabledCapabilities / totalCapabilities) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Observe
              </p>
              <div className="mt-1.5 space-y-1">
                {(overview?.observeCapabilities ?? []).map((cap) => (
                  <div
                    key={cap.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    {cap.enabled ? (
                      <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircleIcon className="text-muted-foreground h-3.5 w-3.5" />
                    )}
                    <span className={cap.enabled ? "" : "text-muted-foreground"}>
                      {cap.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Control
              </p>
              <div className="mt-1.5 space-y-1">
                {(overview?.controlCapabilities ?? []).map((cap) => (
                  <div
                    key={cap.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    {cap.enabled ? (
                      <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircleIcon className="text-muted-foreground h-3.5 w-3.5" />
                    )}
                    <span className={cap.enabled ? "" : "text-muted-foreground"}>
                      {cap.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div data-tour="compliance-frameworks">
        <h2 className="mb-3 text-base font-semibold">Framework Coverage</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {frameworks.map((fw) => {
            const isEnabled = enabledFrameworks.has(fw.id);
            return (
            <Card
              key={fw.id}
              className={`${isEnabled ? "cursor-pointer hover:border-primary/50 transition-colors" : "opacity-50"}`}
              onClick={() => {
                if (isEnabled) {
                  const slug = (fw.name ?? "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                  window.location.href = `/compliance/${slug}`;
                }
              }}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{fw.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-bold ${coverageColor(
                        fw.requiredPercentage
                      )}`}
                    >
                      {isEnabled ? `${Math.round(fw.requiredPercentage)}%` : "Off"}
                    </span>
                    <button
                      onClick={() => handleToggleFramework(fw.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={isEnabled ? "Disable framework" : "Enable framework"}
                    >
                      {isEnabled ? (
                        <ToggleRightIcon className="h-5 w-5 text-primary" />
                      ) : (
                        <ToggleLeftIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </CardTitle>
                {fw.description && (
                  <CardDescription className="line-clamp-2">
                    {fw.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Required</span>
                      <span className="font-medium">
                        {fw.requiredCovered} / {fw.requiredTotal}
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full ${coverageBg(
                          fw.requiredPercentage
                        )}`}
                        style={{
                          width: `${fw.requiredPercentage}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Total (incl. recommended)
                      </span>
                      <span className="font-medium">
                        {fw.totalCovered} / {fw.totalCount}
                      </span>
                    </div>
                    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full ${coverageBg(
                          fw.totalPercentage
                        )}`}
                        style={{
                          width: `${fw.totalPercentage}%`,
                        }}
                      />
                    </div>
                  </div>
                  {fw.missingRequired.length > 0 && (
                    <div className="mt-2">
                      <p className="text-muted-foreground mb-1 text-xs font-medium">
                        Missing required:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {fw.missingRequired.slice(0, 5).map((cap) => (
                          <Badge key={cap} variant="destructive" className="text-[10px]">
                            {cap}
                          </Badge>
                        ))}
                        {fw.missingRequired.length > 5 && (
                          <Badge variant="secondary" className="text-[10px]">
                            +{fw.missingRequired.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
