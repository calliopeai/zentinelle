import {
  Button,
  EmptyState,
  ErrorState,
  List,
  ListItem,
  LoadingState,
  PageFrame,
  Section,
  StatusBadge,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import type {
  ComplianceCapability,
  ComplianceOverview,
} from "@/graphql/compliance/types";

import { Meter } from "../../patterns/Meter";
import { StatGrid, StatTile } from "../../patterns/StatTile";
import { ConfigurationNote } from "./ComplianceScreen";
import {
  areaCrumb,
  canMutate,
  coverageTone,
  isAdmin,
  type QueryState,
} from "./model";

export interface FrameworkDetailScreenProps extends QueryState {
  capabilities: readonly string[];
  /** The backend id in the path (`/compliance/SOC2`). */
  frameworkId: string;
  /** `GetComplianceOverview`; the framework is one of its `frameworkCoverage` rows. */
  overview: ComplianceOverview | null;
  /** `GenerateComplianceReport` for this framework. */
  onGenerateReport?: () => void;
}

function ConfiguredRow({ capability }: { capability: ComplianceCapability }) {
  const t = useTranslations("risk.frameworkDetailScreen");
  return (
    <ListItem
      title={capability.name ?? capability.id}
      description={
        capability.supportingPolicies.length
          ? t("configuredBy", {
              policies: capability.supportingPolicies.join(", "),
            })
          : capability.description
      }
      status={<StatusBadge tone="ok">{t("configured")}</StatusBadge>}
    />
  );
}

/**
 * A framework (`/compliance/{id}`), on live coverage: which of its required
 * and recommended capabilities a policy or rule configures, and which are
 * missing. It replaces the hard-coded control table, so every row here is
 * something the server computed.
 */
export function FrameworkDetailScreen({
  capabilities,
  frameworkId,
  overview,
  onGenerateReport,
  loading,
  error,
  onRetry,
}: FrameworkDetailScreenProps) {
  const t = useTranslations("risk.frameworkDetailScreen");
  const crumbs = [
    areaCrumb("compliance", capabilities),
    { label: t("frameworks"), href: "/compliance" },
  ];
  const framework = overview?.frameworkCoverage.find(
    (f) => f.id === frameworkId,
  );
  if (loading)
    return (
      <PageFrame crumbs={crumbs} title={t("framework")}>
        <LoadingState variant="page" label={t("loadingTheFramework")} />
      </PageFrame>
    );
  if (error)
    return (
      <PageFrame crumbs={crumbs} title={t("framework")}>
        <ErrorState
          title={t("couldNotLoadTheFramework")}
          error={error}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  if (!framework)
    return (
      <PageFrame crumbs={crumbs} title={t("frameworkNotTracked")}>
        <EmptyState
          title={t("notTracked", { id: frameworkId })}
          description={t("theFrameworksListShowsEvery")}
          actionHref="/compliance"
          actionLabel={t("allFrameworks")}
        />
      </PageFrame>
    );

  const all = [
    ...(overview?.observeCapabilities ?? []),
    ...(overview?.controlCapabilities ?? []),
  ];
  const byId = new Map(all.map((c) => [c.id ?? "", c]));
  // The overview names only what is missing; what is configured is every
  // enabled capability that lists this framework.
  const configured = all.filter(
    (c) => c.enabled && c.supportsFrameworks.includes(frameworkId),
  );
  const missingRequired = new Set(framework.missingRequired);
  const missingRecommended = new Set(framework.missingRecommended);
  const recommendedTotal = framework.totalCount - framework.requiredTotal;
  const recommendedCovered = framework.totalCovered - framework.requiredCovered;

  return (
    <PageFrame
      crumbs={crumbs}
      title={framework.name ?? frameworkId}
      context={framework.description}
      status={
        <StatusBadge
          tone={coverageTone(
            framework.requiredCovered,
            framework.requiredTotal,
          )}
        >
          {framework.missingRequired.length
            ? `${framework.missingRequired.length} required missing`
            : t("requiredConfigured")}
        </StatusBadge>
      }
      description={<ConfigurationNote admin={isAdmin(capabilities)} />}
      primaryAction={
        canMutate(capabilities) ? (
          <Button variant="outline" onClick={onGenerateReport}>
            {t("generateReport")}
          </Button>
        ) : undefined
      }
    >
      <StatGrid>
        <StatTile
          label={t("requiredConfigured")}
          value={`${framework.requiredCovered} of ${framework.requiredTotal}`}
          tone={coverageTone(
            framework.requiredCovered,
            framework.requiredTotal,
          )}
        />
        <StatTile
          label={t("recommendedConfigured")}
          value={`${recommendedCovered} of ${recommendedTotal}`}
        />
      </StatGrid>
      <Meter
        label={t("allCapabilitiesConfigured")}
        value={framework.totalCovered}
        max={framework.totalCount}
        tone={coverageTone(framework.totalCovered, framework.totalCount)}
      />
      <Section title={t("missing")} description={t("requiredFirstEachNeedsA")}>
        <List
          label={t("missingCapabilities")}
          items={[...missingRequired, ...missingRecommended]}
          getKey={(id) => id}
          empty={{
            title: t("nothingMissing"),
            description: t("everyCapabilityThisFrameworkNames"),
          }}
          renderItem={(id) => (
            <ListItem
              title={byId.get(id)?.name ?? id}
              description={byId.get(id)?.description}
              status={
                <StatusBadge tone={missingRequired.has(id) ? "warn" : "muted"}>
                  {missingRequired.has(id) ? t("required") : t("recommended")}
                </StatusBadge>
              }
            />
          )}
        />
      </Section>
      <Section title={t("configured")}>
        <List
          label={t("configuredCapabilities")}
          items={configured}
          getKey={(c) => c.id ?? ""}
          empty={{
            title: t("nothingConfiguredYet"),
            description: t("noEnabledCapabilitySupportsThis"),
          }}
          renderItem={(c) => <ConfiguredRow capability={c} />}
        />
      </Section>
    </PageFrame>
  );
}
