import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PageFrame,
  Select,
  useUI,
  type Column,
} from "@calliopelabs/ui";
import { MoreHorizontalIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";

import type { PolicyData } from "@/graphql/policies/types";

import { fromSelectValue, toSelectValue } from "../../shared/select-any";
import { FilterBar } from "../../shared/FilterBar";
import { useListController } from "../../shared/list-controller";
import { accessOf } from "./access";
import { areaCrumb, workspaceTabs } from "./frame";
import { usePolicyLabels } from "./labels";
import { PolicyStatus } from "./PolicyStatus";

export interface PoliciesScreenProps {
  capabilities: readonly string[];
  /** `GetPolicies` with the search and filters below as its variables. */
  policies: readonly PolicyData[];
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  /** `policyType`: "" for all, or a view such as `network_policy`. */
  type: string;
  onTypeChange: (type: string) => void;
  /** `scopeType`: "" for all. */
  scope: string;
  onScopeChange: (scope: string) => void;
  /** Opens the Simulate panel (`?panel=simulate`). */
  onSimulate: () => void;
  /** Opens the Analyze coverage panel (`?panel=analyze`). */
  onAnalyze: () => void;
  onToggleEnabled: (policy: PolicyData) => Promise<unknown> | void;
  onDuplicate: (policy: PolicyData) => Promise<unknown> | void;
  /** Resolves when the policy is gone; a rejection shows in the dialog. */
  onDelete: (policy: PolicyData) => Promise<unknown>;
}

/** Policies > All: every policy, with views by type, the scope filter, and the workspace actions. */
export function PoliciesScreen({
  capabilities,
  policies,
  loading,
  error,
  onRetry,
  search,
  onSearchChange,
  type,
  onTypeChange,
  scope,
  onScopeChange,
  onSimulate,
  onAnalyze,
  onToggleEnabled,
  onDuplicate,
  onDelete,
}: PoliciesScreenProps) {
  const t = useTranslations("policies.policiesScreen");
  const {
    SCOPE_OPTIONS,
    actionLabel,
    formatDate,
    scopeLabel,
    typeLabel,
    typeOptions,
    tabs,
  } = usePolicyLabels();
  const { Link } = useUI();
  const { canEdit } = accessOf(capabilities);
  const [deleting, setDeleting] = React.useState<PolicyData | null>(null);
  const filtered = Boolean(search || type || scope);
  const controller = useListController({
    rows: policies,
    loading,
    error,
    onRetry,
    search,
    onSearchChange,
    isFiltered: filtered,
    clearFilters: () => {
      onSearchChange("");
      onTypeChange("");
      onScopeChange("");
    },
  });

  const columns: Column<PolicyData>[] = [
    {
      id: "name",
      header: t("policy"),
      cell: (p) => (
        <div className="min-w-0 max-w-md">
          <div className="font-medium [overflow-wrap:anywhere]">{p.name}</div>
          {p.description && (
            <div className="line-clamp-2 text-xs text-muted-foreground">
              {p.description}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "type",
      header: t("type"),
      width: "w-40",
      cell: (p) => typeLabel(p.policyType),
    },
    {
      id: "scope",
      header: t("scope"),
      width: "w-44",
      cell: (p) => (
        <span className="[overflow-wrap:anywhere]">
          {scopeLabel(p.scopeType)}
          {p.scopeName && (
            <span className="block font-mono text-xs text-muted-foreground">
              {p.scopeName}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "action",
      header: t("action"),
      width: "w-32",
      cell: (p) => actionLabel(p.action),
    },
    {
      id: "status",
      header: t("status"),
      width: "w-32",
      cell: (p) => (
        <PolicyStatus enabled={p.enabled} enforcement={p.enforcement} />
      ),
    },
    {
      id: "priority",
      header: t("priority"),
      width: "w-20",
      align: "right",
      cell: (p) => <span className="font-mono tabular-nums">{p.priority}</span>,
    },
    {
      id: "updated",
      header: t("updated"),
      width: "w-28",
      cell: (p) => formatDate(p.updatedAt),
    },
  ];

  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "policies")]}
      title={t("policies")}
      description={t("theRulesEveryAgentRuns")}
      tabs={workspaceTabs("all", tabs.workspace)}
      tabsLabel={t("policies")}
      primaryAction={
        canEdit ? (
          <Button asChild size="sm">
            <Link href="/policies/create">
              <PlusIcon aria-hidden /> New policy
            </Link>
          </Button>
        ) : undefined
      }
      menu={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("morePolicyActions")}
            >
              <MoreHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onSimulate}>
              {t("simulateAPolicy")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAnalyze}>
              {t("analyzeCoverage")}
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/policies/create?source=document">
                    {t("newFromADocument")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/policies/copilot">{t("draftWithCopilot")}</Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {/* The demo tour's "policies-table" steps point here. */}
      <div data-tour="policies-table" className="min-w-0">
        <DataTable
          label={t("policies")}
          controller={controller}
          columns={columns}
          getRowId={(p) => p.id}
          rowHref={(p) => `/policies/${encodeURIComponent(p.id)}`}
          rowLabel={(p) => p.name}
          searchPlaceholder={t("searchPolicies")}
          toolbar={
            <FilterBar label={t("policyFilters")}>
              <Select
                aria-label={t("policyType")}
                options={typeOptions()}
                value={toSelectValue(type)}
                onValueChange={(v) => onTypeChange(fromSelectValue(v))}
                className="w-44"
              />
              <Select
                aria-label={t("scope")}
                options={SCOPE_OPTIONS}
                value={toSelectValue(scope)}
                onValueChange={(v) => onScopeChange(fromSelectValue(v))}
                className="w-40"
              />
            </FilterBar>
          }
          empty={{
            icon: <ShieldCheckIcon />,
            title: t("noPoliciesYet"),
            description: canEdit
              ? t("aPolicySetsWhatAgents")
              : t("anOperatorOrAdministratorAdds"),
            ...(canEdit
              ? { actionHref: "/policies/create", actionLabel: t("newPolicy") }
              : {}),
          }}
          emptyFiltered={{
            title: t("noPoliciesMatch"),
            description: t("tryAnotherTypeOrScope"),
          }}
          rowActions={
            canEdit
              ? (p) => (
                  <>
                    <DropdownMenuItem onSelect={() => void onToggleEnabled(p)}>
                      {p.enabled ? t("turnOff") : t("turnOn")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void onDuplicate(p)}>
                      {t("duplicate")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setDeleting(p)}
                    >
                      {t("delete")}
                    </DropdownMenuItem>
                  </>
                )
              : undefined
          }
        />
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this policy"}?`}
        description={t("agentsStopApplyingItAt")}
        confirmLabel={t("deletePolicy")}
        destructive
        onConfirm={() => (deleting ? onDelete(deleting) : undefined)}
      />
    </PageFrame>
  );
}
