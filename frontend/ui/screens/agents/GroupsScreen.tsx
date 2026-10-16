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
import { PlusIcon, UsersIcon } from "lucide-react";

import type { AgentGroupData } from "@/graphql/agent-groups/types";

import { navFor } from "../../product";
import { FilterSelect } from "../../shared/FilterSelect";
import {
  GROUP_TIERS,
  GROUP_TIER_TONE,
  formatNumber,
  formatTime,
  groupSwatch,
  toneOf,
} from "./format";

export interface GroupsScreenProps {
  /** GetAgentGroups, paged. */
  table: TableController<AgentGroupData>;
  /** GetAgentGroups' `tier` variable; "" is every tier. */
  tier: string;
  onTierChange: (tier: string) => void;
  capabilities: readonly string[];
  onCreate: () => void;
  onEdit: (group: AgentGroupData) => void;
  onDelete: (group: AgentGroupData) => void;
}

function Swatch({ color }: { color: string }) {
  // The group's own colour is data, not a design value: it is set inline.
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full border"
      style={{ backgroundColor: groupSwatch(color) }}
    />
  );
}

/** Long names wrap inside a bounded column instead of widening the table. */
const WRAP = "min-w-40 max-w-md whitespace-normal";

const COLUMNS: Column<AgentGroupData>[] = [
  {
    id: "name",
    cellClassName: WRAP,
    header: "Group",
    cell: (g) => (
      <span className="flex min-w-0 items-start gap-2">
        <span className="pt-1.5">
          <Swatch color={g.color} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="font-medium [overflow-wrap:anywhere]">{g.name}</span>
          {g.description && (
            <span className="text-muted-foreground line-clamp-2 text-xs [overflow-wrap:anywhere]">
              {g.description}
            </span>
          )}
        </span>
      </span>
    ),
  },
  {
    id: "tier",
    header: "Tier",
    width: "w-32",
    cell: (g) => (
      <StatusBadge tone={toneOf(GROUP_TIER_TONE, g.tier)}>{g.tier}</StatusBadge>
    ),
  },
  {
    id: "agents",
    header: "Agents",
    align: "right",
    width: "w-24",
    cell: (g) => (
      <span className="font-mono tabular-nums">
        {formatNumber(g.agentCount)}
      </span>
    ),
  },
  {
    id: "created",
    header: "Created",
    width: "w-44",
    cell: (g) => (
      <span className="font-mono text-xs whitespace-nowrap">
        {formatTime(g.createdAt)}
      </span>
    ),
  },
];

/**
 * Groups (ui-overhaul-ia §4.1): agents grouped by tier or role, so one
 * posture default applies to all of them. A group's tier picks block-mode
 * or audit-mode defaults.
 */
export function GroupsScreen({
  table,
  tier,
  onTierChange,
  capabilities,
  onCreate,
  onEdit,
  onDelete,
}: GroupsScreenProps) {
  const canMutate = capabilities.includes("mutate");
  return (
    <PageFrame
      crumbs={[areaSwitcher(navFor(capabilities), "agents", "groups")]}
      title="Groups"
      description="Group agents by tier or role to apply shared posture defaults."
      primaryAction={
        canMutate ? (
          <Button size="sm" onClick={onCreate}>
            <PlusIcon aria-hidden />
            New group
          </Button>
        ) : undefined
      }
    >
      <DataTable
        label="Agent groups"
        controller={table}
        columns={COLUMNS}
        getRowId={(g) => g.id}
        rowLabel={(g) => `group ${g.name}`}
        searchPlaceholder="Search groups"
        toolbar={
          <FilterSelect
            label="Tier"
            value={tier}
            options={GROUP_TIERS}
            onChange={onTierChange}
          />
        }
        rowActions={
          canMutate
            ? (g) => (
                <>
                  <DropdownMenuItem onSelect={() => onEdit(g)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(g)}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )
            : undefined
        }
        empty={{
          icon: <UsersIcon />,
          title: "No groups yet",
          description: canMutate
            ? "Create a group, then assign agents to it from the Agents list."
            : "An operator creates groups and assigns agents to them.",
        }}
        emptyFiltered={{
          title: "No groups match",
          description:
            "Clear the search or the tier filter to see every group.",
        }}
      />
    </PageFrame>
  );
}
