import { Button, ErrorState, PageFrame } from "@calliopelabs/ui";
import { RefreshCwIcon } from "lucide-react";
import type * as React from "react";
import { useTranslations } from "next-intl";

import { AccessState } from "../../../patterns/AccessState";
import {
  areaCrumb,
  isAdmin,
  tabsOf,
  type QueryState,
  EVIDENCE_TABS_ROUTES,
  useRiskLabels,
} from "../model";

export interface EvidenceFrameProps extends QueryState {
  capabilities: readonly string[];
  tab: (typeof EVIDENCE_TABS_ROUTES)[number]["key"];
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
  const t = useTranslations("risk.evidenceFrame");
  const { EVIDENCE_TABS } = useRiskLabels();
  const admin = isAdmin(capabilities);
  return (
    <PageFrame
      crumbs={[areaCrumb("evidence", capabilities)]}
      title={t("evidence")}
      tabs={admin ? tabsOf(EVIDENCE_TABS, tab) : undefined}
      tabsLabel={t("evidence")}
      description={admin ? t("whatWasMeasuredControlEvidence") : undefined}
      primaryAction={
        admin && onRefresh ? (
          <Button variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCwIcon aria-hidden />
            {t("refresh")}
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
          title={t("couldNotLoadEvidence")}
          error={error}
          onRetry={onRetry}
        />
      ) : (
        children
      )}
    </PageFrame>
  );
}
