"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { toast } from "sonner";
import { useComplianceOverview } from "@/graphql/compliance/hooks";
import { RUN_COMPLIANCE_CHECK, ACTIVATE_COMPLIANCE_PACK } from "@/graphql/compliance/mutations";
import { LIST_COMPLIANCE_PACKS } from "@/graphql/compliance/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";
import { CheckCircleIcon, XCircleIcon, ShieldCheckIcon, ToggleLeftIcon, ToggleRightIcon, RefreshCwIcon, PackageIcon, ChevronDownIcon } from "lucide-react";

const TOGGLE_FRAMEWORK = gql`
  mutation ToggleFramework($frameworkId: String!) {
    toggleFramework(frameworkId: $frameworkId) {
      success
      enabled
      frameworkId
    }
  }
`;

type CompliancePackMeta = {
  name: string | null;
  displayName: string | null;
  version: string | null;
  description: string | null;
  policyCount: number | null;
};

type ListCompliancePacksData = {
  listCompliancePacks: {
    success: boolean | null;
    packs: CompliancePackMeta[] | null;
  } | null;
};

type ActivateCompliancePackData = {
  activateCompliancePack: {
    success: boolean | null;
    error: string | null;
    packName: string | null;
    packVersion: string | null;
    policiesCreated: number | null;
    policiesUpdated: number | null;
  } | null;
};
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
  const { overview, loading, refetch } = useComplianceOverview();
  const confirm = useConfirm();

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

  // ALL hooks must be declared before any early return — moving these up
  // fixes the previous rule-of-hooks violation that crashed the page.
  const [enabledFrameworks, setEnabledFrameworks] = useState<Set<string>>(new Set());
  const [toggleFramework] = useMutation(TOGGLE_FRAMEWORK);
  const [runCheck, { loading: running }] = useMutation(RUN_COMPLIANCE_CHECK);
  const [packs, setPacks] = useState<CompliancePackMeta[]>([]);
  const [packsLoaded, setPacksLoaded] = useState(false);
  const [activatingPack, setActivatingPack] = useState<string | null>(null);
  const [packsMenuOpen, setPacksMenuOpen] = useState(false);
  const [fetchPacks, { loading: packsLoading }] = useMutation<ListCompliancePacksData>(LIST_COMPLIANCE_PACKS);
  const [activatePack] = useMutation<ActivateCompliancePackData>(ACTIVATE_COMPLIANCE_PACK);

  useEffect(() => {
    if (!packsMenuOpen || packsLoaded) return;
    void (async () => {
      try {
        const result = await fetchPacks();
        const data = result.data?.listCompliancePacks;
        if (data?.success) {
          setPacks(data.packs ?? []);
          setPacksLoaded(true);
        } else {
          toast.error("Failed to load compliance packs");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load compliance packs";
        toast.error(msg);
      }
    })();
  }, [packsMenuOpen, packsLoaded, fetchPacks]);

  // Hydrate the enabled set once the data lands. useEffect-style derivation
  // via comparing string keys keeps it stable.
  const frameworkIdsKey = frameworks.map((fw) => fw.id ?? "").join("|");
  useMemo(() => {
    if (frameworks.length === 0) return;
    setEnabledFrameworks(
      new Set(
        frameworks
          .map((fw) => fw.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameworkIdsKey]);

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

  const handleActivatePack = async (pack: CompliancePackMeta) => {
    if (!pack.name) return;
    const policyCount = pack.policyCount ?? 0;
    const policyLabel = policyCount === 1 ? "policy" : "policies";
    const confirmed = await confirm({
      title: `Activate ${pack.displayName ?? pack.name}?`,
      description: `This will activate the ${pack.displayName ?? pack.name} pack${pack.version ? ` (v${pack.version})` : ""}: ${policyCount} ${policyLabel}. New policies will be created and existing ones updated. Continue?`,
      confirmLabel: "Activate",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setActivatingPack(pack.name);
    try {
      const result = await activatePack({ variables: { packId: pack.name } });
      const payload = result.data?.activateCompliancePack;
      if (payload?.success) {
        const created = payload.policiesCreated ?? 0;
        const updated = payload.policiesUpdated ?? 0;
        toast.success(
          `Activated ${pack.displayName ?? pack.name}: ${created} created, ${updated} updated`,
        );
        await refetch();
      } else {
        toast.error(payload?.error ?? "Failed to activate pack");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to activate pack";
      toast.error(msg);
    } finally {
      setActivatingPack(null);
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

  const activeFrameworks = frameworks.filter(
    (fw) => fw.id != null && enabledFrameworks.has(fw.id),
  );
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
          <DropdownMenu open={packsMenuOpen} onOpenChange={setPacksMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={activatingPack !== null}
                className="text-xs uppercase"
              >
                <PackageIcon className="mr-1 h-3 w-3" />
                {activatingPack ? "Activating" : "Apply Pack"}
                <ChevronDownIcon className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Compliance Packs</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {packsLoading && !packsLoaded ? (
                <div className="text-muted-foreground px-2 py-2 text-xs">Loading packs...</div>
              ) : packs.length === 0 && packsLoaded ? (
                <div className="text-muted-foreground px-2 py-2 text-xs">No packs available</div>
              ) : (
                packs.map((pack) => (
                  <DropdownMenuItem
                    key={pack.name ?? ""}
                    disabled={activatingPack !== null}
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleActivatePack(pack);
                    }}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-sm font-medium">
                        {pack.displayName ?? pack.name}
                      </span>
                      {pack.version && (
                        <Badge variant="secondary" className="text-[10px]">
                          v{pack.version}
                        </Badge>
                      )}
                    </div>
                    {pack.description && (
                      <span className="text-muted-foreground line-clamp-2 text-xs">
                        {pack.description}
                      </span>
                    )}
                    <span className="text-muted-foreground text-[10px]">
                      {pack.policyCount ?? 0} {(pack.policyCount ?? 0) === 1 ? "policy" : "policies"}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
            const isEnabled = fw.id != null && enabledFrameworks.has(fw.id);
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
                      onClick={() => fw.id && handleToggleFramework(fw.id)}
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
