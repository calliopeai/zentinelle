import { EmptyState, ErrorState, LoadingState } from "@calliopelabs/ui";
import { BarChart3Icon } from "lucide-react";

import type { UsageSummary } from "@/graphql/usage/types";

import { StatTile } from "../../shared/StatTile";
import { formatNumber, formatUsd } from "./format";

export interface AgentUsageTabProps {
  /** GetUsageMetrics' summary for this agent's endpointId; null when nothing was recorded. */
  summary: UsageSummary | null;
  loading: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** The window the summary covers, as the query asked ("Last 30 days"). */
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
  if (error)
    return (
      <ErrorState
        title="Could not load usage"
        error={error}
        onRetry={onRetry}
      />
    );
  if (loading) return <LoadingState label="Loading usage" variant="page" />;
  if (!summary || !summary.totalApiCalls)
    return (
      <EmptyState
        icon={<BarChart3Icon />}
        title="No usage recorded"
        description={`The agent made no metered calls in this window (${window.toLowerCase()}).`}
        actionHref={usageHref}
        actionLabel="Open Usage"
      />
    );
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile
        label="API calls"
        value={formatNumber(summary.totalApiCalls)}
        hint={window}
        href={usageHref}
      />
      <StatTile
        label="Tokens"
        value={formatNumber(summary.totalTokens)}
        hint={window}
        href={usageHref}
      />
      <StatTile
        label="Cost"
        value={formatUsd(summary.totalCost)}
        hint={`${window}, estimated from registry prices`}
        href={usageHref}
      />
    </div>
  );
}
