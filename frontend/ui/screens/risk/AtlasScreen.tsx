import { DataTable, type Column } from "@calliopelabs/ui";

import { useListController } from "../../patterns/list-controller";
import { EvidenceFrame } from "./components/EvidenceFrame";
import { EvidenceStatusBadge } from "./components/EvidenceStatusBadge";
import { formatDate, formatDateTime, type QueryState } from "./model";
import type { AtlasResponse, AtlasTechnique } from "./rest-types";

export interface AtlasScreenProps extends QueryState {
  capabilities: readonly string[];
  /** `GET threats/atlas`. */
  atlas: AtlasResponse | null;
  onRefresh?: () => void;
}

const COLUMNS: Column<AtlasTechnique>[] = [
  {
    id: "technique",
    header: "Technique",
    cell: (t) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{t.name}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {t.id ?? "Mapping pending"}
        </span>
      </span>
    ),
    cellClassName: "max-w-xs",
  },
  {
    id: "control",
    header: "Control and boundary",
    cell: (t) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-xs">{t.control ?? "None"}</span>
        <span className="truncate text-xs text-muted-foreground">
          {t.enforcement_point}
        </span>
      </span>
    ),
    cellClassName: "max-w-xs",
  },
  {
    id: "owner",
    header: "Owner",
    width: "w-28",
    cell: (t) => t.owner ?? "Unassigned",
  },
  {
    id: "residual",
    header: "Residual risk",
    cell: (t) => t.residual_risk,
    cellClassName: "max-w-sm whitespace-normal text-sm text-muted-foreground",
  },
  {
    id: "evidence",
    header: "Evidence",
    width: "w-48",
    cell: (t) => (
      <span className="flex flex-col items-start gap-1">
        <EvidenceStatusBadge status={t.evidence_status} />
        {t.evidence_captured_at && (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(t.evidence_captured_at)}
          </span>
        )}
      </span>
    ),
  },
];

/**
 * Evidence > MITRE ATLAS: each technique Zentinelle AI maps, the control and
 * boundary that answer it, the risk that remains, and the evidence on file.
 * A mapping with no evidence reads as unverified.
 */
export function AtlasScreen({
  capabilities,
  atlas,
  onRefresh,
  loading,
  error,
  onRetry,
}: AtlasScreenProps) {
  const controller = useListController(atlas?.techniques ?? [], {
    loading,
    error,
    retry: onRetry,
  });
  return (
    <EvidenceFrame
      capabilities={capabilities}
      tab="atlas"
      disclaimer={atlas?.disclaimer}
      onRefresh={onRefresh}
      loading={loading}
      error={error}
      onRetry={onRetry}
    >
      <DataTable
        label="ATLAS techniques"
        controller={controller}
        columns={COLUMNS}
        getRowId={(t) => `${t.id ?? "pending"}-${t.name}`}
        empty={{
          title: "No techniques mapped",
          description: "The ATLAS mapping file in this installation is empty.",
        }}
      />
      {atlas && (
        <p className="text-xs text-muted-foreground">
          {atlas.source}, revision {atlas.source_revision}
          {atlas.retrieved_at
            ? `, retrieved ${formatDate(atlas.retrieved_at)}`
            : ""}
          .
        </p>
      )}
    </EvidenceFrame>
  );
}
