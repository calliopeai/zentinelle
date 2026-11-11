import {
  DataTable,
  StatusBadge,
  type Column,
  type TableController,
} from "@calliopelabs/ui";
import { MessagesSquareIcon } from "lucide-react";

import type { InteractionLogData } from "@/graphql/interactions/types";

import { formatNumber, formatTime, formatUsd } from "./format";

/** Long names wrap inside a bounded column instead of widening the table. */
const WRAP = "min-w-40 max-w-md whitespace-normal";

const COLUMNS: Column<InteractionLogData>[] = [
  {
    id: "when",
    header: "When",
    width: "w-44",
    cell: (i) => (
      <span className="font-mono text-xs whitespace-nowrap">
        {formatTime(i.occurredAt)}
      </span>
    ),
  },
  {
    id: "model",
    cellClassName: WRAP,
    header: "Model",
    cell: (i) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-xs [overflow-wrap:anywhere]">
          {i.aiModel ?? "Unknown"}
        </span>
        <span className="text-muted-foreground text-xs">
          {i.aiProvider ?? ""}
        </span>
      </span>
    ),
  },
  {
    id: "user",
    cellClassName: WRAP,
    header: "User",
    cell: (i) => (
      <span className="[overflow-wrap:anywhere]">{i.userIdentifier ?? ""}</span>
    ),
  },
  {
    id: "tokens",
    header: "Tokens",
    align: "right",
    cell: (i) => (
      <span className="font-mono tabular-nums">
        {formatNumber(i.totalTokens)}
      </span>
    ),
  },
  {
    id: "cost",
    header: "Est. cost",
    align: "right",
    cell: (i) => (
      <span className="font-mono tabular-nums">
        {formatUsd(i.estimatedCostUsd)}
      </span>
    ),
  },
  {
    id: "latency",
    header: "Latency",
    align: "right",
    cell: (i) =>
      i.latencyMs != null ? (
        <span className="font-mono tabular-nums">
          {formatNumber(i.latencyMs)} ms
        </span>
      ) : (
        <span className="text-muted-foreground">None</span>
      ),
  },
  {
    id: "outcome",
    header: "Outcome",
    cell: (i) =>
      i.wasBlocked ? (
        <StatusBadge tone="error">blocked</StatusBadge>
      ) : i.violationCount ? (
        <StatusBadge tone="warn">
          {i.violationCount}{" "}
          {i.violationCount === 1 ? "violation" : "violations"}
        </StatusBadge>
      ) : (
        <StatusBadge tone="ok">allowed</StatusBadge>
      ),
  },
];

export interface AgentInteractionsTabProps {
  /** GetInteractionLogs with this agent's endpointId. */
  table: TableController<InteractionLogData>;
}

/** Interactions: each model call the agent made, what it cost and whether policy stopped it. */
export function AgentInteractionsTab({ table }: AgentInteractionsTabProps) {
  return (
    <DataTable
      label="Agent interactions"
      controller={table}
      columns={COLUMNS}
      getRowId={(i) => i.id}
      empty={{
        icon: <MessagesSquareIcon />,
        title: "No interactions logged",
        description:
          "Model calls appear here once the agent sends traffic through Zentinelle AI.",
      }}
    />
  );
}
