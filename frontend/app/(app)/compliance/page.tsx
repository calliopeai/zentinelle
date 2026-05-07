"use client";

import { useComplianceOverview } from "@/graphql/compliance/hooks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircleIcon, XCircleIcon, ShieldCheckIcon } from "lucide-react";

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

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
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

  const frameworks = overview?.frameworkCoverage ?? [];
  const totalCapabilities = overview?.capabilitiesTotal ?? 0;
  const enabledCapabilities = overview?.capabilitiesEnabled ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Compliance</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Framework coverage and compliance posture across your AI operations
        </p>
      </div>

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

      <div>
        <h2 className="mb-3 text-base font-semibold">Framework Coverage</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {frameworks.map((fw) => (
            <Card key={fw.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{fw.name}</span>
                  <span
                    className={`text-sm font-bold ${coverageColor(
                      fw.requiredPercentage
                    )}`}
                  >
                    {Math.round(fw.requiredPercentage)}%
                  </span>
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
          ))}
        </div>
      </div>
    </div>
  );
}
