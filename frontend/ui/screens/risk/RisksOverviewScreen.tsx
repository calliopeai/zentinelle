import type * as React from "react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  Section,
} from "@calliopelabs/ui";
import { ShieldAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RiskStatsData } from "@/graphql/risks/types";

import { Card } from "../../patterns/Card";
import { Meter } from "../../patterns/Meter";
import { StatGrid, StatTile } from "../../patterns/StatTile";
import { RiskTrendChart } from "./components/RiskTrendChart";
import {
  RISK_LEVEL_TONE,
  areaCrumb,
  labelOf,
  tabsOf,
  type QueryState,
  useRiskLabels,
} from "./model";
import type { RiskTrendPoint } from "./rest-types";

export interface RisksOverviewScreenProps extends QueryState {
  capabilities: readonly string[];
  /** `GetRiskStats`: every figure here is the server's aggregate. */
  stats: RiskStatsData["riskStats"];
  /** `GET risks/trend?days=30`, loaded on its own so the tiles never wait for it. */
  trend: readonly RiskTrendPoint[];
  trendState?: QueryState;
}

/**
 * Risks > Overview: the register at a glance. Tiles link into the register
 * and Incidents with the matching filter; levels and categories are shares
 * of the open risks; the trend is the server's daily risk index.
 */
export function RisksOverviewScreen({
  capabilities,
  stats,
  trend,
  trendState = {},
  loading,
  error,
  onRetry,
}: RisksOverviewScreenProps) {
  const t = useTranslations("risk.risksOverviewScreen");
  const { RISKS_TABS, RISK_CATEGORIES, RISK_LEVELS } = useRiskLabels();
  const frame = (children: React.ReactNode) => (
    <PageFrame
      crumbs={[areaCrumb("risks", capabilities)]}
      title={t("risks")}
      tabs={tabsOf(RISKS_TABS, "overview")}
      tabsLabel={t("risks")}
    >
      {children}
    </PageFrame>
  );
  if (error)
    return frame(
      <ErrorState
        title={t("couldNotLoadTheRisk")}
        error={error}
        onRetry={onRetry}
      />,
    );
  if (!loading && stats && stats.totalRisks === 0)
    return frame(
      <EmptyState
        icon={
          <ShieldAlertIcon
            className="size-5 text-muted-foreground"
            aria-hidden
          />
        }
        title={t("nothingToSummarizeYet")}
        description={t("theOverviewFillsInOnce")}
        actionHref="/risks"
        actionLabel={t("openTheRegister")}
      />,
    );
  const total = stats?.totalRisks ?? 0;
  const sla = (stats?.slaMetCount ?? 0) + (stats?.slaBreachedCount ?? 0);
  return frame(
    <>
      <StatGrid>
        <StatTile
          label={t("openRisks")}
          href="/risks"
          loading={loading}
          value={stats?.openRisks ?? null}
          hint={t("ofRegister", { total })}
        />
        <StatTile
          label={t("critical")}
          href="/risks?riskLevel=critical"
          loading={loading}
          value={stats?.criticalRisks ?? null}
          tone={stats?.criticalRisks ? "error" : "ok"}
          hint={t("rpn200OrMore")}
        />
        <StatTile
          label={t("high")}
          href="/risks?riskLevel=high"
          loading={loading}
          value={stats?.highRisks ?? null}
          tone={stats?.highRisks ? "warn" : "ok"}
          hint={t("rpn75To199")}
        />
        <StatTile
          label={t("openIncidents")}
          href="/incidents"
          loading={loading}
          value={stats?.openIncidents ?? null}
          tone={stats?.slaBreachedCount ? "error" : undefined}
          hint={
            sla
              ? t("pastSla", {
                  count: stats?.slaBreachedCount ?? 0,
                  total: sla,
                })
              : t("noIncidentsWithAnSla")
          }
        />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("byLevel")}>
          {loading ? (
            <LoadingState rows={4} label={t("loadingLevels")} />
          ) : (
            RISK_LEVELS.map((level) => {
              const count =
                stats?.risksByLevel.find((r) => r.level === level.value)
                  ?.count ?? 0;
              return (
                <Meter
                  key={level.value}
                  label={level.label}
                  value={count}
                  max={total}
                  tone={RISK_LEVEL_TONE[level.value]}
                  valueText={`${count}`}
                />
              );
            })
          )}
        </Card>
        <Card title={t("byCategory")}>
          {loading ? (
            <LoadingState rows={4} label={t("loadingCategories")} />
          ) : (
            stats?.risksByCategory.map((row) => (
              <Meter
                key={row.category ?? "none"}
                label={
                  labelOf(RISK_CATEGORIES, row.category) ?? t("uncategorized")
                }
                value={row.count}
                max={total}
                tone="info"
                valueText={`${row.count}`}
              />
            ))
          )}
        </Card>
      </div>
      <Section
        title={t("riskIndexLast30Days")}
        description={t("theOpenRisksRpnAs")}
      >
        <Card>
          {trendState.error ? (
            <ErrorState
              title={t("couldNotLoadTheTrend")}
              error={trendState.error}
              onRetry={trendState.onRetry}
            />
          ) : trendState.loading ? (
            <LoadingState rows={3} label={t("loadingTheTrend")} />
          ) : trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <RiskTrendChart points={trend} />
          )}
        </Card>
      </Section>
    </>,
  );
}
