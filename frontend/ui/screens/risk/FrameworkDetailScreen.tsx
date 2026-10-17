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
  return (
    <ListItem
      title={capability.name ?? capability.id}
      description={
        capability.supportingPolicies.length
          ? `Configured by ${capability.supportingPolicies.join(", ")}`
          : capability.description
      }
      status={<StatusBadge tone="ok">Configured</StatusBadge>}
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
  const crumbs = [
    areaCrumb("compliance", capabilities),
    { label: "Frameworks", href: "/compliance" },
  ];
  const framework = overview?.frameworkCoverage.find(
    (f) => f.id === frameworkId,
  );
  if (loading)
    return (
      <PageFrame crumbs={crumbs} title="Framework">
        <LoadingState variant="page" label="Loading the framework" />
      </PageFrame>
    );
  if (error)
    return (
      <PageFrame crumbs={crumbs} title="Framework">
        <ErrorState
          title="Could not load the framework"
          error={error}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  if (!framework)
    return (
      <PageFrame crumbs={crumbs} title="Framework not tracked">
        <EmptyState
          title={`Zentinelle AI does not track ${frameworkId}`}
          description="The frameworks list shows every framework the backend tracks."
          actionHref="/compliance"
          actionLabel="All frameworks"
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
            : "Required configured"}
        </StatusBadge>
      }
      description={<ConfigurationNote admin={isAdmin(capabilities)} />}
      primaryAction={
        canMutate(capabilities) ? (
          <Button variant="outline" onClick={onGenerateReport}>
            Generate report
          </Button>
        ) : undefined
      }
    >
      <StatGrid>
        <StatTile
          label="Required configured"
          value={`${framework.requiredCovered} of ${framework.requiredTotal}`}
          tone={coverageTone(
            framework.requiredCovered,
            framework.requiredTotal,
          )}
        />
        <StatTile
          label="Recommended configured"
          value={`${recommendedCovered} of ${recommendedTotal}`}
        />
      </StatGrid>
      <Meter
        label="All capabilities configured"
        value={framework.totalCovered}
        max={framework.totalCount}
        tone={coverageTone(framework.totalCovered, framework.totalCount)}
      />
      <Section
        title="Missing"
        description="Required first. Each needs a policy or a content rule."
      >
        <List
          label="Missing capabilities"
          items={[...missingRequired, ...missingRecommended]}
          getKey={(id) => id}
          empty={{
            title: "Nothing missing",
            description: "Every capability this framework names is configured.",
          }}
          renderItem={(id) => (
            <ListItem
              title={byId.get(id)?.name ?? id}
              description={byId.get(id)?.description}
              status={
                <StatusBadge tone={missingRequired.has(id) ? "warn" : "muted"}>
                  {missingRequired.has(id) ? "Required" : "Recommended"}
                </StatusBadge>
              }
            />
          )}
        />
      </Section>
      <Section title="Configured">
        <List
          label="Configured capabilities"
          items={configured}
          getKey={(c) => c.id ?? ""}
          empty={{
            title: "Nothing configured yet",
            description: "No enabled capability supports this framework.",
          }}
          renderItem={(c) => <ConfiguredRow capability={c} />}
        />
      </Section>
    </PageFrame>
  );
}
