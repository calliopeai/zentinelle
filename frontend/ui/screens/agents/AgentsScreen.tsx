import {
  Button,
  DataTable,
  DropdownMenuItem,
  DropdownMenuSeparator,
  PageFrame,
  StatusBadge,
  areaSwitcher,
  type Column,
  type TableController,
} from "@calliopelabs/ui";
import { BotIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";

import { navFor } from "../../product";
import { FilterSelect } from "../../shared/FilterSelect";
import {
  AGENT_HEALTH_TONE,
  AGENT_STATUS_TONE,
  agentHref,
  formatTime,
  toneOf,
  useAgentLabels,
  type AgentRow,
} from "./format";

export interface AgentsScreenProps {
  /** The rows, paged; from GetEndpoints. */
  table: TableController<AgentRow>;
  /** The server filters (GetEndpoints `status` and `agentType`); "" is no filter. */
  filters: { status: string; agentType: string };
  onFiltersChange: (filters: { status: string; agentType: string }) => void;
  /** `/auth/me` capabilities; without `mutate` the screen is read-only. */
  capabilities: readonly string[];
  onRegister: () => void;
  onEdit: (agent: AgentRow) => void;
  onAssignGroup: (agent: AgentRow) => void;
  onSuspend: (agent: AgentRow) => void;
  onActivate: (agent: AgentRow) => void;
  onRegenerateKey: (agent: AgentRow) => void;
  onDelete: (agent: AgentRow) => void;
  /** A failed action's message, above the list. */
  notice?: React.ReactNode;
}

/** Long names wrap inside a bounded column instead of widening the table. */
const WRAP = "min-w-40 max-w-md whitespace-normal";

type Labels = ReturnType<typeof useAgentLabels>;
type Translate = ReturnType<typeof useTranslations>;

function columns(
  t: Translate,
  c: Translate,
  labels: Labels,
): Column<AgentRow>[] {
  return [
    {
      id: "name",
      cellClassName: WRAP,
      header: t("columns.agent"),
      cell: (a) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium [overflow-wrap:anywhere]">{a.name}</span>
          <span className="text-muted-foreground font-mono text-xs [overflow-wrap:anywhere]">
            {a.agentId}
          </span>
        </span>
      ),
    },
    {
      id: "status",
      header: t("columns.status"),
      width: "w-32",
      cell: (a) => (
        <StatusBadge
          tone={toneOf(AGENT_STATUS_TONE, a.status)}
          pulse={a.status === "provisioning"}
        >
          {labels.status(a.status)}
        </StatusBadge>
      ),
    },
    {
      id: "health",
      header: t("columns.health"),
      width: "w-28",
      cell: (a) => (
        <StatusBadge tone={toneOf(AGENT_HEALTH_TONE, a.health)}>
          {labels.health(a.health)}
        </StatusBadge>
      ),
    },
    {
      id: "type",
      header: t("columns.type"),
      cell: (a) => labels.type(a.agentType),
    },
    {
      id: "group",
      cellClassName: WRAP,
      header: t("columns.group"),
      cell: (a) =>
        a.group ? (
          <span className="[overflow-wrap:anywhere]">{a.group.name}</span>
        ) : (
          <span className="text-muted-foreground">{c("none")}</span>
        ),
    },
    {
      id: "heartbeat",
      header: t("columns.heartbeat"),
      cell: (a) =>
        a.lastHeartbeat ? (
          <span className="font-mono text-xs whitespace-nowrap">
            {formatTime(a.lastHeartbeat)}
          </span>
        ) : (
          <span className="text-muted-foreground">{c("never")}</span>
        ),
    },
  ];
}

function AgentCard({ agent: a, labels }: { agent: AgentRow; labels: Labels }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
          {a.name}
        </span>
        <StatusBadge tone={toneOf(AGENT_STATUS_TONE, a.status)}>
          {labels.status(a.status)}
        </StatusBadge>
      </div>
      <span className="text-muted-foreground font-mono text-xs [overflow-wrap:anywhere]">
        {a.agentId}
      </span>
      <span className="text-muted-foreground text-xs">
        {labels.type(a.agentType)}
        {a.group ? `, ${a.group.name}` : ""}
      </span>
    </div>
  );
}

/**
 * Agents (ui-overhaul-ia §4.1): every registered agent, filtered on the
 * server, each row a link to the agent's page at its Astrolift deeplink
 * path. Operators register, edit, group, suspend and remove agents from
 * here; viewers read.
 */
export function AgentsScreen({
  table,
  filters,
  onFiltersChange,
  capabilities,
  onRegister,
  onEdit,
  onAssignGroup,
  onSuspend,
  onActivate,
  onRegenerateKey,
  onDelete,
  notice,
}: AgentsScreenProps) {
  const t = useTranslations("agents.list");
  const c = useTranslations("common");
  const labels = useAgentLabels();
  const canMutate = capabilities.includes("mutate");
  const nav = navFor(capabilities);
  return (
    <PageFrame
      crumbs={[areaSwitcher(nav, "agents", "agents")]}
      title={t("title")}
      notice={notice}
      description={t("description")}
      primaryAction={
        canMutate ? (
          <Button size="sm" onClick={onRegister}>
            <PlusIcon aria-hidden />
            {t("register")}
          </Button>
        ) : undefined
      }
    >
      {/* The demo tour's "agents-table" step points here. */}
      <div data-tour="agents-table" className="min-w-0">
        <DataTable
          label={t("tableLabel")}
          controller={table}
          columns={columns(t, c, labels)}
          getRowId={(a) => a.id}
          rowHref={(a) => agentHref(a.agentId)}
          rowLabel={(a) => t("rowLabel", { name: a.name })}
          renderCard={(a) => <AgentCard agent={a} labels={labels} />}
          searchPlaceholder={t("search")}
          toolbar={
            <>
              <FilterSelect
                label={t("filters.status")}
                value={filters.status}
                options={labels.statusOptions}
                onChange={(status) => onFiltersChange({ ...filters, status })}
              />
              <FilterSelect
                label={t("filters.type")}
                value={filters.agentType}
                options={labels.typeOptions}
                onChange={(agentType) =>
                  onFiltersChange({ ...filters, agentType })
                }
              />
            </>
          }
          rowActions={
            canMutate
              ? (a) => (
                  <>
                    <DropdownMenuItem onSelect={() => onEdit(a)}>
                      {c("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onAssignGroup(a)}>
                      {t("actions.assignGroup")}
                    </DropdownMenuItem>
                    {a.status === "suspended" ? (
                      <DropdownMenuItem onSelect={() => onActivate(a)}>
                        {t("actions.activate")}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => onSuspend(a)}>
                        {t("actions.suspend")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => onRegenerateKey(a)}>
                      {t("actions.regenerateKey")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onDelete(a)}
                    >
                      {c("delete")}
                    </DropdownMenuItem>
                  </>
                )
              : undefined
          }
          empty={{
            icon: <BotIcon />,
            title: t("empty.title"),
            description: canMutate ? t("empty.canMutate") : t("empty.readOnly"),
          }}
          emptyFiltered={{
            title: t("emptyFiltered.title"),
            description: t("emptyFiltered.description"),
          }}
        />
      </div>
    </PageFrame>
  );
}
