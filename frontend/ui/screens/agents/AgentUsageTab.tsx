import { EmptyState, ErrorState, LoadingState } from "@calliopelabs/ui";
import { BarChart3Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { UsageSummary } from "@/graphql/usage/types";

import { StatTile } from "../../shared/StatTile";
import { formatNumber, formatUsd } from "./format";

export interface AgentUsageTabProps {
  /** GetUsageMetrics' summary for this agent's endpointId; null when nothing was recorded. */
  summary: UsageSummary | null;
  loading: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** The window the summary covers, as the query asked, in words ("Last 30 days"). */
  window: string;
  /** The Usage area, filtered to this agent. */
  usageHref: string;
}

/** Usage: what the agent spent, from the server's aggregate. Cost is an estimate from registry prices. */
export function AgentUsageTab({
  summary,
  loading,
  error,
  onRetry,
  window,
  usageHref,
}: AgentUsageTabProps) {
  const t = useTranslations("agents.usage");
  if (error)
    return <ErrorState title={t("error")} error={error} onRetry={onRetry} />;
  if (loading) return <LoadingState label={t("loading")} variant="page" />;
  if (!summary || !summary.totalApiCalls)
    return (
      <EmptyState
        icon={<BarChart3Icon />}
        title={t("empty.title")}
        description={t("empty.description", { window: window.toLowerCase() })}
        actionHref={usageHref}
        actionLabel={t("empty.action")}
      />
    );
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile
        label={t("apiCalls")}
        value={formatNumber(summary.totalApiCalls)}
        hint={window}
        href={usageHref}
      />
      <StatTile
        label={t("tokens")}
        value={formatNumber(summary.totalTokens)}
        hint={window}
        href={usageHref}
      />
      <StatTile
        label={t("cost")}
        value={formatUsd(summary.totalCost)}
        hint={t("costHint", { window })}
        href={usageHref}
      />
    </div>
  );
}
