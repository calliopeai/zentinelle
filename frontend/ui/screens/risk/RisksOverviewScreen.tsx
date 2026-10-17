import type * as React from "react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  Section,
} from "@calliopelabs/ui";
import { ShieldAlertIcon } from "lucide-react";

import type { RiskStatsData } from "@/graphql/risks/types";

import { Card } from "../../patterns/Card";
import { Meter } from "../../patterns/Meter";
import { StatGrid, StatTile } from "../../patterns/StatTile";
import { RiskTrendChart } from "./components/RiskTrendChart";
import {
  RISKS_TABS,
  RISK_CATEGORIES,
  RISK_LEVELS,
  RISK_LEVEL_TONE,
  areaCrumb,
  labelOf,
  tabsOf,
  type QueryState,
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
  const frame = (children: React.ReactNode) => (
    <PageFrame
      crumbs={[areaCrumb("risks", capabilities)]}
      title="Risks"
      tabs={tabsOf(RISKS_TABS, "overview")}
      tabsLabel="Risks"
    >
      {children}
    </PageFrame>
  );
  if (error)
    return frame(
      <ErrorState
        title="Could not load the risk overview"
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
        title="Nothing to summarize yet"
        description="The overview fills in once the register holds a risk."
        actionHref="/risks"
        actionLabel="Open the register"
      />,
    );
  const total = stats?.totalRisks ?? 0;
  const sla = (stats?.slaMetCount ?? 0) + (stats?.slaBreachedCount ?? 0);
  return frame(
    <>
      <StatGrid>
        <StatTile
          label="Open risks"
          href="/risks"
          loading={loading}
          value={stats?.openRisks ?? null}
          hint={`of ${total} in the register`}
        />
        <StatTile
          label="Critical"
          href="/risks?riskLevel=critical"
          loading={loading}
          value={stats?.criticalRisks ?? null}
          tone={stats?.criticalRisks ? "error" : "ok"}
          hint="RPN 200 or more"
        />
        <StatTile
          label="High"
          href="/risks?riskLevel=high"
          loading={loading}
          value={stats?.highRisks ?? null}
          tone={stats?.highRisks ? "warn" : "ok"}
          hint="RPN 75 to 199"
        />
        <StatTile
          label="Open incidents"
          href="/incidents"
          loading={loading}
          value={stats?.openIncidents ?? null}
          tone={stats?.slaBreachedCount ? "error" : undefined}
          hint={
            sla
              ? `${stats?.slaBreachedCount ?? 0} of ${sla} past their SLA`
              : "No incidents with an SLA"
          }
        />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By level">
          {loading ? (
            <LoadingState rows={4} label="Loading levels" />
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
        <Card title="By category">
          {loading ? (
            <LoadingState rows={4} label="Loading categories" />
          ) : (
            stats?.risksByCategory.map((row) => (
              <Meter
                key={row.category ?? "none"}
                label={
                  labelOf(RISK_CATEGORIES, row.category) ?? "Uncategorized"
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
        title="Risk index, last 30 days"
        description="The open risks' RPN as a share of the worst possible, 0 to 100, per day."
      >
        <Card>
          {trendState.error ? (
            <ErrorState
              title="Could not load the trend"
              error={trendState.error}
              onRetry={trendState.onRetry}
            />
          ) : trendState.loading ? (
            <LoadingState rows={3} label="Loading the trend" />
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
