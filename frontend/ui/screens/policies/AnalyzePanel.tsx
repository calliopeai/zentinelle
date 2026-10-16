import type * as React from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  useUI,
} from "@calliopelabs/ui";

import { StatTile } from "../../shared/StatTile";
import { scopeLabel, typeLabel } from "./labels";
import type { PolicyAnalysis } from "./map";

export interface AnalyzePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `analyzePolicies(PolicyAnalyzer)`. */
  analysis: PolicyAnalysis | null;
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
}

/** Analyze coverage: which policy types nothing covers, which policies do nothing, and which collide. Counts, never a score. */
export function AnalyzePanel({
  open,
  onOpenChange,
  analysis,
  loading,
  error,
  onRetry,
}: AnalyzePanelProps) {
  const { Link } = useUI();
  let body: React.ReactNode;
  if (error)
    body = (
      <ErrorState
        title="Could not analyze the policies"
        error={error}
        onRetry={onRetry}
      />
    );
  else if (loading || !analysis)
    body = <LoadingState label="Analyzing the policies" rows={4} />;
  else if (analysis.total === 0)
    body = (
      <EmptyState
        title="Nothing to analyze"
        description="Coverage is measured over the policies that exist. Add a policy first."
      />
    );
  else
    body = (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Enforced"
            value={analysis.enforced}
            hint={`of ${analysis.total} policies`}
          />
          <StatTile label="Audit only" value={analysis.auditOnly} />
          <StatTile
            label="Off or disabled"
            value={analysis.disabled}
            tone={analysis.disabled ? "warn" : undefined}
          />
          <StatTile
            label="Types covered"
            value={analysis.coveredTypes.length}
            hint={`${analysis.missingTypes.length} with no live policy`}
          />
        </div>
        <section>
          <h3 className="mb-1 text-sm font-semibold">
            Conflicts ({analysis.conflicts.length})
          </h3>
          {analysis.conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No two live policies share a type, tier and priority.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {analysis.conflicts.map((c) => (
                <li
                  key={`${c.type}-${c.scope}-${c.priority}`}
                  className="rounded-lg border border-warning-border bg-warning-bg p-2 text-warning-fg"
                >
                  <span className="font-medium">{c.names.join(", ")}</span>:{" "}
                  {typeLabel(c.type)} at {scopeLabel(c.scope).toLowerCase()}{" "}
                  with priority {c.priority}, so the order they apply in is
                  undefined.
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold">
            Policies that do nothing ({analysis.issues.length})
          </h3>
          {analysis.issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every policy is on and configured.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {analysis.issues.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/policies/${encodeURIComponent(i.id)}`}
                    className="font-medium underline-offset-2 hover:underline [overflow-wrap:anywhere]"
                  >
                    {i.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    {i.issues.join(" ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold">
            Types with no live policy
          </h3>
          <p className="text-sm text-muted-foreground">
            {analysis.missingTypes.join(", ") || "None."}
          </p>
        </section>
      </div>
    );
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>Analyze coverage</DrawerTitle>
          <DrawerDescription>
            {analysis && analysis.total > 0
              ? `${analysis.total} policies across ${analysis.agents} agents.`
              : "Gaps, conflicts and policies with no effect."}
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-4">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}
