"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BuildingIcon,
  UsersIcon,
  ServerIcon,
  RouteIcon,
  UserIcon,
  ArrowDownIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { usePolicies } from "@/graphql/policies/hooks";
import type { PolicyData } from "@/graphql/policies/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ── Hierarchy levels ─────────────────────────────────────────────── */

type Scope = "organization" | "team" | "deployment" | "endpoint" | "user";

interface ScopeMeta {
  key: Scope;
  label: string;
  description: string;
  icon: React.ElementType;
  /** Tailwind classes for the lane accent (border + dot color) */
  accent: string;
  /** Tailwind classes for the soft background tint */
  tint: string;
}

const SCOPES: ScopeMeta[] = [
  {
    key: "organization",
    label: "Organization",
    description: "Tenant-wide defaults — applies to every agent and user",
    icon: BuildingIcon,
    accent: "border-violet-500/60 bg-violet-500",
    tint: "bg-violet-500/5 dark:bg-violet-500/10",
  },
  {
    key: "team",
    label: "Team",
    description: "Sub-organization or business unit overrides",
    icon: UsersIcon,
    accent: "border-sky-500/60 bg-sky-500",
    tint: "bg-sky-500/5 dark:bg-sky-500/10",
  },
  {
    key: "deployment",
    label: "Deployment",
    description: "Environment or workspace-level overrides",
    icon: ServerIcon,
    accent: "border-cyan-500/60 bg-cyan-500",
    tint: "bg-cyan-500/5 dark:bg-cyan-500/10",
  },
  {
    key: "endpoint",
    label: "Endpoint",
    description: "Individual agent or service endpoint overrides",
    icon: RouteIcon,
    accent: "border-emerald-500/60 bg-emerald-500",
    tint: "bg-emerald-500/5 dark:bg-emerald-500/10",
  },
  {
    key: "user",
    label: "User",
    description: "Per-user overrides — most specific, highest precedence",
    icon: UserIcon,
    accent: "border-amber-500/60 bg-amber-500",
    tint: "bg-amber-500/5 dark:bg-amber-500/10",
  },
];

/* ── Enforcement style helpers ───────────────────────────────────── */

type EnforcementColor = "enforce" | "audit" | "disabled";

function classifyPolicy(p: PolicyData): EnforcementColor {
  if (!p.enabled) return "disabled";
  // "block" / "enforce" treated as enforced; others are audit-only
  if (p.enforcement === "block" || p.enforcement === "enforce") return "enforce";
  return "audit";
}

function enforcementChipClass(state: EnforcementColor): string {
  switch (state) {
    case "enforce":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "audit":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "disabled":
      return "border-muted-foreground/30 bg-muted text-muted-foreground";
  }
}

function enforcementDotClass(state: EnforcementColor): string {
  switch (state) {
    case "enforce":
      return "bg-emerald-500";
    case "audit":
      return "bg-amber-500";
    case "disabled":
      return "bg-muted-foreground/40";
  }
}

/* ── Page ────────────────────────────────────────────────────────── */

