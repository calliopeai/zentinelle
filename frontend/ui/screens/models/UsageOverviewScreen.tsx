"use client";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  Section,
} from "@calliopelabs/ui";
import { BarChart3Icon } from "lucide-react";

import { BarList } from "../../shared/BarList";
import { Panel } from "../../shared/Panel";
import { Segmented } from "../../shared/Segmented";
import { KpiTile, KpiRow } from "../../shared/KpiTile";
import { TrendChart } from "../../shared/TrendChart";
import {
  formatCompact,
  formatCount,
  formatDay,
  formatMs,
  formatUsd,
} from "../../shared/figures";
import { areaCrumbs, usageTabs } from "./frame";
import {
  PERIODS,
  isEmptyUsage,
  type Period,
  type UsageOverview,
} from "./usage";

export interface UsageOverviewScreenProps {
  capabilities: readonly string[];
  period: Period;
  onPeriodChange: (period: Period) => void;
  /** `toUsageOverview(GetUsageMetrics)`; null while loading or on error. */
  overview: UsageOverview | null;
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  locale?: string;
}

/**
 * Usage > Overview (`/usage`, formerly `/monitoring`): one `GetUsageMetrics`
 * call for the period. Headline figures, tokens and cost by day, and where
 * the spend and the latency go. Cost is metered at registry prices, and says
 * so.
 */
export function UsageOverviewScreen({
  capabilities,
  period,
  onPeriodChange,
  overview,
  loading,
  error,
  onRetry,
  locale = "en",
}: UsageOverviewScreenProps) {
  const periodLabel = `Last ${PERIODS.find((p) => p.value === period)?.label ?? period}`;
  return (
    <PageFrame
      crumbs={areaCrumbs(capabilities, "usage")}
      title="Usage"
      description="Tokens, cost and latency across every agent, from the metering records."
      tabs={usageTabs("overview")}
      tabsLabel="Usage tabs"
      filters={
        <Segmented
          label="Period"
          value={period}
          options={PERIODS}
          onChange={onPeriodChange}
        />
      }
    >
      {error ? (
        <ErrorState
          title="Could not load usage"
          error={error}
          onRetry={onRetry}
        />
      ) : loading || !overview ? (
        <LoadingState label="Loading usage" variant="page" />
      ) : isEmptyUsage(overview) ? (
        <EmptyState
          icon={<BarChart3Icon />}
          title="No usage in this period"
          description="Usage appears once a registered agent sends traffic through Zentinelle AI. Try a longer period, or register an agent."
          actionHref="/agents"
          actionLabel="Open agents"
        />
      ) : (
        <UsageBody
          overview={overview}
          periodLabel={periodLabel}
          locale={locale}
        />
      )}
    </PageFrame>
  );
}

function UsageBody({
  overview,
  periodLabel,
  locale,
}: {
  overview: UsageOverview;
  periodLabel: string;
  locale: string;
}) {
  const { totals } = overview;
  return (
    <>
      <KpiRow label={`Usage, ${periodLabel.toLowerCase()}`}>
        <KpiTile
          label="Tokens"
          value={formatCompact(totals.tokens, locale)}
          hint={periodLabel}
        />
        <KpiTile
          label="Cost"
          value={formatUsd(totals.cost, locale)}
          hint="Metered at registry prices"
          estimated
          href="/usage/budgets"
        />
        <KpiTile
          label="Requests"
          value={formatCount(totals.requests, locale)}
          hint={`${formatCount(totals.activeAgents, locale)} active agents`}
          href="/agents"
        />
        <KpiTile
          label="Average latency"
          value={formatMs(overview.avgLatencyMs, locale)}
          hint={
            overview.endpointsMeasured
              ? `Across ${overview.endpointsMeasured} endpoints, weighted by calls`
              : "No endpoint measured latency"
          }
        />
      </KpiRow>

      <Section title="By day">
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <Panel>
            <TrendChart
              label="Tokens per day"
              points={overview.days.map((d) => ({
                label: formatDay(d.date, locale),
                value: d.tokens,
              }))}
              formatValue={(v) => formatCompact(v, locale)}
            />
          </Panel>
          <Panel>
            <TrendChart
              kind="bar"
              label="Cost per day"
              points={overview.days.map((d) => ({
                label: formatDay(d.date, locale),
                value: d.cost,
              }))}
              formatValue={(v) => formatUsd(v, locale)}
            />
          </Panel>
        </div>
      </Section>

      <Section title="Where it goes">
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <Panel title="Top agents by cost">
            <BarList
              label="Top agents by cost"
              emptyLabel="No agent reported a cost in this period."
              items={overview.topAgents.map((a) => ({
                key: a.id,
                label: a.name,
                value: a.cost,
                display: formatUsd(a.cost, locale),
                href: `/agents/${encodeURIComponent(a.id)}/usage`,
              }))}
            />
          </Panel>
          <Panel title="Slowest endpoints">
            <BarList
              label="Slowest endpoints"
              emptyLabel="No endpoint measured latency in this period."
              items={overview.slowEndpoints.map((e) => ({
                key: e.endpoint,
                label: e.endpoint,
                value: e.avgLatencyMs,
                display: formatMs(e.avgLatencyMs, locale),
              }))}
            />
          </Panel>
        </div>
      </Section>
    </>
  );
}
