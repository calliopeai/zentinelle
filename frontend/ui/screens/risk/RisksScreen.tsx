import {
  Button,
  DataTable,
  DropdownMenuItem,
  PageFrame,
  Section,
  StatusBadge,
  useUI,
  type Column,
} from "@calliopelabs/ui";
import { PlusIcon, ShieldAlertIcon } from "lucide-react";
import * as React from "react";

import type { RiskData, RiskListVariables } from "@/graphql/risks/types";

import { FilterBar, type FilterSpec } from "../../patterns/FilterBar";
import { useListController } from "../../patterns/list-controller";
import { ViewSwitch } from "../../patterns/ViewSwitch";
import { RiskLevelBadge } from "./components/RiskLevelBadge";
import { RiskMatrix } from "./components/RiskMatrix";
import {
  IMPACT,
  LIKELIHOOD,
  RISKS_TABS,
  RISK_CATEGORIES,
  RISK_LEVELS,
  RISK_STATUSES,
  RISK_STATUS_TONE,
  areaCrumb,
  canMutate,
  formatDate,
  labelOf,
  tabsOf,
  type QueryState,
} from "./model";

export type RegisterView = "list" | "matrix" | "rpn";

export interface RisksScreenProps extends QueryState {
  capabilities: readonly string[];
  view: RegisterView;
  /** `GetRisks`, answered for `filters`. For the RPN view, ordered by RPN, highest first. */
  risks: readonly RiskData[];
  /** The query's arguments: search, category, status and level. */
  filters: RiskListVariables;
  onFiltersChange: (filters: RiskListVariables) => void;
  /** `ReviewRisk`. */
  onReview?: (risk: RiskData) => void;
  /** `DeleteRisk`, after the person confirms. */
  onDelete?: (risk: RiskData) => void;
}

const VIEWS = [
  { key: "list", label: "List", href: "/risks" },
  { key: "matrix", label: "Matrix", href: "/risks?view=matrix" },
  { key: "rpn", label: "By RPN", href: "/risks?view=rpn" },
] as const;

const FILTERS: FilterSpec[] = [
  {
    key: "category",
    label: "Category",
    anyLabel: "Any category",
    options: [...RISK_CATEGORIES],
  },
  {
    key: "status",
    label: "Status",
    anyLabel: "Any status",
    options: [...RISK_STATUSES],
  },
  {
    key: "riskLevel",
    label: "Level",
    anyLabel: "Any level",
    options: [...RISK_LEVELS],
  },
];

function RiskName({ risk }: { risk: RiskData }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{risk.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {risk.categoryDisplay ?? labelOf(RISK_CATEGORIES, risk.category)}
        {risk.ownerName ? ` · ${risk.ownerName}` : " · No owner"}
      </span>
    </span>
  );
}

const statusCell = (risk: RiskData) => (
  <StatusBadge tone={RISK_STATUS_TONE[risk.status] ?? "muted"}>
    {risk.statusDisplay ?? labelOf(RISK_STATUSES, risk.status)}
  </StatusBadge>
);

const LIST_COLUMNS: Column<RiskData>[] = [
  {
    id: "name",
    header: "Risk",
    cell: (r) => <RiskName risk={r} />,
    cellClassName: "max-w-md",
  },
  {
    id: "level",
    header: "Level",
    width: "w-36",
    cell: (r) => <RiskLevelBadge level={r.riskLevel} score={r.riskScore} />,
  },
  { id: "status", header: "Status", width: "w-32", cell: statusCell },
  {
    id: "incidents",
    header: "Incidents",
    width: "w-24",
    align: "right",
    cell: (r) => (
      <span className="font-mono tabular-nums">{r.incidentCount ?? 0}</span>
    ),
  },
  {
    id: "review",
    header: "Next review",
    width: "w-32",
    cell: (r) =>
      formatDate(r.nextReviewDate) ?? (
        <span className="text-muted-foreground">Not scheduled</span>
      ),
  },
];

