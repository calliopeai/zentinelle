"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownIcon,
  Building2Icon,
  CheckCircleIcon,
  LayersIcon,
  Loader2Icon,
  SearchIcon,
  ServerIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useEndpoints } from "@/graphql/agents/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ── API types ─────────────────────────────────────────────────── */

interface EffectivePolicy {
  id: string;
  name: string;
  type: string;
  scope: string;
  priority: number;
  enforcement: string;
  config: Record<string, unknown> | null;
}

interface ResolvedConfig {
  system_prompt: string | null;
  ai_guardrails: Record<string, unknown>;
  tool_permissions: {
    allowed: string[];
    denied: string[];
    requires_approval: string[];
  };
  rate_limits: Record<string, unknown>;
  budget_limits: Record<string, unknown>;
  resource_quotas: Record<string, unknown>;
  secret_access: {
    allowed_bundles: string[];
    denied_providers: string[];
  };
}

interface EffectivePolicyResponse {
  policies: EffectivePolicy[];
  resolved: ResolvedConfig;
}

/* ── Scope helpers ────────────────────────────────────────────── */

const SCOPE_ORDER = [
  "organization",
  "sub_organization",
  "team",
  "deployment",
  "endpoint",
  "user",
];

function scopeRank(scope: string) {
  const idx = SCOPE_ORDER.indexOf(scope);
  return idx === -1 ? 99 : idx;
}

function scopeIcon(scope: string) {
  switch (scope) {
    case "organization":
    case "sub_organization":
      return <Building2Icon className="h-3.5 w-3.5" />;
    case "team":
      return <UsersIcon className="h-3.5 w-3.5" />;
    case "deployment":
      return <LayersIcon className="h-3.5 w-3.5" />;
    case "endpoint":
      return <ServerIcon className="h-3.5 w-3.5" />;
    case "user":
      return <UserIcon className="h-3.5 w-3.5" />;
    default:
      return <LayersIcon className="h-3.5 w-3.5" />;
  }
}

