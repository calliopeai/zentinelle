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

import { FilterBar } from "../../shared/FilterBar";
import { Select } from "../../shared/Select";
import { areaCrumb, workspaceTabs } from "./frame";
import { scopeLabel, typeLabel, typeOptions } from "./labels";
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
  let body: React.ReactNode;
  if (error) {
    body = (
      <ErrorState
        title="Could not load the hierarchy"
        error={error}
        onRetry={onRetry}
      />
    );
  } else if (loading && tiers.length === 0) {
    body = <LoadingState label="Loading the hierarchy" />;
  } else if (tiers.length === 0) {
    body = type ? (
      <EmptyState
        title={`No ${typeLabel(type).toLowerCase()} policies`}
        description="No tier sets this type. Choose another type, or all types."
        secondary={
          <button
            type="button"
            className="text-sm underline underline-offset-2"
            onClick={() => onTypeChange("")}
          >
            Show all types
          </button>
        }
      />
    ) : (
      <EmptyState
        icon={<GitForkIcon />}
        title="Nothing to inherit yet"
        description="Once policies exist, this shows which tier sets each one and where a narrower tier overrides it."
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
              description={`${tier.policies.length} ${tier.policies.length === 1 ? "policy" : "policies"}`}
            >
              <List
                label={`${scopeLabel(tier.scope)} policies`}
                items={tier.policies}
                getKey={(entry) => entry.policy.id}
                empty={{ title: "No policies at this tier" }}
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
                            overrides {scopeLabel(overrides).toLowerCase()}
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
      title="Policies"
      tabs={workspaceTabs("hierarchy")}
      tabsLabel="Policies"
      filters={
        <FilterBar label="Hierarchy filters">
          <Select
            aria-label="Policy type"
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