export default function PolicyHierarchyPage() {
  const { policies, loading } = usePolicies();
  const [activeScope, setActiveScope] = useState<Scope | null>(null);

  const grouped = useMemo(() => {
    const buckets: Record<Scope, PolicyData[]> = {
      organization: [],
      team: [],
      deployment: [],
      endpoint: [],
      user: [],
    };
    for (const p of policies) {
      const key = (p.scopeType as Scope) ?? "organization";
      if (buckets[key]) buckets[key].push(p);
    }
    // Stable order: enforce first, then audit, then disabled, then by priority desc, then name
    const order: Record<EnforcementColor, number> = {
      enforce: 0,
      audit: 1,
      disabled: 2,
    };
    for (const k of Object.keys(buckets) as Scope[]) {
      buckets[k].sort((a, b) => {
        const oa = order[classifyPolicy(a)];
        const ob = order[classifyPolicy(b)];
        if (oa !== ob) return oa - ob;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.name.localeCompare(b.name);
      });
    }
    return buckets;
  }, [policies]);

  const counts = useMemo(() => {
    const c: Record<Scope, { total: number; enforce: number; audit: number; disabled: number }> = {
      organization: { total: 0, enforce: 0, audit: 0, disabled: 0 },
      team: { total: 0, enforce: 0, audit: 0, disabled: 0 },
      deployment: { total: 0, enforce: 0, audit: 0, disabled: 0 },
      endpoint: { total: 0, enforce: 0, audit: 0, disabled: 0 },
      user: { total: 0, enforce: 0, audit: 0, disabled: 0 },
    };
    for (const s of Object.keys(grouped) as Scope[]) {
      for (const p of grouped[s]) {
        c[s].total++;
        c[s][classifyPolicy(p)]++;
      }
    }
    return c;
  }, [grouped]);

  const filtered = activeScope
    ? grouped[activeScope]
    : ([] as PolicyData[]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-80" />
        </div>
        <Skeleton className="h-[520px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Policy Hierarchy</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            How governance flows from organization-wide defaults down to per-user
            overrides. More specific scopes win on conflict.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Enforce
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            Audit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-muted-foreground/40 inline-block h-2.5 w-2.5 rounded-full" />
            Disabled
          </span>
        </div>
      </div>

      {/* Hierarchy tree */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inheritance Flow</CardTitle>
              <CardDescription>
                Click any level to filter policies attached at that scope.
              </CardDescription>
            </div>
            {activeScope && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveScope(null)}
                className="h-8"
              >
                <XIcon className="mr-1.5 h-3.5 w-3.5" />
                Clear filter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-stretch gap-2">
            {SCOPES.map((scope, idx) => {
              const c = counts[scope.key];
              const isActive = activeScope === scope.key;
              const isDimmed = activeScope !== null && !isActive;
              const Icon = scope.icon;
              const policiesAtScope = grouped[scope.key];

              return (
                <div key={scope.key} className="flex flex-col items-center gap-2">
                  {/* Lane */}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveScope(isActive ? null : scope.key)
                    }
                    className={cn(
                      "group relative w-full rounded-lg border-2 px-4 py-4 text-left transition-all",
                      "hover:shadow-sm focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                      isActive
                        ? "border-foreground/30 bg-card shadow-sm"
                        : "border-border/60 bg-card/40",
                      scope.tint,
                      isDimmed && "opacity-50",
                    )}
                  >
                    <div className="flex items-center gap-4">
                      {/* Level badge */}
                      <div
                        className={cn(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 text-white shadow-sm",
                          scope.accent,
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>

                      {/* Title + description */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
                            L{idx + 1}
                          </span>
                          <h3 className="text-sm font-semibold">
                            {scope.label}
                          </h3>
                          <Badge
                            variant="secondary"
                            className="h-5 text-[10px]"
                          >
                            {c.total} {c.total === 1 ? "policy" : "policies"}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {scope.description}
                        </p>
                      </div>

                      {/* Mini stat strip */}
                      <div className="hidden items-center gap-2 text-[11px] sm:flex">
                        <StatPill
                          color="enforce"
                          count={c.enforce}
                          label="enforced"
                        />
                        <StatPill color="audit" count={c.audit} label="audit" />
                        <StatPill
                          color="disabled"
                          count={c.disabled}
                          label="off"
                        />
                      </div>
                    </div>

                    {/* Lane mini-chips: small dots representing each policy */}
                    {policiesAtScope.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5 pl-16">
                        {policiesAtScope.slice(0, 24).map((p) => (
                          <span
                            key={p.id}
                            title={`${p.name} — ${p.policyType} (${p.enforcement}${p.enabled ? "" : ", disabled"})`}
                            className={cn(
                              "h-2 w-2 rounded-full",
                              enforcementDotClass(classifyPolicy(p)),
                            )}
                          />
                        ))}
                        {policiesAtScope.length > 24 && (
                          <span className="text-muted-foreground text-[10px]">
                            +{policiesAtScope.length - 24} more
                          </span>
                        )}
                      </div>
                    )}
                  </button>

                  {/* Connector arrow */}
                  {idx < SCOPES.length - 1 && (
                    <div
                      className={cn(
                        "flex flex-col items-center transition-opacity",
                        activeScope !== null && "opacity-40",
                      )}
                      aria-hidden
                    >
                      <div className="bg-border h-3 w-px" />
                      <ArrowDownIcon className="text-muted-foreground h-4 w-4" />
                      <div className="bg-border h-3 w-px" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-muted-foreground mt-6 rounded-md border border-dashed p-3 text-xs leading-relaxed">
            <strong className="text-foreground">Resolution order:</strong>{" "}
            policies cascade top-to-bottom. When multiple scopes attach a policy
            of the same type to the same target, the most specific scope wins
            (User &gt; Endpoint &gt; Deployment &gt; Team &gt; Organization).
            Within a scope, higher <code>priority</code> wins.
          </div>
        </CardContent>
      </Card>

      {/* Filtered policy list */}
      {activeScope && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="capitalize">
                  {activeScope}-scoped policies
                </CardTitle>
                <CardDescription>
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "policy" : "policies"} attached at
                  this level.
                </CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/policies/create">
                  <PlusIcon className="mr-1.5 h-4 w-4" />
                  New policy
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-muted-foreground rounded-md border border-dashed py-8 text-center text-sm">
                No policies attached at the{" "}
                <strong className="text-foreground">{activeScope}</strong>{" "}
                level yet.
              </div>
            ) : (
              <ul className="divide-border divide-y rounded-md border">
                {filtered.map((p) => {
                  const state = classifyPolicy(p);
                  return (
                    <li
                      key={p.id}
                      className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3 transition-colors"
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          enforcementDotClass(state),
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {p.name}
                          </span>
                          <Badge variant="outline" className="h-5 text-[10px]">
                            {p.policyType}
                          </Badge>
                          {p.scopeName && (
                            <span className="text-muted-foreground truncate text-xs">
                              · {p.scopeName}
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                            {p.description}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                          enforcementChipClass(state),
                        )}
                      >
                        {state}
                      </span>
                      <span className="text-muted-foreground hidden text-xs sm:inline">
                        priority {p.priority}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Small helpers ───────────────────────────────────────────────── */

function StatPill({
  color,
  count,
  label,
}: {
  color: EnforcementColor;
  count: number;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        enforcementChipClass(color),
        count === 0 && "opacity-60",
      )}
    >
      <span className="tabular-nums">{count}</span>
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </span>
  );
}
