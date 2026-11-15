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
  Stat,
  StatGrid,
} from "@calliopelabs/ui";
import { MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type {
  ComplianceCapability,
  ComplianceOverview,
} from "@/graphql/compliance/types";

import { Meter } from "../../shared/Meter";
import {
  areaCrumb,
  canMutate,
  coverageTone,
  frameworkHref,
  isAdmin,
  tabsOf,
  type QueryState,
  useRiskLabels,
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
  const t = useTranslations("risk.complianceScreen");
  const { Link } = useUI();
  return (
    <span className="text-xs text-muted-foreground">
      {t.rich("caveat", {
        evidence: () =>
          admin ? (
            <Link href="/evidence" className="underline underline-offset-2">
              {t("evidence")}
            </Link>
          ) : (
            t("evidenceForAdmins")
          ),
      })}
    </span>
  );
}

function CapabilityItem({ capability }: { capability: ComplianceCapability }) {
  const t = useTranslations("risk.complianceScreen");
  const supports = capability.supportsFrameworks.length;
  return (
    <ListItem
      title={capability.name ?? capability.id ?? t("unnamedCapability")}
      description={
        capability.enabled && capability.supportingPolicies.length
          ? t("configuredBy", {
              policies: capability.supportingPolicies.join(", "),
            })
          : capability.description
      }
      meta={
        <span className="text-xs text-muted-foreground">
          {supports} {supports === 1 ? "framework" : "frameworks"}
        </span>
      }
      status={
        <StatusBadge tone={capability.enabled ? "ok" : "muted"}>
          {capability.enabled ? t("configured") : t("notConfigured")}
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
  const t = useTranslations("risk.complianceScreen");
  const { COMPLIANCE_TABS } = useRiskLabels();
  const editable = canMutate(capabilities);
  const frameworks = overview?.frameworkCoverage ?? [];
  const fullyCovered = frameworks.filter(
    (f) => f.requiredCovered >= f.requiredTotal,
  ).length;
  const missing = frameworks.reduce((n, f) => n + f.missingRequired.length, 0);
  return (
    <PageFrame
      crumbs={[areaCrumb("compliance", capabilities)]}
      title={t("compliance")}
      tabs={tabsOf(COMPLIANCE_TABS, "frameworks")}
      tabsLabel={t("compliance")}
      primaryAction={
        editable ? (
          <Button onClick={onRunCheck} disabled={checking || loading}>
            {checking ? t("runningCheck") : t("runCheck")}
          </Button>
        ) : undefined
      }
      menu={
        editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("moreActions")}
              >
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpenPacks}>
                {t("applyACompliancePack")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined
      }
    >
      {error ? (
        <ErrorState
          title={t("couldNotLoadComplianceCoverage")}
          error={error}
          onRetry={onRetry}
        />
      ) : (
        <>
          <StatGrid>
            <Stat
              label={t("capabilitiesConfigured")}
              loading={loading}
              value={
                overview
                  ? `${overview.capabilitiesEnabled} of ${overview.capabilitiesTotal}`
                  : null
              }
            />
            <Stat
              label={t("frameworksConfigured")}
              hint={t("everyRequiredCapabilityConfigured")}
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
            <Stat
              label={t("requiredCapabilitiesMissing")}
              href="/compliance/gaps"
              loading={loading}
              value={overview ? missing : null}
              tone={overview ? (missing ? "warn" : "ok") : undefined}
              hint={t("acrossAllFrameworksOneCapability")}
            />
          </StatGrid>
          <Section
            title={t("frameworks")}
            description={<ConfigurationNote admin={isAdmin(capabilities)} />}
          >
            <List
              label={t("frameworks")}
              items={frameworks}
              loading={loading}
              loadingCount={6}
              getKey={(f) => f.id ?? f.name ?? ""}
              empty={{
                title: t("noFrameworksTracked"),
                description: t("theBackendTracksNoFrameworks"),
              }}
              renderItem={(f) => (
                <ListItem
                  title={f.name ?? f.id}
                  href={f.id ? frameworkHref(f.id) : undefined}
                  description={
                    <Meter
                      compact
                      label={t("requiredOf", { name: f.name ?? "" })}
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
                      <StatusBadge tone="ok">
                        {t("requiredConfigured")}
                      </StatusBadge>
                    )
                  }
                />
              )}
            />
          </Section>
          <Section
            title={t("capabilityCoverage")}
            description={t("whatZentinelleAiCanObserve")}
          >
            {!loading && overview && overview.capabilitiesEnabled === 0 ? (
              <EmptyState
                title={t("noCapabilityIsConfigured")}
                description={t("applyACompliancePackOr")}
                actionHref={editable ? "/policies/create" : undefined}
                actionLabel={editable ? t("newPolicy") : undefined}
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
                      label={t("capabilitiesOf", { title })}
                      items={items}
                      loading={loading}
                      getKey={(c) => c.id ?? c.name ?? ""}
                      empty={{
                        title: t("noCapabilities", {
                          title: title.toLowerCase(),
                        }),
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
