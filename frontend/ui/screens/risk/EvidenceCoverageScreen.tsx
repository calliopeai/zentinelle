import {
  DataTable,
  useLocalTable,
  Section,
  StatusBadge,
  type Column,
  Stat,
  StatGrid,
} from "@calliopelabs/ui";
import { FileCheckIcon, RadarIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { EvidenceFrame } from "./components/EvidenceFrame";
import { EvidenceStatusBadge } from "./components/EvidenceStatusBadge";
import { formatDateTime, type QueryState, useRiskLabels } from "./model";
import type {
  ControlEvidenceResponse,
  EvidenceRecord,
  Workload,
} from "./rest-types";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface EvidenceCoverageScreenProps extends QueryState {
  capabilities: readonly string[];
  /** `GET evidence/controls`. */
  evidence: ControlEvidenceResponse | null;
  onRefresh?: () => void;
}

const WORKLOAD_COLUMNS = (t: Translate): Column<Workload>[] => [
  {
    id: "agent",
    header: t("workload"),
    cell: (w) => <span className="font-mono text-xs">{w.agent_id}</span>,
  },
  {
    id: "registered",
    header: t("registered"),
    width: "w-28",
    cell: (w) => w.registered_status,
  },
  {
    id: "runtime",
    header: t("runtimeEvidence"),
    width: "w-36",
    cell: (w) => (
      <StatusBadge tone={w.status === "observed" ? "ok" : "muted"}>
        {w.status === "observed" ? t("observed") : t("unknown")}
      </StatusBadge>
    ),
  },
  {
    id: "last",
    header: t("lastObserved"),
    width: "w-52",
    cell: (w) =>
      w.last_observed_at ? (
        <span className="flex flex-col">
          <span>{formatDateTime(w.last_observed_at)}</span>
          {w.last_event_type && (
            <span className="font-mono text-xs text-muted-foreground">
              {w.last_event_type}
            </span>
          )}
        </span>
      ) : (
        <span className="text-muted-foreground">Never</span>
      ),
  },
];

const RECORD_COLUMNS = (t: Translate): Column<EvidenceRecord>[] => [
  {
    id: "control",
    header: t("control"),
    cell: (r) => <span className="font-mono text-xs">{r.control_id}</span>,
  },
  {
    id: "status",
    header: t("status"),
    width: "w-44",
    cell: (r) => <EvidenceStatusBadge status={r.effective_status} />,
  },
  {
    id: "source",
    header: t("source"),
    cell: (r) =>
      r.source || <span className="text-muted-foreground">Not recorded</span>,
    cellClassName: "max-w-xs truncate",
  },
  {
    id: "captured",
    header: t("captured"),
    width: "w-48",
    cell: (r) => formatDateTime(r.captured_at),
  },
  {
    id: "expires",
    header: t("expires"),
    width: "w-48",
    cell: (r) =>
      formatDateTime(r.expires_at) ?? (
        <span className="text-muted-foreground">No expiry</span>
      ),
  },
];

/**
 * Evidence > Coverage: which registered workloads Zentinelle AI has actually
 * seen at runtime, and the control evidence on record. Unknown means no
 * event was observed, never that a control holds.
 */
export function EvidenceCoverageScreen({
  capabilities,
  evidence,
  onRefresh,
  loading,
  error,
  onRetry,
}: EvidenceCoverageScreenProps) {
  const t = useTranslations("risk.evidenceCoverageScreen");
  const { EVIDENCE_LABEL } = useRiskLabels();
  const runtime = evidence?.runtime_coverage;
  const workloads = useLocalTable(runtime?.workloads ?? [], {
    loading,
    error,
    retry: onRetry,
  });
  const records = useLocalTable(evidence?.evidence ?? [], {
    loading,
    error,
    retry: onRetry,
    pageSize: 10,
  });
  const operating = evidence?.coverage["verified-operating"] ?? 0;
  const total = evidence
    ? Object.values(evidence.coverage).reduce((a, b) => a + b, 0)
    : 0;
  return (
    <EvidenceFrame
      capabilities={capabilities}
      tab="coverage"
      onRefresh={onRefresh}
      loading={loading}
      error={error}
      onRetry={onRetry}
    >
      <StatGrid>
        <Stat
          label={t("registeredWorkloads")}
          loading={loading}
          value={runtime?.registered_workloads ?? null}
        />
        <Stat
          label={t("observedAtRuntime")}
          loading={loading}
          value={runtime?.observed_workloads ?? null}
          tone={runtime ? "ok" : undefined}
          hint={
            formatDateTime(runtime?.coverage_as_of)
              ? t("lastEvent", {
                  time: formatDateTime(runtime?.coverage_as_of) ?? "",
                })
              : undefined
          }
        />
        <Stat
          label={t("neverObserved")}
          loading={loading}
          value={runtime?.unobserved_workloads ?? null}
          tone={runtime?.unobserved_workloads ? "warn" : undefined}
          hint={t("registeredWithNoRuntimeEvent")}
        />
        <Stat
          label={t("verifiedOperating")}
          loading={loading}
          value={evidence ? `${operating} of ${total}` : null}
          hint={t("evidenceRecords")}
        />
      </StatGrid>
      <Section title={t("workloadRuntimeCoverage")}>
        <DataTable
          label={t("workloads")}
          controller={workloads}
          columns={WORKLOAD_COLUMNS(t)}
          getRowId={(w) => w.endpoint_id}
          rowHref={(w) => `/agents/${encodeURIComponent(w.agent_id)}/activity`}
          rowLabel={(w) => w.agent_id}
          empty={{
            icon: (
              <RadarIcon className="size-5 text-muted-foreground" aria-hidden />
            ),
            title: t("noRegisteredWorkloads"),
            description: t("workloadsAppearHereOnceAn"),
            actionHref: "/agents",
            actionLabel: t("openAgents"),
          }}
        />
      </Section>
      <Section
        title={t("controlEvidence")}
        description={
          evidence
            ? Object.entries(evidence.coverage)
                .filter(([, n]) => n > 0)
                .map(
                  ([status, n]) =>
                    `${n} ${(EVIDENCE_LABEL[status] ?? status).toLowerCase()}`,
                )
                .join(", ") || undefined
            : undefined
        }
      >
        <DataTable
          label={t("evidenceRecords")}
          controller={records}
          columns={RECORD_COLUMNS(t)}
          getRowId={(r) => r.id}
          empty={{
            icon: (
              <FileCheckIcon
                className="size-5 text-muted-foreground"
                aria-hidden
              />
            ),
            title: t("noControlEvidenceOnRecord"),
            description: t("ciAndOperatorsRecordEvidence"),
          }}
        />
      </Section>
    </EvidenceFrame>
  );
}
