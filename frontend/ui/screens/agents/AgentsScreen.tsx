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
import type * as React from "react";

import { navFor } from "../../product";
import { FilterSelect } from "../../shared/FilterSelect";
import {
  AGENT_HEALTH_TONE,
  AGENT_STATUSES,
  AGENT_STATUS_TONE,
  AGENT_TYPES,
  agentHref,
  agentTypeLabel,
  formatTime,
  toneOf,
  words,
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

const COLUMNS: Column<AgentRow>[] = [
  {
    id: "name",
    cellClassName: WRAP,
    header: "Agent",
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
    header: "Status",
    width: "w-32",
    cell: (a) => (
      <StatusBadge
        tone={toneOf(AGENT_STATUS_TONE, a.status)}
        pulse={a.status === "provisioning"}
      >
        {words(a.status)}
      </StatusBadge>
    ),
  },
  {
    id: "health",
    header: "Health",
    width: "w-28",
    cell: (a) => (
      <StatusBadge tone={toneOf(AGENT_HEALTH_TONE, a.health)}>
        {words(a.health)}
      </StatusBadge>
    ),
  },
  { id: "type", header: "Type", cell: (a) => agentTypeLabel(a.agentType) },
  {
    id: "group",
    cellClassName: WRAP,
    header: "Group",
    cell: (a) =>
      a.group ? (
        <span className="[overflow-wrap:anywhere]">{a.group.name}</span>
      ) : (
        <span className="text-muted-foreground">None</span>
      ),
  },
  {
    id: "heartbeat",
    header: "Last heartbeat",
    cell: (a) =>
      a.lastHeartbeat ? (
        <span className="font-mono text-xs whitespace-nowrap">
          {formatTime(a.lastHeartbeat)}
        </span>
      ) : (
        <span className="text-muted-foreground">Never</span>
      ),
  },
];

function AgentCard(a: AgentRow) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
          {a.name}
        </span>
        <StatusBadge tone={toneOf(AGENT_STATUS_TONE, a.status)}>
          {words(a.status)}
        </StatusBadge>
      </div>
      <span className="text-muted-foreground font-mono text-xs [overflow-wrap:anywhere]">
        {a.agentId}
      </span>
      <span className="text-muted-foreground text-xs">
        {agentTypeLabel(a.agentType)}
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
  const canMutate = capabilities.includes("mutate");
  const nav = navFor(capabilities);
  return (
    <PageFrame
      crumbs={[areaSwitcher(nav, "agents", "agents")]}
      title="Agents"
      notice={notice}
      description="Every agent that reports to Zentinelle AI. Open one for its activity, usage and the policies in effect."
      primaryAction={
        canMutate ? (
          <Button size="sm" onClick={onRegister}>
            <PlusIcon aria-hidden />
            Register agent
          </Button>
        ) : undefined
      }
    >
      <DataTable
        label="Agents"
        controller={table}
        columns={COLUMNS}
        getRowId={(a) => a.id}
        rowHref={(a) => agentHref(a.agentId)}
        rowLabel={(a) => `agent ${a.name}`}
        renderCard={AgentCard}
        searchPlaceholder="Search agents by name or id"
        toolbar={
          <>
            <FilterSelect
              label="Status"
              value={filters.status}
              options={AGENT_STATUSES}
              onChange={(status) => onFiltersChange({ ...filters, status })}
            />
            <FilterSelect
              label="Type"
              value={filters.agentType}
              options={AGENT_TYPES}
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
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onAssignGroup(a)}>
                    Assign to a group
                  </DropdownMenuItem>
                  {a.status === "suspended" ? (
                    <DropdownMenuItem onSelect={() => onActivate(a)}>
                      Activate
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => onSuspend(a)}>
                      Suspend
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => onRegenerateKey(a)}>
                    Regenerate API key
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(a)}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )
            : undefined
        }
        empty={{
          icon: <BotIcon />,
          title: "No agents yet",
          description: canMutate
            ? "Register an agent to issue its API key, or deploy one from Astrolift AI and it registers itself."
            : "Agents appear here once an operator registers them or Astrolift AI deploys them.",
        }}
        emptyFiltered={{
          title: "No agents match",
          description: "Clear the search or the filters to see every agent.",
        }}
      />
    </PageFrame>
  );
}
