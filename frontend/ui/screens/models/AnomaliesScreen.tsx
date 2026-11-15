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
import { useTranslations } from "next-intl";

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
  type Anomaly,
  type AnomalyKind,
  type AnomalySeverity,
  useAnomalyLabels,
} from "./anomalies";
import { areaCrumbs, useModelsFrame } from "./frame";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type AnomalyFilter = "all" | AnomalyKind;

const FILTERS = (
  t: Translate,
  KIND_LABEL: Record<AnomalyKind, string>,
): { value: AnomalyFilter; label: string }[] => [
  { value: "all", label: t("allKinds") },
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
  const { KIND_LABEL, subjectOf } = useAnomalyLabels();
  const t = useTranslations("models.anomaliesScreen");
  const { usageTabs } = useModelsFrame();
  const { Link } = useUI();
  const rows =
    filter === "all" ? anomalies : anomalies.filter((a) => a.kind === filter);

  const columns: Column<Anomaly>[] = [
    {
      id: "kind",
      header: t("kind"),
      width: "w-36",
      cell: (a) => KIND_LABEL[a.kind],
    },
    {
      id: "subject",
      header: t("subject"),
      cell: (a) =>
        a.agentId ? (
          <Link
            href={`/agents/${encodeURIComponent(a.agentId)}/usage`}
            className="font-mono text-xs hover:underline [overflow-wrap:anywhere]"
          >
            {subjectOf(a)}
          </Link>
        ) : (
          <span className="font-mono text-xs [overflow-wrap:anywhere]">
            {subjectOf(a)}
          </span>
        ),
    },
    {
      id: "observed",
      header: t("observed"),
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
      header: t("expected"),
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
      header: t("deviation"),
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
      header: t("severity"),
      width: "w-28",
      cell: (a) => (
        <StatusBadge tone={SEVERITY_TONE[a.severity]}>{a.severity}</StatusBadge>
      ),
    },
    {
      id: "at",
      header: t("day"),
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
      title={t("usage")}
      description={t("daysAgentsAndEndpointsWell")}
      tabs={usageTabs("anomalies")}
      tabsLabel={t("usageTabs")}
      notice={
        <p className="rounded-lg border border-info-border bg-info-bg px-3 py-2 text-sm text-info-fg">
          {t("computedFromTheDailyUsage")}
        </p>
      }
      filters={
        <SelectField
          label={t("kind")}
          value={filter}
          options={FILTERS(t, KIND_LABEL)}
          onChange={(v) => onFilterChange(v as AnomalyFilter)}
        />
      }
    >
      {error ? (
        <ErrorState
          title={t("couldNotLoadUsage")}
          error={error}
          onRetry={onRetry}
        />
      ) : (
        <>
          <Section title={t("baseline")}>
            <Panel>
              {loading ? (
                <TrendChart
                  label={t("tokensPerDayAgainstThe")}
                  points={[]}
                  emptyLabel={t("loadingTheBaseline")}
                />
              ) : (
                <TrendChart
                  label={t("tokensPerDayAgainstThe")}
                  points={baseline}
                  formatValue={(v) => formatCompact(v, locale)}
                  emptyLabel={t("notEnoughHistoryYetTo")}
                />
              )}
            </Panel>
          </Section>
          <Section title={t("detections")}>
            <DataTable
              label={t("anomalies")}
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
                title: t("noAnomaliesInTheLast"),
                description: t("everyDayAgentAndEndpoint"),
              }}
              emptyFiltered={{
                title: t("noAnomaliesOfThisKind"),
                description: t("chooseAllKindsToSee"),
              }}
            />
          </Section>
        </>
      )}
    </PageFrame>
  );
}
