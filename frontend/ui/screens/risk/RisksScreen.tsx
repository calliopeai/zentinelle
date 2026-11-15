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
import { useTranslations } from "next-intl";

import type { RiskData, RiskListVariables } from "@/graphql/risks/types";

import { FilterBar, type FilterSpec } from "../../patterns/FilterBar";
import { useListController } from "../../patterns/list-controller";
import { ViewSwitch } from "../../patterns/ViewSwitch";
import { RiskLevelBadge } from "./components/RiskLevelBadge";
import { RiskMatrix } from "./components/RiskMatrix";
import {
  RISK_STATUS_TONE,
  areaCrumb,
  canMutate,
  formatDate,
  labelOf,
  tabsOf,
  type QueryState,
  useRiskLabels,
} from "./model";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

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

const VIEWS = (t: Translate) =>
  [
    { key: "list", label: t("list"), href: "/risks" },
    { key: "matrix", label: t("matrix"), href: "/risks?view=matrix" },
    { key: "rpn", label: t("byRpn"), href: "/risks?view=rpn" },
  ] as const;

const FILTERS = (
  t: Translate,
  labels: ReturnType<typeof useRiskLabels>,
): FilterSpec[] => [
  {
    key: "category",
    label: t("category"),
    anyLabel: t("anyCategory"),
    options: labels.RISK_CATEGORIES,
  },
  {
    key: "status",
    label: t("status"),
    anyLabel: t("anyStatus"),
    options: labels.RISK_STATUSES,
  },
  {
    key: "riskLevel",
    label: t("level"),
    anyLabel: t("anyLevel"),
    options: labels.RISK_LEVELS,
  },
];

function RiskName({ risk }: { risk: RiskData }) {
  const t = useTranslations("risk.risksScreen");
  const { RISK_CATEGORIES } = useRiskLabels();
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{risk.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {risk.categoryDisplay ?? labelOf(RISK_CATEGORIES, risk.category)}
        {` · ${risk.ownerName ?? t("noOwner")}`}
      </span>
    </span>
  );
}

function RiskStatus({ risk }: { risk: RiskData }) {
  const { RISK_STATUSES } = useRiskLabels();
  return (
    <StatusBadge tone={RISK_STATUS_TONE[risk.status] ?? "muted"}>
      {risk.statusDisplay ?? labelOf(RISK_STATUSES, risk.status)}
    </StatusBadge>
  );
}

const LIST_COLUMNS = (
  t: Translate,
  labels: ReturnType<typeof useRiskLabels>,
): Column<RiskData>[] => [
  {
    id: "name",
    header: t("risk"),
    cell: (r) => <RiskName risk={r} />,
    cellClassName: "max-w-md",
  },
  {
    id: "level",
    header: t("level"),
    width: "w-36",
    cell: (r) => <RiskLevelBadge level={r.riskLevel} score={r.riskScore} />,
  },
  {
    id: "status",
    header: t("status"),
    width: "w-32",
    cell: (r) => <RiskStatus risk={r} />,
  },
  {
    id: "incidents",
    header: t("incidents"),
    width: "w-24",
    align: "right",
    cell: (r) => (
      <span className="font-mono tabular-nums">{r.incidentCount ?? 0}</span>
    ),
  },
  {
    id: "review",
    header: t("nextReview"),
    width: "w-32",
    cell: (r) =>
      formatDate(r.nextReviewDate) ?? (
        <span className="text-muted-foreground">Not scheduled</span>
      ),
  },
];

const RPN_COLUMNS = (
  t: Translate,
  labels: ReturnType<typeof useRiskLabels>,
): Column<RiskData>[] => [
  {
    id: "name",
    header: t("risk"),
    cell: (r) => <RiskName risk={r} />,
    cellClassName: "max-w-sm",
  },
  {
    id: "likelihood",
    header: t("likelihood"),
    width: "w-32",
    cell: (r) => labelOf(labels.LIKELIHOOD, r.likelihood),
  },
  {
    id: "impact",
    header: t("impact"),
    width: "w-28",
    cell: (r) => labelOf(labels.IMPACT, r.impact),
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
    header: t("residual"),
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
    header: t("level"),
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
  const t = useTranslations("risk.risksScreen");
  const labels = useRiskLabels();
  const { IMPACT, LIKELIHOOD, RISKS_TABS } = labels;
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
            {t("markReviewed")}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/risks/${risk.id}?edit=1`}>{t("edit")}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete?.(risk)}
          >
            {t("delete")}
          </DropdownMenuItem>
        </>
      )
    : undefined;

  const table = (
    <DataTable
      label={t("risks")}
      controller={controller}
      columns={
        view === "rpn" ? RPN_COLUMNS(t, labels) : LIST_COLUMNS(t, labels)
      }
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
        title: t("noRisksInTheRegister"),
        description: t("recordWhatCouldGoWrong"),
        ...(editable
          ? { actionHref: "/risks/create", actionLabel: t("newRisk") }
          : {}),
      }}
      emptyFiltered={{
        title: t("noRisksMatch"),
        description: t("noRiskMatchesThisSearch"),
      }}
    />
  );

  return (
    <PageFrame
      crumbs={[areaCrumb("risks", capabilities)]}
      title={t("risks")}
      tabs={tabsOf(RISKS_TABS, "register")}
      tabsLabel={t("risks")}
      primaryAction={
        editable ? (
          <Button asChild>
            <Link href="/risks/create">
              <PlusIcon aria-hidden />
              {t("newRisk")}
            </Link>
          </Button>
        ) : undefined
      }
      filters={
        <FilterBar
          searchLabel={t("searchRisks")}
          search={filters.search ?? ""}
          onSearchChange={(search) =>
            onFiltersChange({ ...filters, search: search || null })
          }
          filters={FILTERS(t, labels)}
          values={filters as Record<string, string>}
          onChange={(key, value) =>
            onFiltersChange({ ...filters, [key]: value || null })
          }
          onClear={clearFilters}
          trailing={
            <ViewSwitch
              label={t("registerViews")}
              views={VIEWS(t)}
              active={view}
            />
          }
        />
      }
    >
      {view === "matrix" && !loading && !error && risks.length > 0 ? (
        <>
          <Section
            title={t("likelihoodAndImpact")}
            description={t("selectACellToList")}
          >
            <RiskMatrix risks={risks} selected={cell} onSelect={setCell} />
          </Section>
          <Section
            title={
              cell
                ? t("cellFilter", {
                    likelihood: labelOf(LIKELIHOOD, cell.likelihood) ?? "",
                    impact: labelOf(IMPACT, cell.impact) ?? "",
                  })
                : t("allRisks")
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
