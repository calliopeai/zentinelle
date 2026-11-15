import {
  DataTable,
  StatusBadge,
  type Column,
  type TableController,
} from "@calliopelabs/ui";
import { MessagesSquareIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { InteractionLogData } from "@/graphql/interactions/types";

import { formatNumber, formatTime, formatUsd } from "./format";

/** Long names wrap inside a bounded column instead of widening the table. */
const WRAP = "min-w-40 max-w-md whitespace-normal";

function columns(
  t: ReturnType<typeof useTranslations>,
  none: string,
): Column<InteractionLogData>[] {
  return [
    {
      id: "when",
      header: t("columns.when"),
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
      header: t("columns.model"),
      cell: (i) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-xs [overflow-wrap:anywhere]">
            {i.aiModel ?? t("unknownModel")}
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
      header: t("columns.user"),
      cell: (i) => (
        <span className="[overflow-wrap:anywhere]">
          {i.userIdentifier ?? ""}
        </span>
      ),
    },
    {
      id: "tokens",
      header: t("columns.tokens"),
      align: "right",
      cell: (i) => (
        <span className="font-mono tabular-nums">
          {formatNumber(i.totalTokens)}
        </span>
      ),
    },
    {
      id: "cost",
      header: t("columns.cost"),
      align: "right",
      cell: (i) => (
        <span className="font-mono tabular-nums">
          {formatUsd(i.estimatedCostUsd)}
        </span>
      ),
    },
    {
      id: "latency",
      header: t("columns.latency"),
      align: "right",
      cell: (i) =>
        i.latencyMs != null ? (
          <span className="font-mono tabular-nums">
            {t("latency", { ms: formatNumber(i.latencyMs) })}
          </span>
        ) : (
          <span className="text-muted-foreground">{none}</span>
        ),
    },
    {
      id: "outcome",
      header: t("columns.outcome"),
      cell: (i) =>
        i.wasBlocked ? (
          <StatusBadge tone="error">{t("blocked")}</StatusBadge>
        ) : i.violationCount ? (
          <StatusBadge tone="warn">
            {t("violations", { count: i.violationCount })}
          </StatusBadge>
        ) : (
          <StatusBadge tone="ok">{t("allowed")}</StatusBadge>
        ),
    },
  ];
}

export interface AgentInteractionsTabProps {
  /** GetInteractionLogs with this agent's endpointId. */
  table: TableController<InteractionLogData>;
}

/** Interactions: each model call the agent made, what it cost and whether policy stopped it. */
export function AgentInteractionsTab({ table }: AgentInteractionsTabProps) {
  const t = useTranslations("agents.interactions");
  const c = useTranslations("common");
  return (
    <DataTable
      label={t("label")}
      controller={table}
      columns={columns(t, c("none"))}
      getRowId={(i) => i.id}
      empty={{
        icon: <MessagesSquareIcon />,
        title: t("empty.title"),
        description: t("empty.description"),
      }}
    />
  );
}
