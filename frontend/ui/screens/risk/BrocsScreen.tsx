import { List, ListItem } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { EvidenceFrame } from "./components/EvidenceFrame";
import { EvidenceStatusBadge } from "./components/EvidenceStatusBadge";
import { formatDateTime, type QueryState } from "./model";
import type { BrocsResponse } from "./rest-types";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface BrocsScreenProps extends QueryState {
  capabilities: readonly string[];
  /** `GET controls/brocs`. */
  brocs: BrocsResponse | null;
  onRefresh?: () => void;
}

const DOMAIN_LABEL = (t: Translate): Record<string, string> => ({
  build: t("build"),
  run: t("run"),
  observe: t("observe"),
  control: t("control"),
  secure: t("secure"),
});

/**
 * Evidence > BROCS: the five domains (Build, Run, Observe, Control, Secure),
 * the control that answers each, who owns it, what the customer still owns,
 * and the evidence on file. A diagnostic map, not a maturity score.
 */
export function BrocsScreen({
  capabilities,
  brocs,
  onRefresh,
  loading,
  error,
  onRetry,
}: BrocsScreenProps) {
  const t = useTranslations("risk.brocsScreen");
  return (
    <EvidenceFrame
      capabilities={capabilities}
      tab="brocs"
      disclaimer={brocs?.disclaimer}
      onRefresh={onRefresh}
      loading={loading}
      error={error}
      onRetry={onRetry}
    >
      <List
        label={t("brocsDomains")}
        items={brocs?.domains ?? []}
        loading={loading}
        loadingCount={5}
        getKey={(d) => d.id}
        empty={{
          title: t("noDomainsMapped"),
          description: t("theBrocsMappingFileIn"),
        }}
        renderItem={(d) => (
          <ListItem
            title={DOMAIN_LABEL(t)[d.id] ?? d.id}
            description={
              <span className="flex flex-col gap-0.5">
                <span>{d.control}</span>
                <span className="text-xs">
                  {t("yourPart", { part: d.customer_responsibility })}
                </span>
              </span>
            }
            meta={
              <span className="flex flex-col items-end text-xs text-muted-foreground">
                <span>{d.owner}</span>
                {d.evidence_captured_at && (
                  <span>{formatDateTime(d.evidence_captured_at)}</span>
                )}
              </span>
            }
            status={<EvidenceStatusBadge status={d.evidence_status} />}
          />
        )}
      />
      {brocs && (
        <p className="text-xs text-muted-foreground">
          {brocs.framework}, revision {brocs.source_revision}.
        </p>
      )}
    </EvidenceFrame>
  );
}
