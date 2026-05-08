"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  ShieldXIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import { useComplianceOverview } from "@/graphql/compliance/hooks";

interface GapRow {
  id: string;
  capability: string;
  framework: string;
  required: boolean;
  severity: "critical" | "high" | "medium" | "low";
  effort: "easy" | "medium" | "hard";
  effortHours: string;
  recommendation: string;
  policyType?: string;
}

function severityBadge(sev: string) {
  switch (sev) {
    case "critical":
      return "bg-red-500/15 text-red-500 border-red-500/30";
    case "high":
      return "bg-orange-500/15 text-orange-500 border-orange-500/30";
    case "medium":
      return "bg-yellow-500/15 text-yellow-500 border-yellow-500/30";
    default:
      return "bg-blue-500/15 text-blue-500 border-blue-500/30";
  }
}

function effortBadge(eff: string) {
  switch (eff) {
    case "easy":
      return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
    case "medium":
      return "bg-yellow-500/15 text-yellow-500 border-yellow-500/30";
    default:
      return "bg-orange-500/15 text-orange-500 border-orange-500/30";
  }
}

const CAPABILITY_REMEDIATION: Record<
  string,
  { effort: "easy" | "medium" | "hard"; hours: string; rec: string; policyType?: string }
> = {
  rate_limit: { effort: "easy", hours: "< 1h", rec: "Create a rate_limit policy at organization scope", policyType: "rate_limit" },
  tool_permission: { effort: "easy", hours: "< 1h", rec: "Define allowed tools and create tool_permission policy", policyType: "tool_permission" },
  model_restriction: { effort: "easy", hours: "< 1h", rec: "Whitelist approved models in a model_restriction policy", policyType: "model_restriction" },
  network_policy: { effort: "easy", hours: "1-2h", rec: "Configure domain allowlists in /network", policyType: "network_policy" },
  output_filter: { effort: "medium", hours: "2-4h", rec: "Set up content scanning rules for PII/secrets", policyType: "output_filter" },
  budget_limit: { effort: "easy", hours: "< 1h", rec: "Define monthly budget caps", policyType: "budget_limit" },
  audit_log: { effort: "easy", hours: "< 1h", rec: "Enable audit logging in settings (already on by default)" },
  human_oversight: { effort: "medium", hours: "2-4h", rec: "Configure approval workflows for high-risk actions", policyType: "human_oversight" },
  data_retention: { effort: "medium", hours: "2-4h", rec: "Set retention TTLs in /retention", policyType: "data_retention" },
  prompt_injection: { effort: "medium", hours: "2-4h", rec: "Add prompt_injection content rule", policyType: "prompt_injection" },
};

export default function GapAnalysisPage() {
  const { overview, loading } = useComplianceOverview();

  const gaps: GapRow[] = useMemo(() => {
    if (!overview) return [];
    const result: GapRow[] = [];

    const addCapabilityGaps = (caps: any[], framework: string) => {
      for (const cap of caps ?? []) {
        if (!cap.enabled) {
          const remediation = CAPABILITY_REMEDIATION[cap.id] ?? {
            effort: "medium",
            hours: "1-4h",
            rec: `Implement ${cap.name} capability`,
          };
          result.push({
            id: `${framework}-${cap.id}`,
            capability: cap.name,
            framework,
            required: cap.required ?? true,
            severity: cap.required ? "high" : "medium",
            effort: remediation.effort,
            effortHours: remediation.hours,
            recommendation: remediation.rec,
            policyType: remediation.policyType,
          });
        }
      }
    };

    addCapabilityGaps(overview.observeCapabilities, "All Frameworks");
    addCapabilityGaps(overview.controlCapabilities, "All Frameworks");

    return result.sort((a, b) => {
      const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return sevOrder[a.severity] - sevOrder[b.severity];
    });
  }, [overview]);

  const stats = useMemo(() => {
    return {
      total: gaps.length,
      critical: gaps.filter((g) => g.severity === "critical").length,
      high: gaps.filter((g) => g.severity === "high").length,
      easy: gaps.filter((g) => g.effort === "easy").length,
    };
  }, [gaps]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-muted-foreground">Loading gap analysis...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Gap Analysis</h1>
        <p className="text-muted-foreground">
          Compliance gaps with remediation guidance and policy templates
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <ShieldXIcon className="text-muted-foreground mx-auto h-6 w-6" />
            <div className="mt-2 text-3xl font-bold">{stats.total}</div>
            <div className="text-muted-foreground text-sm">Total Gaps</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangleIcon className="mx-auto h-6 w-6 text-red-500" />
            <div className="mt-2 text-3xl font-bold text-red-500">
              {stats.critical}
            </div>
            <div className="text-muted-foreground text-sm">Critical</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangleIcon className="mx-auto h-6 w-6 text-orange-500" />
            <div className="mt-2 text-3xl font-bold text-orange-500">
              {stats.high}
            </div>
            <div className="text-muted-foreground text-sm">High Priority</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ZapIcon className="mx-auto h-6 w-6 text-emerald-500" />
            <div className="mt-2 text-3xl font-bold text-emerald-500">
              {stats.easy}
            </div>
            <div className="text-muted-foreground text-sm">Quick Wins</div>
          </CardContent>
        </Card>
      </div>

      {gaps.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <CheckCircleIcon className="mx-auto h-12 w-12 text-emerald-500" />
            <h3 className="mt-4 font-medium">No gaps detected</h3>
            <p className="text-muted-foreground text-sm mt-2">
              All required compliance capabilities are enabled.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Remediation Tasks</CardTitle>
            <CardDescription>
              Sorted by priority. Click to create the recommended policy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gaps.map((gap) => (
                <div
                  key={gap.id}
                  className="flex items-start gap-4 rounded border p-4"
                >
                  <AlertTriangleIcon
                    className={`shrink-0 mt-0.5 h-5 w-5 ${
                      gap.severity === "critical" || gap.severity === "high"
                        ? "text-red-500"
                        : "text-yellow-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{gap.capability}</span>
                      <Badge variant="outline" className="text-xs">
                        {gap.framework}
                      </Badge>
                      <Badge className={severityBadge(gap.severity)}>
                        {gap.severity}
                      </Badge>
                      <Badge className={effortBadge(gap.effort)}>
                        {gap.effort} · {gap.effortHours}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm mt-2">
                      {gap.recommendation}
                    </p>
                  </div>
                  {gap.policyType && (
                    <Link href={`/policies/create?type=${gap.policyType}`}>
                      <Button size="sm" variant="outline">
                        Fix
                        <ArrowRightIcon className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
