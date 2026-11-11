import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  List,
  ListItem,
  PageFrame,
  Section,
  StatusBadge,
  useUI,
} from "@calliopelabs/ui";
import { MoreHorizontalIcon } from "lucide-react";

import type {
  ComplianceCapability,
  ComplianceOverview,
} from "@/graphql/compliance/types";

import { Meter } from "../../patterns/Meter";
import { StatGrid, StatTile } from "../../patterns/StatTile";
import {
  COMPLIANCE_TABS,
  areaCrumb,
  canMutate,
  coverageTone,
  frameworkHref,
  isAdmin,
  tabsOf,
  type QueryState,
} from "./model";

export interface ComplianceScreenProps extends QueryState {
  capabilities: readonly string[];
  /** `GetComplianceOverview`. */
  overview: ComplianceOverview | null;
  /** `RunComplianceCheck`. */
  onRunCheck?: () => void;
  checking?: boolean;
  /** Opens the packs dialog (`ListCompliancePacks`, `ActivateCompliancePack`). */
  onOpenPacks?: () => void;
}

/** The note every coverage figure carries: configuration is not operation. */
export function ConfigurationNote({ admin }: { admin: boolean }) {
  const { Link } = useUI();
  return (
    <span className="text-xs text-muted-foreground">
      Coverage counts the capabilities your policies and rules configure. It
      does not prove they operate:{" "}
      {admin ? (
        <Link href="/evidence" className="underline underline-offset-2">
          Evidence
        </Link>
      ) : (
        "Evidence, for admins,"
      )}{" "}
      holds what was measured.
    </span>
  );
}

function CapabilityItem({ capability }: { capability: ComplianceCapability }) {
  const supports = capability.supportsFrameworks.length;
  return (
    <ListItem
      title={capability.name ?? capability.id ?? "Unnamed capability"}
      description={
        capability.enabled && capability.supportingPolicies.length
          ? `Configured by ${capability.supportingPolicies.join(", ")}`
          : capability.description
      }
      meta={
        <span className="text-xs text-muted-foreground">
          {supports} {supports === 1 ? "framework" : "frameworks"}
        </span>
      }
      status={
        <StatusBadge tone={capability.enabled ? "ok" : "muted"}>
          {capability.enabled ? "Configured" : "Not configured"}
        </StatusBadge>
      }
    />
  );
}

/**
 * Compliance > Frameworks: required coverage per framework, on the live
 * `frameworkCoverage`, and the capabilities behind it. Each framework links
 * to its detail. Nothing here says "met": coverage is configuration.
 */
export function ComplianceScreen({
  capabilities,
  overview,
  onRunCheck,
  checking = false,
  onOpenPacks,
  loading,
  error,
  onRetry,
}: ComplianceScreenProps) {
  const editable = canMutate(capabilities);
  const frameworks = overview?.frameworkCoverage ?? [];
  const fullyCovered = frameworks.filter(
    (f) => f.requiredCovered >= f.requiredTotal,
  ).length;
  const missing = frameworks.reduce((n, f) => n + f.missingRequired.length, 0);
  return (
    <PageFrame
      crumbs={[areaCrumb("compliance", capabilities)]}
      title="Compliance"
      tabs={tabsOf(COMPLIANCE_TABS, "frameworks")}
      tabsLabel="Compliance"
      primaryAction={
        editable ? (
          <Button onClick={onRunCheck} disabled={checking || loading}>
            {checking ? "Running check" : "Run check"}
          </Button>
        ) : undefined
      }
      menu={
        editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpenPacks}>
                Apply a compliance pack
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
    >
      {error ? (
        <ErrorState
          title="Could not load compliance coverage"
          error={error}
          onRetry={onRetry}
        />
      ) : (
        <>
          <StatGrid>
            <StatTile
              label="Capabilities configured"
              loading={loading}
              value={
                overview
                  ? `${overview.capabilitiesEnabled} of ${overview.capabilitiesTotal}`
                  : null
              }
            />
            <StatTile
              label="Frameworks configured"
              hint="Every required capability configured"
              loading={loading}
              value={
                overview ? `${fullyCovered} of ${frameworks.length}` : null
              }
              tone={
                overview
                  ? coverageTone(fullyCovered, frameworks.length)
                  : undefined
              }
            />
            <StatTile
              label="Required capabilities missing"
              href="/compliance/gaps"
              loading={loading}
              value={overview ? missing : null}
              tone={overview ? (missing ? "warn" : "ok") : undefined}
              hint="Across all frameworks; one capability can count for several"
            />
          </StatGrid>
          <Section
            title="Frameworks"
            description={<ConfigurationNote admin={isAdmin(capabilities)} />}
          >
            <List
              label="Frameworks"
              items={frameworks}
              loading={loading}
              loadingCount={6}
              getKey={(f) => f.id ?? f.name ?? ""}
              empty={{
                title: "No frameworks tracked",
                description:
                  "The backend tracks no frameworks for this organization.",
              }}
              renderItem={(f) => (
                <ListItem
                  title={f.name ?? f.id}
                  href={f.id ? frameworkHref(f.id) : undefined}
                  description={
                    <Meter
                      compact
                      label={`${f.name}: required capabilities configured`}
                      value={f.requiredCovered}
                      max={f.requiredTotal}
                      tone={coverageTone(f.requiredCovered, f.requiredTotal)}
                      className="mt-1 w-48 max-w-full"
                    />
                  }
                  meta={
                    <span className="font-mono text-xs tabular-nums">
                      {f.requiredCovered}/{f.requiredTotal} required ·{" "}
                      {f.totalCovered}/{f.totalCount} all
                    </span>
                  }
                  status={
                    f.missingRequired.length ? (
                      <StatusBadge
                        tone={coverageTone(f.requiredCovered, f.requiredTotal)}
                      >
                        {f.missingRequired.length} missing
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="ok">Required configured</StatusBadge>
                    )
                  }
                />
              )}
            />
          </Section>
          <Section
            title="Capability coverage"
            description="What Zentinelle AI can observe and control, and whether a policy or rule configures it."
          >
            {!loading && overview && overview.capabilitiesEnabled === 0 ? (
              <EmptyState
                title="No capability is configured"
                description="Apply a compliance pack, or create the policies and content rules a framework needs."
                actionHref={editable ? "/policies/create" : undefined}
                actionLabel={editable ? "New policy" : undefined}
              />
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                {(
                  [
                    ["Observe", overview?.observeCapabilities ?? []],
                    ["Control", overview?.controlCapabilities ?? []],
                  ] as const
                ).map(([title, items]) => (
                  <div key={title} className="flex min-w-0 flex-col gap-2">
                    <h3 className="text-sm font-medium">{title}</h3>
                    <List
                      label={`${title} capabilities`}
                      items={items}
                      loading={loading}
                      getKey={(c) => c.id ?? c.name ?? ""}
                      empty={{
                        title: `No ${title.toLowerCase()} capabilities`,
                      }}
                      renderItem={(c) => <CapabilityItem capability={c} />}
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </PageFrame>
  );
}
