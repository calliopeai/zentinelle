"use client";

import {
  Button,
  DataTable,
  PageFrame,
  StatusBadge,
  useUI,
  type Column,
  type StatusTone,
} from "@calliopelabs/ui";
import { CoinsIcon, RefreshCwIcon } from "lucide-react";

import { SelectField } from "../../shared/SelectField";
import { KpiTile, KpiRow } from "../../shared/KpiTile";
import { formatCount, formatUsd } from "../../shared/figures";
import { fixedList } from "../../shared/table";
import {
  BUDGET_POLICIES_HREF,
  SHOWBACK_GROUPS,
  type ShowbackEntry,
  type ShowbackGroup,
  type ShowbackReport,
  type ShowbackStatus,
} from "./budgets";
import { areaCrumbs, usageTabs } from "./frame";

export interface BudgetsScreenProps {
  capabilities: readonly string[];
  group: ShowbackGroup;
  onGroupChange: (group: ShowbackGroup) => void;
  /** `GET /budgets/showback?group_by=`; null before the first answer. */
  report: ShowbackReport | null;
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  locale?: string;
}

const STATUS: Record<ShowbackStatus, { tone: StatusTone; label: string }> = {
  reconciled: { tone: "ok", label: "reconciled" },
  unreconciled: { tone: "warn", label: "pending" },
  anomaly: { tone: "error", label: "anomaly" },
};

/**
 * Usage > Budgets (`/usage/budgets`, formerly `/budgets/showback`): spend
 * admitted against budget policies, reconciled with what the providers
 * report. The budgets themselves are `budget_limit` policies, edited in
 * Policies, which the header links to.
 */
export function BudgetsScreen({
  capabilities,
  group,
  onGroupChange,
  report,
  loading,
  error,
  onRetry,
  onRefresh,
  locale = "en",
}: BudgetsScreenProps) {
  const { Link } = useUI();
  const entries = report?.entries ?? [];
  const pending = entries.reduce((s, e) => s + e.unreconciled_requests, 0);
  const anomalies = entries.filter((e) => e.anomaly).length;
  const groupLabel =
    SHOWBACK_GROUPS.find((g) => g.value === group)?.label ?? group;
  const waiting = loading && !report;

  const columns: Column<ShowbackEntry>[] = [
    {
      id: "dimension",
      header: groupLabel,
      cell: (e) =>
        e.dimension_id ? (
          <span className="font-mono text-xs [overflow-wrap:anywhere]">
            {e.dimension_id}
          </span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
    {
      id: "requests",
      header: "Requests",
      align: "right",
      width: "w-28",
      cell: (e) => (
        <span className="font-mono text-xs tabular-nums">
          {formatCount(e.requests, locale)}
        </span>
      ),
    },
    {
      id: "committed",
      header: "Committed",
      align: "right",
      width: "w-32",
      cell: (e) => (
        <span className="font-mono text-xs tabular-nums">
          {formatUsd(e.committed_usd, locale)}
        </span>
      ),
    },
    {
      id: "actual",
      header: "Provider reported",
      align: "right",
      width: "w-36",
      cell: (e) =>
        e.actual_usd == null ? (
          <span className="text-xs text-muted-foreground">Not yet</span>
        ) : (
          <span className="font-mono text-xs tabular-nums">
            {formatUsd(e.actual_usd, locale)}
          </span>
        ),
    },
    {
      id: "status",
      header: "Status",
      width: "w-32",
      cell: (e) => (
        <StatusBadge tone={STATUS[e.status]?.tone ?? "muted"}>
          {STATUS[e.status]?.label ?? e.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <PageFrame
      crumbs={areaCrumbs(capabilities, "usage")}
      title="Usage"
      description="Spend admitted against budget policies, reconciled with what each provider reports."
      tabs={usageTabs("budgets")}
      tabsLabel="Usage tabs"
      primaryAction={
        <Button asChild size="sm" variant="outline">
          <Link href={BUDGET_POLICIES_HREF}>Budget policies</Link>
        </Button>
      }
      filters={
        <div className="flex flex-wrap items-center gap-3">
          <SelectField
            label="Group by"
            value={group}
            options={SHOWBACK_GROUPS}
            onChange={(v) => onGroupChange(v as ShowbackGroup)}
          />
          {onRefresh && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCwIcon aria-hidden />
              Refresh
            </Button>
          )}
        </div>
      }
    >
      {!error && (
        <KpiRow label="Budget totals">
          <KpiTile
            label="Committed"
            value={formatUsd(report?.totals.committed_usd, locale)}
            hint="Admitted by budget policies"
            loading={waiting}
          />
          <KpiTile
            label="Provider reported"
            value={
              report?.totals.actual_usd == null
                ? "Not yet"
                : formatUsd(report.totals.actual_usd, locale)
            }
            hint="From the providers' usage APIs"
            loading={waiting}
          />
          <KpiTile
            label="Pending reconciliation"
            value={formatCount(pending, locale)}
            hint={
              pending ? "Requests the provider has not reported" : "All current"
            }
            loading={waiting}
          />
          <KpiTile
            label="Anomalies"
            value={formatCount(anomalies, locale)}
            hint="Reported spend differs from committed"
            loading={waiting}
          />
        </KpiRow>
      )}
      <DataTable
        label={`Spend by ${groupLabel.toLowerCase()}`}
        controller={fixedList({
          rows: entries,
          loading,
          error,
          onRetry,
        })}
        columns={columns}
        getRowId={(e) => `${e.dimension_id}:${e.status}`}
        empty={{
          icon: <CoinsIcon />,
          title: "No budget charges yet",
          description:
            "Charges appear once an agent's traffic is admitted under a budget policy.",
          actionHref: BUDGET_POLICIES_HREF,
          actionLabel: "Open budget policies",
        }}
      />
      {report && (
        <p className="text-xs text-muted-foreground">
          Source: <span className="font-mono">{report.source}</span>
        </p>
      )}
    </PageFrame>
  );
}
