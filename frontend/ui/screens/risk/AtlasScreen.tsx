import { DataTable, type Column } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { useListController } from "../../patterns/list-controller";
import { EvidenceFrame } from "./components/EvidenceFrame";
import { EvidenceStatusBadge } from "./components/EvidenceStatusBadge";
import { formatDate, formatDateTime, type QueryState } from "./model";
import type { AtlasResponse, AtlasTechnique } from "./rest-types";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface AtlasScreenProps extends QueryState {
  capabilities: readonly string[];
  /** `GET threats/atlas`. */
  atlas: AtlasResponse | null;
  onRefresh?: () => void;
}

const COLUMNS = (t: Translate): Column<AtlasTechnique>[] => [
  {
    id: "technique",
    header: t("technique"),
    cell: (tech) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{tech.name}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {tech.id ?? t("mappingPending")}
        </span>
      </span>
    ),
    cellClassName: "max-w-xs",
  },
  {
    id: "control",
    header: t("controlAndBoundary"),
    cell: (tech) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-xs">{tech.control ?? t("none")}</span>
        <span className="truncate text-xs text-muted-foreground">
          {tech.enforcement_point}
        </span>
      </span>
    ),
    cellClassName: "max-w-xs",
  },
  {
    id: "owner",
    header: t("owner"),
    width: "w-28",
    cell: (tech) => tech.owner ?? t("unassigned"),
  },
  {
    id: "residual",
    header: t("residualRisk"),
    cell: (tech) => tech.residual_risk,
    cellClassName: "max-w-sm whitespace-normal text-sm text-muted-foreground",
  },
  {
    id: "evidence",
    header: t("evidence"),
    width: "w-48",
    cell: (tech) => (
      <span className="flex flex-col items-start gap-1">
        <EvidenceStatusBadge status={tech.evidence_status} />
        {tech.evidence_captured_at && (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(tech.evidence_captured_at)}
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
  const t = useTranslations("risk.atlasScreen");
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
        label={t("atlasTechniques")}
        controller={controller}
        columns={COLUMNS(t)}
        getRowId={(tech) => `${tech.id ?? "pending"}-${tech.name}`}
        empty={{
          title: t("noTechniquesMapped"),
          description: t("theAtlasMappingFileIn"),
        }}
      />
      {atlas && (
        <p className="text-xs text-muted-foreground">
          {atlas.retrieved_at
            ? t("sourceRetrieved", {
                source: atlas.source,
                revision: atlas.source_revision,
                date: formatDate(atlas.retrieved_at) ?? "",
              })
            : t("source", {
                source: atlas.source,
                revision: atlas.source_revision,
              })}
        </p>
      )}
    </EvidenceFrame>
  );
}
