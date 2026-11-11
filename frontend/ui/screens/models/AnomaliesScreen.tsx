"use client";

import {
  DataTable,
  ErrorState,
  PageFrame,
  Section,
  StatusBadge,
  useUI,
  type Column,
  type StatusTone,
} from "@calliopelabs/ui";
import { ActivityIcon } from "lucide-react";

import { Panel } from "../../shared/Panel";
import { SelectField } from "../../shared/SelectField";
import { TrendChart, type TrendPoint } from "../../shared/TrendChart";
import {
  formatCompact,
  formatDay,
  formatMs,
  formatUsd,
} from "../../shared/figures";
import { fixedList } from "../../shared/table";
import {
  KIND_LABEL,
  type Anomaly,
  type AnomalyKind,
  type AnomalySeverity,
} from "./anomalies";
import { areaCrumbs, usageTabs } from "./frame";

export type AnomalyFilter = "all" | AnomalyKind;

const FILTERS: { value: AnomalyFilter; label: string }[] = [
  { value: "all", label: "All kinds" },
  ...(Object.keys(KIND_LABEL) as AnomalyKind[]).map((k) => ({
    value: k,
    label: KIND_LABEL[k],
  })),
];

const SEVERITY_TONE: Record<AnomalySeverity, StatusTone> = {
  low: "muted",
  medium: "warn",
  high: "error",
  critical: "error",
};

export interface AnomaliesScreenProps {
  capabilities: readonly string[];
  /** `detectAnomalies(GetUsageMetrics)` over the last 30 days. */
  anomalies: readonly Anomaly[];
  /** `tokenBaseline(GetUsageMetrics)`: what the detector compared each day with. */
  baseline: readonly TrendPoint[];
  filter: AnomalyFilter;
  onFilterChange: (filter: AnomalyFilter) => void;
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  locale?: string;
}

function figure(kind: AnomalyKind, value: number, locale: string) {
  if (kind === "cost") return formatUsd(value, locale);
  if (kind === "latency") return formatMs(value, locale);
  return formatCompact(value, locale);
}

/**
 * Usage > Anomalies (`/usage/anomalies`, formerly
 * `/observability/anomalies`): days, agents and endpoints more than two
 * standard deviations from their baseline, with the baseline drawn. The
 * notice says plainly that detections are computed, not stored.
 */
export function AnomaliesScreen({
  capabilities,
  anomalies,
  baseline,
  filter,
  onFilterChange,
  loading,
  error,
  onRetry,
  locale = "en",
}: AnomaliesScreenProps) {
  const { Link } = useUI();
  const rows =
    filter === "all" ? anomalies : anomalies.filter((a) => a.kind === filter);

  const columns: Column<Anomaly>[] = [
    {
      id: "kind",
      header: "Kind",
      width: "w-36",
      cell: (a) => KIND_LABEL[a.kind],
    },
    {
      id: "subject",
      header: "Subject",
      cell: (a) =>
        a.agentId ? (
          <Link
            href={`/agents/${encodeURIComponent(a.agentId)}/usage`}
            className="font-mono text-xs hover:underline [overflow-wrap:anywhere]"
          >
            {a.subject}
          </Link>
        ) : (
          <span className="font-mono text-xs [overflow-wrap:anywhere]">
            {a.subject}
          </span>
        ),
    },
    {
      id: "observed",
      header: "Observed",
      align: "right",
      width: "w-28",
      cell: (a) => (
        <span className="font-mono text-xs tabular-nums">
          {figure(a.kind, a.observed, locale)}
        </span>
      ),
    },
    {
      id: "expected",
      header: "Expected",
      align: "right",
      width: "w-28",
      cell: (a) => (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {figure(a.kind, a.expected, locale)}
        </span>
      ),
    },
    {
      id: "sigma",
      header: "Deviation",
      align: "right",
      width: "w-24",
      cell: (a) => (
        <span className="font-mono text-xs tabular-nums">
          {a.sigma.toFixed(1)} sd
        </span>
      ),
    },
    {
      id: "severity",
      header: "Severity",
      width: "w-28",
      cell: (a) => (
        <StatusBadge tone={SEVERITY_TONE[a.severity]}>{a.severity}</StatusBadge>
      ),
    },
    {
      id: "at",
      header: "Day",
      width: "w-24",
      cell: (a) => (
        <span className="text-xs text-muted-foreground">
          {formatDay(a.at, locale)}
        </span>
      ),
    },
  ];

  return (
    <PageFrame
      crumbs={areaCrumbs(capabilities, "usage")}
      title="Usage"
      description="Days, agents and endpoints well outside their usual range over the last 30 days."
      tabs={usageTabs("anomalies")}
      tabsLabel="Usage tabs"
      notice={
        <p className="rounded-lg border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
          Computed from the daily usage totals each time the page opens: more
          than two standard deviations above the trailing seven days, or above
          peers. Nothing is stored, so there is nothing to acknowledge yet.
        </p>
      }
      filters={
        <SelectField
          label="Kind"
          value={filter}
          options={FILTERS}
          onChange={(v) => onFilterChange(v as AnomalyFilter)}
        />
      }
    >
      {error ? (
        <ErrorState
          title="Could not load usage"
          error={error}
          onRetry={onRetry}
        />
      ) : (
        <>
          <Section title="Baseline">
            <Panel>
              {loading ? (
                <TrendChart
                  label="Tokens per day against the baseline"
                  points={[]}
                  emptyLabel="Loading the baseline"
                />
              ) : (
                <TrendChart
                  label="Tokens per day against the baseline"
                  points={baseline}
                  formatValue={(v) => formatCompact(v, locale)}
                  emptyLabel="Not enough history yet to draw a baseline."
                />
              )}
            </Panel>
          </Section>
          <Section title="Detections">
            <DataTable
              label="Anomalies"
              chrome="table"
              controller={fixedList({
                rows,
                loading,
                filtered: filter !== "all",
                onClearFilters: () => onFilterChange("all"),
              })}
              columns={columns}
              getRowId={(a) => a.id}
              empty={{
                icon: <ActivityIcon />,
                title: "No anomalies in the last 30 days",
                description:
                  "Every day, agent and endpoint stayed within two standard deviations of its baseline.",
              }}
              emptyFiltered={{
                title: "No anomalies of this kind",
                description: "Choose All kinds to see every detection.",
              }}
            />
          </Section>
        </>
      )}
    </PageFrame>
  );
}
