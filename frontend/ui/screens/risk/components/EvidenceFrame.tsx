import { Button, ErrorState, PageFrame } from "@calliopelabs/ui";
import { RefreshCwIcon } from "lucide-react";
import type * as React from "react";

import { AccessState } from "../../../patterns/AccessState";
import {
  EVIDENCE_TABS,
  areaCrumb,
  isAdmin,
  tabsOf,
  type QueryState,
} from "../model";

export interface EvidenceFrameProps extends QueryState {
  capabilities: readonly string[];
  tab: (typeof EVIDENCE_TABS)[number]["key"];
  /** A control map's own caveat ("not certification"), shown before the body. */
  disclaimer?: string | null;
  onRefresh?: () => void;
  children: React.ReactNode;
}

/**
 * The frame of the three Evidence tabs: admin only, as the REST views are
 * (PortalAdminAccess). Any other role gets the clean 403 instead of a failed
 * request.
 */
export function EvidenceFrame({
  capabilities,
  tab,
  disclaimer,
  onRefresh,
  loading,
  error,
  onRetry,
  children,
}: EvidenceFrameProps) {
  const admin = isAdmin(capabilities);
  return (
    <PageFrame
      crumbs={[areaCrumb("evidence", capabilities)]}
      title="Evidence"
      tabs={admin ? tabsOf(EVIDENCE_TABS, tab) : undefined}
      tabsLabel="Evidence"
      description={
        admin
          ? "What was measured: control evidence and runtime observation, apart from configuration."
          : undefined
      }
      primaryAction={
        admin && onRefresh ? (
          <Button variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCwIcon aria-hidden />
            Refresh
          </Button>
        ) : undefined
      }
      notice={
        admin && disclaimer ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {disclaimer}
          </p>
        ) : undefined
      }
    >
      {!admin ? (
        <AccessState subject="Evidence" />
      ) : error ? (
        <ErrorState
          title="Could not load evidence"
          error={error}
          onRetry={onRetry}
        />
      ) : (
        children
      )}
    </PageFrame>
  );
}
