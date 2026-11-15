import {
  DataTable,
  StatusBadge,
  type Column,
  type StatusTone,
  type TableController,
} from "@calliopelabs/ui";
import { ActivityIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { EventData } from "@/graphql/events/types";

import { formatTime, toneOf, words } from "./format";

/** Long names wrap inside a bounded column instead of widening the table. */
const WRAP = "min-w-40 max-w-md whitespace-normal";

const EVENT_STATUS_TONE: Record<string, StatusTone> = {
  processed: "ok",
  pending: "info",
  failed: "error",
};

function columns(
  t: ReturnType<typeof useTranslations>,
  none: string,
): Column<EventData>[] {
  return [
    {
      id: "when",
      header: t("columns.when"),
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
      header: t("columns.event"),
      cell: (e) => (
        <span className="font-medium [overflow-wrap:anywhere]">
          {words(e.eventType)}
        </span>
      ),
    },
    {
      id: "category",
      header: t("columns.category"),
      cell: (e) => words(e.eventCategory),
    },
    {
      id: "user",
      cellClassName: WRAP,
      header: t("columns.user"),
      cell: (e) =>
        e.userIdentifier ? (
          <span className="[overflow-wrap:anywhere]">{e.userIdentifier}</span>
        ) : (
          <span className="text-muted-foreground">{none}</span>
        ),
    },
    {
      id: "status",
      header: t("columns.status"),
      width: "w-28",
      cell: (e) => (
        <StatusBadge tone={toneOf(EVENT_STATUS_TONE, e.status)}>
          {words(e.status)}
        </StatusBadge>
      ),
    },
  ];
}

export interface AgentActivityTabProps {
  /** GetEvents with this agent's endpointId, newest first. */
  table: TableController<EventData>;
}

/** Activity: the events this agent reported, refreshed as they arrive. */
export function AgentActivityTab({ table }: AgentActivityTabProps) {
  const t = useTranslations("agents.activity");
  const c = useTranslations("common");
  return (
    <DataTable
      label={t("label")}
      controller={table}
      columns={columns(t, c("none"))}
      getRowId={(e) => e.id}
      empty={{
        icon: <ActivityIcon />,
        title: t("empty.title"),
        description: t("empty.description"),
      }}
    />
  );
}
