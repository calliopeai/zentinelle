"use client";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  Section,
  Panel,
  Segmented,
  Stat,
  Tag,
} from "@calliopelabs/ui";
import { BarChart3Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { BarList } from "../../shared/BarList";
import { TrendChart } from "../../shared/TrendChart";
import {
  formatCompact,
  formatCount,
  formatDay,
  formatMs,
  formatUsd,
} from "../../shared/figures";
import { areaCrumbs, useModelsFrame } from "./frame";
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
  const t = useTranslations("models.usageOverviewScreen");
  const { usageTabs } = useModelsFrame();
  const periodLabel = t("lastPeriod", { days: Number(period) });
  return (
    <PageFrame
      crumbs={areaCrumbs(capabilities, "usage")}
      title={t("usage")}
      description={t("tokensCostAndLatencyAcross")}
      tabs={usageTabs("overview")}
      tabsLabel={t("usageTabs")}
      filters={
        <Segmented
          label={t("period")}
          value={period}
          options={PERIODS}
          onValueChange={onPeriodChange}
        />
      }
    >
      {error ? (
        <ErrorState
          title={t("couldNotLoadUsage")}
          error={error}
          onRetry={onRetry}
        />
      ) : loading || !overview ? (
        <LoadingState label={t("loadingUsage")} variant="page" />
      ) : isEmptyUsage(overview) ? (
        <EmptyState
          icon={<BarChart3Icon />}
          title={t("noUsageInThisPeriod")}
          description={t("usageAppearsOnceARegistered")}
          actionHref="/agents"
          actionLabel={t("openAgents")}
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
  const t = useTranslations("models.usageOverviewScreen");
  const { totals } = overview;
  return (
    <>
      <div
        role="group"
        aria-label={`Usage, ${periodLabel.toLowerCase()}`}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Stat
          label={t("tokens")}
          value={formatCompact(totals.tokens, locale)}
          hint={periodLabel}
        />
        <Stat
          label={
            <>
              {t("cost")} <Tag>{t("estimated")}</Tag>
            </>
          }
          value={formatUsd(totals.cost, locale)}
          hint={t("meteredAtRegistryPrices")}
          href="/usage/budgets"
        />
        <Stat
          label={t("requests")}
          value={formatCount(totals.requests, locale)}
          hint={t("activeAgents", {
            count: formatCount(totals.activeAgents, locale),
          })}
          href="/agents"
        />
        <Stat
          label={t("averageLatency")}
          value={formatMs(overview.avgLatencyMs, locale)}
          hint={
            overview.endpointsMeasured
              ? t("acrossEndpoints", { count: overview.endpointsMeasured })
              : t("noEndpointMeasuredLatency")
          }
        />
      </div>

      <Section title={t("byDay")}>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <Panel>
            <TrendChart
              label={t("tokensPerDay")}
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
              label={t("costPerDay")}
              points={overview.days.map((d) => ({
                label: formatDay(d.date, locale),
                value: d.cost,
              }))}
              formatValue={(v) => formatUsd(v, locale)}
            />
          </Panel>
        </div>
      </Section>

      <Section title={t("whereItGoes")}>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <Panel title={t("topAgentsByCost")}>
            <BarList
              label={t("topAgentsByCost")}
              emptyLabel={t("noAgentReportedACost")}
              items={overview.topAgents.map((a) => ({
                key: a.id,
                label: a.name,
                value: a.cost,
                display: formatUsd(a.cost, locale),
                href: `/agents/${encodeURIComponent(a.id)}/usage`,
              }))}
            />
          </Panel>
          <Panel title={t("slowestEndpoints")}>
            <BarList
              label={t("slowestEndpoints")}
              emptyLabel={t("noEndpointMeasuredLatencyIn")}
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
