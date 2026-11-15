import type * as React from "react";
import {
  EmptyState,
  ErrorState,
  List,
  ListItem,
  LoadingState,
  PageFrame,
  Section,
  StatusBadge,
} from "@calliopelabs/ui";
import { GitForkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { FilterBar } from "../../shared/FilterBar";
import { Select } from "../../shared/Select";
import { areaCrumb, workspaceTabs } from "./frame";
import { usePolicyLabels } from "./labels";
import type { HierarchyTier } from "./map";
import { PolicyStatus } from "./PolicyStatus";

export interface PolicyHierarchyScreenProps {
  capabilities: readonly string[];
  /** `hierarchyOf(GetPolicies)`, the type filter applied as the query's `policyType`. */
  tiers: readonly HierarchyTier[];
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  type: string;
  onTypeChange: (type: string) => void;
}

/**
 * Policies > Hierarchy: how inheritance resolves, broadest tier first. A
 * narrower policy of a type a broader tier already sets is marked as the
 * override it is.
 */
export function PolicyHierarchyScreen({
  capabilities,
  tiers,
  loading,
  error,
  onRetry,
  type,
  onTypeChange,
}: PolicyHierarchyScreenProps) {
  const t = useTranslations("policies.policyHierarchyScreen");
  const { scopeLabel, typeLabel, typeOptions, tabs } = usePolicyLabels();
  let body: React.ReactNode;
  if (error) {
    body = (
      <ErrorState
        title={t("couldNotLoadTheHierarchy")}
        error={error}
        onRetry={onRetry}
      />
    );
  } else if (loading && tiers.length === 0) {
    body = <LoadingState label={t("loadingTheHierarchy")} />;
  } else if (tiers.length === 0) {
    body = type ? (
      <EmptyState
        title={t("noTypePolicies", { type: typeLabel(type).toLowerCase() })}
        description={t("noTierSetsThisType")}
        secondary={
          <button
            type="button"
            className="text-sm underline underline-offset-2"
            onClick={() => onTypeChange("")}
          >
            {t("showAllTypes")}
          </button>
        }
      />
    ) : (
      <EmptyState
        icon={<GitForkIcon />}
        title={t("nothingToInheritYet")}
        description={t("oncePoliciesExistThisShows")}
      />
    );
  } else {
    body = (
      <ol className="flex flex-col gap-6">
        {tiers.map((tier, index) => (
          <li key={tier.scope}>
            <Section
              headingLevel="h2"
              title={`${index + 1}. ${scopeLabel(tier.scope)}`}
              description={t("count", { count: tier.policies.length })}
            >
              <List
                label={t("tierLabel", { scope: scopeLabel(tier.scope) })}
                items={tier.policies}
                getKey={(entry) => entry.policy.id}
                empty={{ title: t("noPoliciesAtThisTier") }}
                renderItem={({ policy, overrides }) => (
                  <ListItem
                    title={policy.name}
                    href={`/policies/${encodeURIComponent(policy.id)}`}
                    description={
                      <>
                        {typeLabel(policy.policyType)}
                        {policy.scopeName && (
                          <span className="font-mono">
                            {" "}
                            · {policy.scopeName}
                          </span>
                        )}
                      </>
                    }
                    meta={
                      <span className="font-mono tabular-nums">
                        P{policy.priority}
                      </span>
                    }
                    status={
                      <span className="flex flex-wrap items-center gap-1.5">
                        {overrides && (
                          <StatusBadge tone="info">
                            {t("overrides", {
                              scope: scopeLabel(overrides).toLowerCase(),
                            })}
                          </StatusBadge>
                        )}
                        <PolicyStatus
                          enabled={policy.enabled}
                          enforcement={policy.enforcement}
                        />
                      </span>
                    }
                  />
                )}
              />
            </Section>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "policies")]}
      title={t("policies")}
      tabs={workspaceTabs("hierarchy", tabs.workspace)}
      tabsLabel={t("policies")}
      filters={
        <FilterBar label={t("hierarchyFilters")}>
          <Select
            aria-label={t("policyType")}
            options={typeOptions()}
            value={type}
            onValueChange={onTypeChange}
            className="w-44"
          />
        </FilterBar>
      }
    >
      {body}
    </PageFrame>
  );
}