function scopeLabel(scope: string) {
  return scope
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function enforcementVariant(
  enforcement: string,
): "destructive" | "secondary" | "outline" | "default" {
  switch (enforcement) {
    case "block":
    case "hard":
      return "destructive";
    case "warn":
      return "secondary";
    case "log":
    case "audit":
      return "outline";
    default:
      return "outline";
  }
}

function policyTypeLabel(type: string) {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Inheritance ladder ──────────────────────────────────────── */

function InheritanceLadder({ scope }: { scope: string }) {
  const activeIdx = scopeRank(scope);
  const visible = SCOPE_ORDER.filter((s) => s !== "sub_organization");
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {visible.map((s, i) => {
        const rank = scopeRank(s);
        const isActive = rank === activeIdx;
        const isAncestor = rank < activeIdx;
        return (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className={
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 " +
                (isActive
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : isAncestor
                    ? "border-border bg-muted/40 text-muted-foreground"
                    : "border-dashed border-border/60 text-muted-foreground/50")
              }
            >
              {scopeIcon(s)}
              {scopeLabel(s)}
            </span>
            {i < visible.length - 1 && (
              <ArrowDownIcon className="text-muted-foreground/40 h-3 w-3 -rotate-90" />
            )}
          </span>
        );
      })}
    </div>
  );
}

/* ── Policy type group ───────────────────────────────────────── */

function PolicyTypeGroup({
  type,
  policies,
}: {
  type: string;
  policies: EffectivePolicy[];
}) {
  // Sort by priority (most specific scope = lowest scopeRank wins)
  const sorted = useMemo(
    () =>
      [...policies].sort(
        (a, b) => scopeRank(a.scope) - scopeRank(b.scope),
      ),
    [policies],
  );

  const winner = sorted[0];
  const overridden = sorted.slice(1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="text-primary h-4 w-4" />
            <CardTitle className="text-base">
              {policyTypeLabel(type)}
            </CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {policies.length} policy{policies.length !== 1 ? "ies" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Winning policy */}
        <div className="border-primary/30 bg-primary/5 space-y-3 rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold">
                  {winner.name}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                Effective from{" "}
                <span className="font-medium capitalize">
                  {scopeLabel(winner.scope)}
                </span>
                {" "}scope · priority {winner.priority}
              </p>
            </div>
            <Badge variant={enforcementVariant(winner.enforcement)}>
              {winner.enforcement}
            </Badge>
          </div>

          <InheritanceLadder scope={winner.scope} />

          {winner.config && Object.keys(winner.config).length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1 text-[10px] font-medium uppercase tracking-wider">
                Effective config
              </div>
              <pre className="bg-background border-border/60 max-h-48 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(winner.config, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Overridden policies */}
        {overridden.length > 0 && (
          <div className="space-y-2">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider">
              <ShieldAlertIcon className="h-3 w-3" />
              Overridden ({overridden.length})
            </div>
            <div className="space-y-1.5">
              {overridden.map((p) => (
                <div
                  key={p.id}
                  className="bg-muted/40 flex items-center justify-between gap-3 rounded-md border border-dashed px-2.5 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-muted-foreground line-through text-xs">
                      {p.name}
                    </span>
                    <span className="text-muted-foreground/70 inline-flex items-center gap-1 text-[10px]">
                      {scopeIcon(p.scope)}
                      {scopeLabel(p.scope)}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-muted-foreground text-[10px]"
                  >
                    {p.enforcement}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── API helper ───────────────────────────────────────────────── */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "/api/zentinelle/v1";

async function fetchEffectivePolicy(
  endpointKey: string | null,
  userId: string | null,
): Promise<EffectivePolicyResponse> {
  const path = userId
    ? `/effective-policy/${encodeURIComponent(userId)}`
    : `/effective-policy`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (endpointKey) {
    headers["X-Zentinelle-Key"] = endpointKey;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data?.error || data?.detail || message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  return (await res.json()) as EffectivePolicyResponse;
}

/* ── Resolved summary ─────────────────────────────────────────── */

function ResolvedSummary({ resolved }: { resolved: ResolvedConfig }) {
  const sections: Array<{ label: string; value: React.ReactNode }> = [];

  if (resolved.system_prompt) {
    sections.push({
      label: "System Prompt",
      value: (
        <pre className="bg-background border-border/60 max-h-32 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {resolved.system_prompt}
        </pre>
      ),
    });
  }

  const tp = resolved.tool_permissions;
  if (
    tp.allowed.length > 0 ||
    tp.denied.length > 0 ||
    tp.requires_approval.length > 0
  ) {
    sections.push({
      label: "Tool Permissions",
      value: (
        <div className="flex flex-wrap gap-1.5">
          {tp.allowed.map((t) => (
            <Badge
              key={"a" + t}
              className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
            >
              {t}
            </Badge>
          ))}
          {tp.denied.map((t) => (
            <Badge key={"d" + t} variant="destructive">
              {t}
            </Badge>
          ))}
          {tp.requires_approval.map((t) => (
            <Badge key={"r" + t} variant="secondary">
              {t} (approval)
            </Badge>
          ))}
        </div>
      ),
    });
  }

  if (Object.keys(resolved.rate_limits).length > 0) {
    sections.push({
      label: "Rate Limits",
      value: (
        <div className="grid grid-cols-3 gap-2 text-xs">
          {Object.entries(resolved.rate_limits).map(([k, v]) => (
            <div key={k} className="bg-muted/50 rounded-md p-2">
              <div className="text-muted-foreground text-[10px] uppercase">
                {k.replace(/_/g, " ")}
              </div>
              <div className="font-mono font-semibold">{String(v)}</div>
            </div>
          ))}
        </div>
      ),
    });
  }

  if (Object.keys(resolved.budget_limits).length > 0) {
    sections.push({
      label: "Budget Limits",
      value: (
        <div className="grid grid-cols-3 gap-2 text-xs">
          {Object.entries(resolved.budget_limits).map(([k, v]) => (
            <div key={k} className="bg-muted/50 rounded-md p-2">
              <div className="text-muted-foreground text-[10px] uppercase">
                {k.replace(/_/g, " ")}
              </div>
              <div className="font-mono font-semibold">{String(v)}</div>
            </div>
          ))}
        </div>
      ),
    });
  }

  if (Object.keys(resolved.ai_guardrails).length > 0) {
    sections.push({
      label: "AI Guardrails",
      value: (
        <pre className="bg-background border-border/60 max-h-40 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(resolved.ai_guardrails, null, 2)}
        </pre>
      ),
    });
  }

  if (sections.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Resolved Configuration</CardTitle>
        <CardDescription>
          Merged settings derived from all effective policies
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.map((s) => (
          <div key={s.label} className="space-y-1.5">
            <div className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
              {s.label}
            </div>
            {s.value}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ── Main page ────────────────────────────────────────────────── */

export default function EffectivePolicyViewerPage() {
  const { endpoints, loading: endpointsLoading } = useEndpoints();
  const [endpointId, setEndpointId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [result, setResult] = useState<EffectivePolicyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [submittedUserId, setSubmittedUserId] = useState<string | null>(null);
  const [submittedEndpoint, setSubmittedEndpoint] = useState<string | null>(
    null,
  );

  const grouped = useMemo(() => {
    if (!result) return new Map<string, EffectivePolicy[]>();
    const map = new Map<string, EffectivePolicy[]>();
    for (const p of result.policies) {
      const key = p.type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [result]);

  const handleResolve = async () => {
    setError(null);
    setResult(null);
    setResolving(true);
    try {
      const data = await fetchEffectivePolicy(
        null, // session-based auth — no key here
        userId.trim() || null,
      );
      setResult(data);
      setSubmittedUserId(userId.trim() || null);
      const ep = endpoints.find((e) => e.id === endpointId);
      setSubmittedEndpoint(ep?.name ?? null);
      if (data.policies.length === 0) {
        toast.info("No effective policies found", {
          description: "No policies apply to this scope.",
        });
      } else {
        toast.success(
          `Resolved ${data.policies.length} polic${
            data.policies.length === 1 ? "y" : "ies"
          }`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to resolve";
      setError(msg);
      toast.error("Could not resolve effective policy", {
        description: msg,
      });
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <SearchIcon className="h-5 w-5" />
          Effective Policy Viewer
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Resolve the policies that apply to a specific user or agent endpoint
          after inheritance from organization, deployment, and user scopes
        </p>
      </div>

      {/* Selector card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resolve Scope</CardTitle>
          <CardDescription>
            Pick an agent endpoint and optionally a user identifier. Leave the
            user blank to resolve at the endpoint level.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[1.4fr_1.4fr_auto] md:items-end">
            <div className="space-y-1.5">
              <label
                htmlFor="endpoint-select"
                className="text-foreground text-xs font-medium"
              >
                Endpoint
              </label>
              <Select
                value={endpointId}
                onValueChange={setEndpointId}
                disabled={endpointsLoading}
              >
                <SelectTrigger id="endpoint-select" className="h-9 w-full">
                  <SelectValue
                    placeholder={
                      endpointsLoading
                        ? "Loading endpoints..."
                        : "Select an endpoint"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {endpoints.length === 0 ? (
                    <div className="text-muted-foreground px-2 py-1.5 text-xs">
                      No endpoints registered
                    </div>
                  ) : (
                    endpoints.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <span className="flex items-center gap-2">
                          <ServerIcon className="h-3.5 w-3.5" />
                          <span>{e.name}</span>
                          <Badge
                            variant="outline"
                            className="ml-1 text-[10px]"
                          >
                            {e.agentType}
                          </Badge>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="user-id-input"
                className="text-foreground text-xs font-medium"
              >
                User ID <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="user-id-input"
                placeholder="alice@example.com or external-user-id"
                value={userId}
                onChange={(ev) => setUserId(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && !resolving) {
                    handleResolve();
                  }
                }}
                className="h-9"
              />
            </div>

            <Button
              onClick={handleResolve}
              disabled={resolving}
              className="h-9 md:w-32"
            >
              {resolving ? (
                <>
                  <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />
                  Resolving
                </>
              ) : (
                <>
                  <SearchIcon className="mr-1.5 h-4 w-4" />
                  Resolve
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && !resolving && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 py-4">
            <XCircleIcon className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <div className="text-sm font-medium">
                Could not resolve effective policy
              </div>
              <div className="text-muted-foreground text-xs">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {resolving && (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {/* Results */}
      {result && !resolving && (
        <div className="space-y-6">
          {/* Resolution summary */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                <span>
                  <span className="font-semibold">{result.policies.length}</span>
                  <span className="text-muted-foreground">
                    {" "}policies effective
                  </span>
                </span>
              </div>
              {submittedEndpoint && (
                <div className="flex items-center gap-1.5">
                  <ServerIcon className="text-muted-foreground h-3.5 w-3.5" />
                  <span className="text-muted-foreground">Endpoint:</span>
                  <span className="font-medium">{submittedEndpoint}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <UserIcon className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-muted-foreground">User:</span>
                <span className="font-medium">
                  {submittedUserId ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <LayersIcon className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-muted-foreground">Types:</span>
                <span className="font-medium">{grouped.size}</span>
              </div>
            </CardContent>
          </Card>

          {/* Policy groups */}
          {grouped.size === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-12 text-center text-sm">
                No effective policies for this scope.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from(grouped.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([type, policies]) => (
                  <PolicyTypeGroup
                    key={type}
                    type={type}
                    policies={policies}
                  />
                ))}
            </div>
          )}

          {/* Resolved configuration */}
          <ResolvedSummary resolved={result.resolved} />
        </div>
      )}

      {/* Empty state */}
      {!result && !resolving && !error && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <SearchIcon className="text-muted-foreground/60 h-10 w-10" />
            <div className="text-sm font-medium">No resolution yet</div>
            <p className="text-muted-foreground max-w-sm text-xs">
              Pick an endpoint, optionally enter a user ID, and click{" "}
              <span className="font-medium">Resolve</span> to see which
              policies apply after inheritance.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
