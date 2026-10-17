"use client";

import { useComplianceAlerts } from "@/graphql/alerts/hooks";
import { useDashboardStats } from "@/graphql/dashboard/hooks";
import { useRiskStats } from "@/graphql/risks/hooks";

import { OverviewScreen } from "./OverviewScreen";
import { toOverview } from "./overview-model";

export interface OverviewConnectedProps {
  canMutate: boolean;
  /** REST counts with no client yet; absent, their rows stay out. */
  pendingApprovals?: number | null;
  stagedChanges?: number | null;
  now?: Date;
}

/**
 * The Overview on the app's own hooks: what `app/(app)/dashboard/page.tsx`
 * will render once the area is assembled. Three queries today; one
 * Overview query on the server is the follow-up (ui-overhaul-ia §6 step 9).
 */
export function OverviewConnected({
  canMutate,
  pendingApprovals,
  stagedChanges,
  now,
}: OverviewConnectedProps) {
  const dashboard = useDashboardStats();
  const risk = useRiskStats();
  const alerts = useComplianceAlerts({ status: "open" });

  // Wait for all three, so a tile never reads "not available" while its
  // query is merely slower than the headline.
  const settled = !dashboard.loading && !risk.loading && !alerts.loading;
  const data =
    settled && dashboard.data !== undefined
      ? toOverview({
          stats: dashboard.stats,
          riskStats: risk.stats,
          openAlerts: alerts.alerts,
          pendingApprovals,
          stagedChanges,
        })
      : null;

  return (
    <OverviewScreen
      data={data}
      loading={!settled}
      error={dashboard.error ?? null}
      attentionError={risk.error ?? alerts.error ?? null}
      canMutate={canMutate}
      onRetry={() => {
        void dashboard.refetch();
        void risk.refetch();
        void alerts.refetch();
      }}
      now={now}
    />
  );
}
