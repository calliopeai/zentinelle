import { DataTable, Section, StatusBadge, type Column } from "@calliopelabs/ui";
import { FileCheckIcon, RadarIcon } from "lucide-react";

import { useListController } from "../../patterns/list-controller";
import { StatGrid, StatTile } from "../../patterns/StatTile";
import { EvidenceFrame } from "./components/EvidenceFrame";
import { EvidenceStatusBadge } from "./components/EvidenceStatusBadge";
import { EVIDENCE_LABEL, formatDateTime, type QueryState } from "./model";
import type {
  ControlEvidenceResponse,
  EvidenceRecord,
  Workload,
} from "./rest-types";

export interface EvidenceCoverageScreenProps extends QueryState {
  capabilities: readonly string[];
  /** `GET evidence/controls`. */
  evidence: ControlEvidenceResponse | null;
  onRefresh?: () => void;
}

const WORKLOAD_COLUMNS: Column<Workload>[] = [
  {
    id: "agent",
    header: "Workload",
    cell: (w) => <span className="font-mono text-xs">{w.agent_id}</span>,
  },
  {
    id: "registered",
    header: "Registered",
    width: "w-28",
    cell: (w) => w.registered_status,
  },
  {
    id: "runtime",
    header: "Runtime evidence",
    width: "w-36",
    cell: (w) => (
      <StatusBadge tone={w.status === "observed" ? "ok" : "muted"}>
        {w.status === "observed" ? "Observed" : "Unknown"}
      </StatusBadge>
    ),
  },
  {
    id: "last",
    header: "Last observed",
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

const RECORD_COLUMNS: Column<EvidenceRecord>[] = [
  {
    id: "control",
    header: "Control",
    cell: (r) => <span className="font-mono text-xs">{r.control_id}</span>,
  },
  {
    id: "status",
    header: "Status",
    width: "w-44",
    cell: (r) => <EvidenceStatusBadge status={r.effective_status} />,
  },
  {
    id: "source",
    header: "Source",
    cell: (r) =>
      r.source || <span className="text-muted-foreground">Not recorded</span>,
    cellClassName: "max-w-xs truncate",
  },
  {
    id: "captured",
    header: "Captured",
    width: "w-48",
    cell: (r) => formatDateTime(r.captured_at),
  },
  {
    id: "expires",
    header: "Expires",
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
  const runtime = evidence?.runtime_coverage;
  const workloads = useListController(runtime?.workloads ?? [], {
    loading,
    error,
    retry: onRetry,
  });
  const records = useListController(evidence?.evidence ?? [], {
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
        <StatTile
          label="Registered workloads"
          loading={loading}
          value={runtime?.registered_workloads ?? null}
        />
        <StatTile
          label="Observed at runtime"
          loading={loading}
          value={runtime?.observed_workloads ?? null}
          tone={runtime ? "ok" : undefined}
          hint={
            formatDateTime(runtime?.coverage_as_of)
              ? `Last event ${formatDateTime(runtime?.coverage_as_of)}`
              : undefined
          }
        />
        <StatTile
          label="Never observed"
          loading={loading}
          value={runtime?.unobserved_workloads ?? null}
          tone={runtime?.unobserved_workloads ? "warn" : undefined}
          hint="Registered, with no runtime event"
        />
        <StatTile
          label="Verified operating"
          loading={loading}
          value={evidence ? `${operating} of ${total}` : null}
          hint="Evidence records"
        />
      </StatGrid>
      <Section title="Workload runtime coverage">
        <DataTable
          label="Workloads"
          controller={workloads}
          columns={WORKLOAD_COLUMNS}
          getRowId={(w) => w.endpoint_id}
          rowHref={(w) => `/agents/${encodeURIComponent(w.agent_id)}/activity`}
          rowLabel={(w) => w.agent_id}
          empty={{
            icon: (
              <RadarIcon className="size-5 text-muted-foreground" aria-hidden />
            ),
            title: "No registered workloads",
            description:
              "Workloads appear here once an agent registers with Zentinelle AI.",
            actionHref: "/agents",
            actionLabel: "Open Agents",
          }}
        />
      </Section>
      <Section
        title="Control evidence"
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
          label="Evidence records"
          controller={records}
          columns={RECORD_COLUMNS}
          getRowId={(r) => r.id}
          empty={{
            icon: (
              <FileCheckIcon
                className="size-5 text-muted-foreground"
                aria-hidden
              />
            ),
            title: "No control evidence on record",
            description:
              "CI and operators record evidence through the evidence API; until then every control reads as unverified.",
          }}
        />
      </Section>
    </EvidenceFrame>
  );
}
