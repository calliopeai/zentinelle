import {
  DataTable,
  StatusBadge,
  type Column,
  type TableController,
} from "@calliopelabs/ui";
import { ShieldCheckIcon } from "lucide-react";

import type { ContentViolationData } from "@/graphql/content-scanner/types";

import { SEVERITY_TONE, formatTime, toneOf, words } from "./format";

/** Long names wrap inside a bounded column instead of widening the table. */
const WRAP = "min-w-40 max-w-md whitespace-normal";

const COLUMNS: Column<ContentViolationData>[] = [
  {
    id: "when",
    header: "When",
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
    header: "Rule",
    cell: (v) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-medium [overflow-wrap:anywhere]">
          {v.ruleName ?? "Unnamed rule"}
        </span>
        <span className="text-muted-foreground text-xs">
          {v.ruleTypeDisplay ?? words(v.ruleType)}
        </span>
      </span>
    ),
  },
  {
    id: "severity",
    header: "Severity",
    width: "w-28",
    cell: (v) => (
      <StatusBadge tone={toneOf(SEVERITY_TONE, v.severity)}>
        {(v.severityDisplay ?? v.severity).toLowerCase()}
      </StatusBadge>
    ),
  },
  {
    id: "action",
    header: "Action",
    width: "w-28",
    cell: (v) =>
      v.wasBlocked ? "Blocked" : v.wasRedacted ? "Redacted" : "Logged",
  },
];

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
  return (
    <DataTable
      label="Agent violations"
      controller={table}
      columns={COLUMNS}
      getRowId={(v) => v.id}
      empty={{
        icon: <ShieldCheckIcon />,
        title: "No violations",
        description: "No content rule has flagged this agent's traffic.",
        learnMoreHref: detectionsHref,
        learnMoreLabel: "All detections",
      }}
    />
  );
}
