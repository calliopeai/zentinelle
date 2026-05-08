"use client";

import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheckIcon,
  AlertTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from "lucide-react";
import { GET_POLICIES } from "@/graphql/policies/queries";
import Link from "next/link";

type Policy = {
  id: string;
  name: string;
  policyType: string;
  scopeType: string;
  enforcement: string;
  enabled: boolean;
  priority: number;
  config: string;
};

const ALL_POLICY_TYPES = [
  "rate_limit", "tool_permission", "model_restriction", "budget_limit",
  "network_policy", "output_filter", "agent_capability", "context_limit",
  "safety_settings", "multimodal_policy", "secret_access", "prompt_injection",
  "system_prompt", "ai_guardrail", "human_oversight", "data_retention",
  "session_policy", "audit_policy", "data_access", "agent_delegation",
  "behavioral_baseline", "session_quota", "resource_quota", "agent_memory",
];

function analyzePolicy(policy: Policy): string[] {
  const issues: string[] = [];
  try {
    const config = typeof policy.config === "string" ? JSON.parse(policy.config) : policy.config;
    if (!config || Object.keys(config).length === 0) {
      issues.push("Empty configuration — policy has no rules defined");
    }
  } catch {
    issues.push("Invalid JSON configuration");
  }
  if (policy.enforcement === "disabled") {
    issues.push("Enforcement is disabled — policy has no effect");
  }
  if (!policy.enabled) {
    issues.push("Policy is disabled");
  }
  return issues;
}

function detectConflicts(policies: Policy[]): Array<{ a: string; b: string; reason: string }> {
  const conflicts: Array<{ a: string; b: string; reason: string }> = [];
  const byType = new Map<string, Policy[]>();
  policies.forEach((p) => {
    const list = byType.get(p.policyType) || [];
    list.push(p);
    byType.set(p.policyType, list);
  });

  for (const [type, group] of byType) {
    if (group.length > 1) {
      const sameScopePairs = group.filter((a, i) =>
        group.some((b, j) => i < j && a.scopeType === b.scopeType && a.priority === b.priority),
      );
      if (sameScopePairs.length > 0) {
        conflicts.push({
          a: group[0].name,
          b: group[1].name,
          reason: `Same policy type (${type}) and scope with equal priority — ambiguous resolution`,
        });
      }
    }
  }
  return conflicts;
}

export default function PolicyAnalyzerPage() {
  const { data, loading } = useQuery<{ policies: Policy[] }>(GET_POLICIES);
  const policies: Policy[] = data?.policies ?? [];

  const analysis = useMemo(() => {
    if (!policies.length) return null;

    const enabled = policies.filter((p) => p.enabled);
    const enforced = enabled.filter((p) => p.enforcement === "enforce");
    const auditOnly = enabled.filter((p) => p.enforcement === "audit");
    const disabled = policies.filter((p) => !p.enabled);

    const coveredTypes = new Set(enabled.map((p) => p.policyType));
    const missingTypes = ALL_POLICY_TYPES.filter((t) => !coveredTypes.has(t));

    const coverageScore = Math.round((coveredTypes.size / ALL_POLICY_TYPES.length) * 100);

    const allIssues: Array<{ policy: string; issues: string[] }> = [];
    policies.forEach((p) => {
      const issues = analyzePolicy(p);
      if (issues.length > 0) {
        allIssues.push({ policy: p.name, issues });
      }
    });

    const conflicts = detectConflicts(policies);

    let healthScore = coverageScore;
    healthScore -= allIssues.length * 5;
    healthScore -= conflicts.length * 15;
    healthScore = Math.max(0, Math.min(100, healthScore));

    return {
      total: policies.length,
      enabled: enabled.length,
      enforced: enforced.length,
      auditOnly: auditOnly.length,
      disabled: disabled.length,
      coveredTypes: coveredTypes.size,
      missingTypes,
      coverageScore,
      healthScore,
      issues: allIssues,
      conflicts,
    };
  }, [policies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">Analyzing policies...</div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">No policies to analyze</div>
      </div>
    );
  }

  const scoreColor =
    analysis.healthScore >= 80
      ? "text-green-500"
      : analysis.healthScore >= 50
        ? "text-yellow-500"
        : "text-red-500";

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Policy Analyzer</h1>
        <p className="text-muted-foreground">
          Analyze policy health, detect conflicts, and identify coverage gaps
        </p>
      </div>

      {/* Health Score */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className={`text-4xl font-bold ${scoreColor}`}>
              {analysis.healthScore}
            </div>
            <div className="text-muted-foreground mt-1 text-sm">
              Health Score
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold">{analysis.coverageScore}%</div>
            <div className="text-muted-foreground mt-1 text-sm">
              Type Coverage ({analysis.coveredTypes}/{ALL_POLICY_TYPES.length})
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold text-green-500">
              {analysis.enforced}
            </div>
            <div className="text-muted-foreground mt-1 text-sm">Enforcing</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold text-yellow-500">
              {analysis.auditOnly}
            </div>
            <div className="text-muted-foreground mt-1 text-sm">Audit Only</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coverage Gaps */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5" />
              Coverage Gaps
            </CardTitle>
            <CardDescription>
              Policy types with no active policy configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.missingTypes.length === 0 ? (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircleIcon className="h-5 w-5" />
                <span>All policy types are covered</span>
              </div>
            ) : (
              <div className="space-y-2">
                {analysis.missingTypes.map((type) => (
                  <div
                    key={type}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <XCircleIcon className="h-4 w-4 text-red-500" />
                      <span className="text-sm">{type.replace(/_/g, " ")}</span>
                    </div>
                    <Link href="/policies/simulator">
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                      >
                        Create <ArrowRightIcon className="ml-1 h-3 w-3" />
                      </Badge>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Issues */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="h-5 w-5" />
              Issues ({analysis.issues.length})
            </CardTitle>
            <CardDescription>
              Problems detected in policy configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.issues.length === 0 ? (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircleIcon className="h-5 w-5" />
                <span>No issues detected</span>
              </div>
            ) : (
              <div className="space-y-3">
                {analysis.issues.map((item, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="font-medium text-sm">{item.policy}</div>
                    <ul className="mt-1 space-y-1">
                      {item.issues.map((issue, j) => (
                        <li
                          key={j}
                          className="text-muted-foreground flex items-center gap-2 text-xs"
                        >
                          <AlertTriangleIcon className="h-3 w-3 text-yellow-500" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conflicts */}
        {analysis.conflicts.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-500">
                <XCircleIcon className="h-5 w-5" />
                Conflicts ({analysis.conflicts.length})
              </CardTitle>
              <CardDescription>
                Policies that may produce ambiguous or conflicting results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysis.conflicts.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-md border border-red-500/20 bg-red-500/5 p-3"
                  >
                    <XCircleIcon className="h-5 w-5 shrink-0 text-red-500" />
                    <div>
                      <div className="text-sm font-medium">
                        {c.a} vs {c.b}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {c.reason}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