const RPN_COLUMNS: Column<RiskData>[] = [
  {
    id: "name",
    header: "Risk",
    cell: (r) => <RiskName risk={r} />,
    cellClassName: "max-w-sm",
  },
  {
    id: "likelihood",
    header: "Likelihood",
    width: "w-32",
    cell: (r) => labelOf(LIKELIHOOD, r.likelihood),
  },
  {
    id: "impact",
    header: "Impact",
    width: "w-28",
    cell: (r) => labelOf(IMPACT, r.impact),
  },
  {
    id: "rpn",
    header: "RPN",
    width: "w-20",
    align: "right",
    cell: (r) => (
      <span className="font-mono font-semibold tabular-nums">
        {r.riskScore ?? "-"}
      </span>
    ),
  },
  {
    id: "residual",
    header: "Residual",
    width: "w-24",
    align: "right",
    cell: (r) => (
      <span className="font-mono tabular-nums text-muted-foreground">
        {r.residualRiskScore ?? "-"}
      </span>
    ),
  },
  {
    id: "level",
    header: "Level",
    width: "w-32",
    cell: (r) => <RiskLevelBadge level={r.riskLevel} />,
  },
];

/**
 * Risks > Register: the risk register in three views. List is the working
 * list; Matrix places each risk on likelihood and impact; By RPN ranks them
 * by severity x likelihood x impact. Search and filters are `GetRisks`
 * arguments, so the route refetches when they change.
 */
export function RisksScreen({
  capabilities,
  view,
  risks,
  filters,
  onFiltersChange,
  onReview,
  onDelete,
  loading,
  error,
  onRetry,
}: RisksScreenProps) {
  const { Link } = useUI();
  const [cell, setCell] = React.useState<{
    likelihood: number;
    impact: number;
  } | null>(null);
  const editable = canMutate(capabilities);
  const isFiltered = Boolean(
    filters.search || filters.category || filters.status || filters.riskLevel,
  );
  const clearFilters = () => onFiltersChange({});
  const shown =
    view === "matrix" && cell
      ? risks.filter(
          (r) => r.likelihood === cell.likelihood && r.impact === cell.impact,
        )
      : risks;
  const controller = useListController(shown, {
    loading,
    error,
    retry: onRetry,
    isFiltered: isFiltered || (view === "matrix" && cell !== null),
    clearFilters: () => {
      setCell(null);
      clearFilters();
    },
  });

  const rowActions = editable
    ? (risk: RiskData) => (
        <>
          <DropdownMenuItem onSelect={() => onReview?.(risk)}>
            Mark reviewed
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/risks/${risk.id}?edit=1`}>Edit</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete?.(risk)}
          >
            Delete
          </DropdownMenuItem>
        </>
      )
    : undefined;

  const table = (
    <DataTable
      label="Risks"
      controller={controller}
      columns={view === "rpn" ? RPN_COLUMNS : LIST_COLUMNS}
      getRowId={(r) => r.id}
      rowHref={(r) => `/risks/${r.id}`}
      rowLabel={(r) => r.name}
      rowActions={rowActions}
      empty={{
        icon: (
          <ShieldAlertIcon
            className="size-5 text-muted-foreground"
            aria-hidden
          />
        ),
        title: "No risks in the register",
        description:
          "Record what could go wrong with your agents, how likely it is and what it would cost.",
        ...(editable
          ? { actionHref: "/risks/create", actionLabel: "New risk" }
          : {}),
      }}
      emptyFiltered={{
        title: "No risks match",
        description: "No risk matches this search and these filters.",
      }}
    />
  );

  return (
    <PageFrame
      crumbs={[areaCrumb("risks", capabilities)]}
      title="Risks"
      tabs={tabsOf(RISKS_TABS, "register")}
      tabsLabel="Risks"
      primaryAction={
        editable ? (
          <Button asChild>
            <Link href="/risks/create">
              <PlusIcon aria-hidden />
              New risk
            </Link>
          </Button>
        ) : undefined
      }
      filters={
        <FilterBar
          searchLabel="Search risks"
          search={filters.search ?? ""}
          onSearchChange={(search) =>
            onFiltersChange({ ...filters, search: search || null })
          }
          filters={FILTERS}
          values={filters as Record<string, string>}
          onChange={(key, value) =>
            onFiltersChange({ ...filters, [key]: value || null })
          }
          onClear={clearFilters}
          trailing={
            <ViewSwitch label="Register views" views={VIEWS} active={view} />
          }
        />
      }
    >
      {view === "matrix" && !loading && !error && risks.length > 0 ? (
        <>
          <Section
            title="Likelihood and impact"
            description="Select a cell to list its risks."
          >
            <RiskMatrix risks={risks} selected={cell} onSelect={setCell} />
          </Section>
          <Section
            title={
              cell
                ? `${labelOf(LIKELIHOOD, cell.likelihood)} likelihood, ${labelOf(IMPACT, cell.impact)} impact`
                : "All risks"
            }
          >
            {table}
          </Section>
        </>
      ) : (
        table
      )}
    </PageFrame>
  );
}
