import {
  DataTable,
  StatusBadge,
  type Column,
  type StatusTone,
  type TableController,
} from "@calliopelabs/ui";
import { ActivityIcon } from "lucide-react";

import type { EventData } from "@/graphql/events/types";

import { formatTime, toneOf, words } from "./format";

/** Long names wrap inside a bounded column instead of widening the table. */
const WRAP = "min-w-40 max-w-md whitespace-normal";

const EVENT_STATUS_TONE: Record<string, StatusTone> = {
  processed: "ok",
  pending: "info",
  failed: "error",
};

const COLUMNS: Column<EventData>[] = [
  {
    id: "when",
    header: "When",
    width: "w-44",
    cell: (e) => (
      <span className="font-mono text-xs whitespace-nowrap">
        {formatTime(e.occurredAt)}
      </span>
    ),
  },
  {
    id: "type",
    cellClassName: WRAP,
    header: "Event",
    cell: (e) => (
      <span className="font-medium [overflow-wrap:anywhere]">
        {words(e.eventType)}
      </span>
    ),
  },
  { id: "category", header: "Category", cell: (e) => words(e.eventCategory) },
  {
    id: "user",
    cellClassName: WRAP,
    header: "User",
    cell: (e) =>
      e.userIdentifier ? (
        <span className="[overflow-wrap:anywhere]">{e.userIdentifier}</span>
      ) : (
        <span className="text-muted-foreground">None</span>
      ),
  },
  {
    id: "status",
    header: "Status",
    width: "w-28",
    cell: (e) => (
      <StatusBadge tone={toneOf(EVENT_STATUS_TONE, e.status)}>
        {words(e.status)}
      </StatusBadge>
    ),
  },
];

export interface AgentActivityTabProps {
  /** GetEvents with this agent's endpointId, newest first. */
  table: TableController<EventData>;
}

/** Activity: the events this agent reported, refreshed as they arrive. */
export function AgentActivityTab({ table }: AgentActivityTabProps) {
  return (
    <DataTable
      label="Agent events"
      controller={table}
      columns={COLUMNS}
      getRowId={(e) => e.id}
      empty={{
        icon: <ActivityIcon />,
        title: "No events yet",
        description:
          "Events appear here as the agent reports tool calls, policy checks and errors.",
      }}
    />
  );
}
