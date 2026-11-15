import {
  DataTable,
  StatusBadge,
  type Column,
  type TableController,
} from "@calliopelabs/ui";
import { ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ContentViolationData } from "@/graphql/content-scanner/types";

import { SEVERITY_TONE, formatTime, toneOf, words } from "./format";

/** Long names wrap inside a bounded column instead of widening the table. */
const WRAP = "min-w-40 max-w-md whitespace-normal";

function columns(
  t: ReturnType<typeof useTranslations>,
): Column<ContentViolationData>[] {
  return [
    {
      id: "when",
      header: t("columns.when"),
      width: "w-44",
      cell: (v) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {formatTime(v.createdAt)}
        </span>
      ),
    },
    {
      id: "rule",
      cellClassName: WRAP,
      header: t("columns.rule"),
      cell: (v) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium [overflow-wrap:anywhere]">
            {v.ruleName ?? t("unnamedRule")}
          </span>
          <span className="text-muted-foreground text-xs">
            {v.ruleTypeDisplay ?? words(v.ruleType)}
          </span>
        </span>
      ),
    },
    {
      id: "severity",
      header: t("columns.severity"),
      width: "w-28",
      cell: (v) => (
        <StatusBadge tone={toneOf(SEVERITY_TONE, v.severity)}>
          {(v.severityDisplay ?? v.severity).toLowerCase()}
        </StatusBadge>
      ),
    },
    {
      id: "action",
      header: t("columns.action"),
      width: "w-28",
      cell: (v) =>
        v.wasBlocked
          ? t("blocked")
          : v.wasRedacted
            ? t("redacted")
            : t("logged"),
    },
  ];
}

export interface AgentComplianceTabProps {
  /** GetContentViolations with this agent's endpointId. */
  table: TableController<ContentViolationData>;
  /** Detections in Policies, Content rules, filtered to this agent. */
  detectionsHref: string;
}

/** Compliance: content rule violations this agent triggered. */
export function AgentComplianceTab({
  table,
  detectionsHref,
}: AgentComplianceTabProps) {
  const t = useTranslations("agents.compliance");
  return (
    <DataTable
      label={t("label")}
      controller={table}
      columns={columns(t)}
      getRowId={(v) => v.id}
      empty={{
        icon: <ShieldCheckIcon />,
        title: t("empty.title"),
        description: t("empty.description"),
        learnMoreHref: detectionsHref,
        learnMoreLabel: t("empty.learnMore"),
      }}
    />
  );
}
