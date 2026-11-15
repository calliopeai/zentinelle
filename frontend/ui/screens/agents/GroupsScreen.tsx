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
import { useTranslations } from "next-intl";

import type { AgentGroupData } from "@/graphql/agent-groups/types";

import { navFor } from "../../product";
import { FilterSelect } from "../../shared/FilterSelect";
import {
  GROUP_TIER_TONE,
  formatNumber,
  formatTime,
  groupSwatch,
  toneOf,
  useAgentLabels,
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

function columns(
  t: ReturnType<typeof useTranslations>,
  tierLabel: (tier: string) => string,
): Column<AgentGroupData>[] {
  return [
    {
      id: "name",
      cellClassName: WRAP,
      header: t("columns.group"),
      cell: (g) => (
        <span className="flex min-w-0 items-start gap-2">
          <span className="pt-1.5">
            <Swatch color={g.color} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-medium [overflow-wrap:anywhere]">
              {g.name}
            </span>
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
      header: t("columns.tier"),
      width: "w-32",
      cell: (g) => (
        <StatusBadge tone={toneOf(GROUP_TIER_TONE, g.tier)}>
          {tierLabel(g.tier)}
        </StatusBadge>
      ),
    },
    {
      id: "agents",
      header: t("columns.agents"),
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
      header: t("columns.created"),
      width: "w-44",
      cell: (g) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {formatTime(g.createdAt)}
        </span>
      ),
    },
  ];
}

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
  const t = useTranslations("agents.groups");
  const c = useTranslations("common");
  const labels = useAgentLabels();
  const canMutate = capabilities.includes("mutate");
  return (
    <PageFrame
      crumbs={[areaSwitcher(navFor(capabilities), "agents", "groups")]}
      title={t("title")}
      description={t("description")}
      primaryAction={
        canMutate ? (
          <Button size="sm" onClick={onCreate}>
            <PlusIcon aria-hidden />
            {t("create")}
          </Button>
        ) : undefined
      }
    >
      <DataTable
        label={t("tableLabel")}
        controller={table}
        columns={columns(t, labels.tier)}
        getRowId={(g) => g.id}
        rowLabel={(g) => t("rowLabel", { name: g.name })}
        searchPlaceholder={t("search")}
        toolbar={
          <FilterSelect
            label={t("tier")}
            value={tier}
            options={labels.tierOptions}
            onChange={onTierChange}
          />
        }
        rowActions={
          canMutate
            ? (g) => (
                <>
                  <DropdownMenuItem onSelect={() => onEdit(g)}>
                    {c("edit")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(g)}
                  >
                    {c("delete")}
                  </DropdownMenuItem>
                </>
              )
            : undefined
        }
        empty={{
          icon: <UsersIcon />,
          title: t("empty.title"),
          description: canMutate ? t("empty.canMutate") : t("empty.readOnly"),
        }}
        emptyFiltered={{
          title: t("emptyFiltered.title"),
          description: t("emptyFiltered.description"),
        }}
      />
    </PageFrame>
  );
}
