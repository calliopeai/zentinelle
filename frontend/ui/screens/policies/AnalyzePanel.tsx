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
import { useTranslations } from "next-intl";

import { StatTile } from "./components/StatTile";
import { usePolicyLabels } from "./labels";
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
  const t = useTranslations("policies.analyzePanel");
  const { scopeLabel, typeLabel } = usePolicyLabels();
  const { Link } = useUI();
  let body: React.ReactNode;
  if (error)
    body = (
      <ErrorState
        title={t("couldNotAnalyzeThePolicies")}
        error={error}
        onRetry={onRetry}
      />
    );
  else if (loading || !analysis)
    body = <LoadingState label={t("analyzingThePolicies")} rows={4} />;
  else if (analysis.total === 0)
    body = (
      <EmptyState
        title={t("nothingToAnalyze")}
        description={t("coverageIsMeasuredOverThe")}
      />
    );
  else
    body = (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label={t("enforced")}
            value={analysis.enforced}
            hint={t("ofTotal", { total: analysis.total })}
          />
          <StatTile label={t("auditOnly")} value={analysis.auditOnly} />
          <StatTile
            label={t("offOrDisabled")}
            value={analysis.disabled}
            tone={analysis.disabled ? "warn" : undefined}
          />
          <StatTile
            label={t("typesCovered")}
            value={analysis.coveredTypes.length}
            hint={t("missingHint", { count: analysis.missingTypes.length })}
          />
        </div>
        <section>
          <h3 className="mb-1 text-sm font-semibold">
            {t("conflicts", { count: analysis.conflicts.length })}
          </h3>
          {analysis.conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noTwoLivePoliciesShare")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {analysis.conflicts.map((c) => (
                <li
                  key={`${c.type}-${c.scope}-${c.priority}`}
                  className="rounded-lg border border-warning-border bg-warning-bg p-2 text-warning-fg"
                >
                  <span className="font-medium">{c.names.join(", ")}</span>:{" "}
                  {t("conflict", {
                    type: typeLabel(c.type),
                    scope: scopeLabel(c.scope).toLowerCase(),
                    priority: c.priority,
                  })}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold">
            {t("doNothing", { count: analysis.issues.length })}
          </h3>
          {analysis.issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("everyPolicyIsOnAnd")}
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
                    {i.issues.map((key) => t(`issues.${key}`)).join(" ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold">
            {t("typesWithNoLivePolicy")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {analysis.missingTypes.map(typeLabel).sort().join(", ") ||
              t("none")}
          </p>
        </section>
      </div>
    );
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>{t("analyzeCoverage")}</DrawerTitle>
          <DrawerDescription>
            {analysis && analysis.total > 0
              ? t("across", { total: analysis.total, agents: analysis.agents })
              : t("gapsConflictsAndPoliciesWith")}
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-4">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}
