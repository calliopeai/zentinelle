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
  useUI,
  type Column,
} from "@calliopelabs/ui";
import { MoreHorizontalIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import * as React from "react";

import type { PolicyData } from "@/graphql/policies/types";

import { FilterBar } from "../../shared/FilterBar";
import { useListController } from "../../shared/list-controller";
import { Select } from "../../shared/Select";
import { accessOf } from "./access";
import { areaCrumb, workspaceTabs } from "./frame";
import {
  SCOPE_OPTIONS,
  actionLabel,
  formatDate,
  scopeLabel,
  typeLabel,
  typeOptions,
} from "./labels";
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
    filtered,
    onClearFilters: () => {
      onSearchChange("");
      onTypeChange("");
      onScopeChange("");
    },
  });

  const columns: Column<PolicyData>[] = [
    {
      id: "name",
      header: "Policy",
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
      header: "Type",
      width: "w-40",
      cell: (p) => typeLabel(p.policyType),
    },
    {
      id: "scope",
      header: "Scope",
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
      header: "Action",
      width: "w-32",
      cell: (p) => actionLabel(p.action),
    },
    {
      id: "status",
      header: "Status",
      width: "w-32",
      cell: (p) => (
        <PolicyStatus enabled={p.enabled} enforcement={p.enforcement} />
      ),
    },
    {
      id: "priority",
      header: "Priority",
      width: "w-20",
      align: "right",
      cell: (p) => <span className="font-mono tabular-nums">{p.priority}</span>,
    },
    {
      id: "updated",
      header: "Updated",
      width: "w-28",
      cell: (p) => formatDate(p.updatedAt),
    },
  ];

  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "policies")]}
      title="Policies"
      description="The rules every agent runs under, from the organization down to a single user."
      tabs={workspaceTabs("all")}
      tabsLabel="Policies"
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
              aria-label="More policy actions"
            >
              <MoreHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onSimulate}>
              Simulate a policy
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAnalyze}>
              Analyze coverage
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/policies/create?source=document">
                    New from a document
                  </Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <DataTable
        label="Policies"
        controller={controller}
        columns={columns}
        getRowId={(p) => p.id}
        rowHref={(p) => `/policies/${encodeURIComponent(p.id)}`}
        rowLabel={(p) => p.name}
        searchPlaceholder="Search policies"
        toolbar={
          <FilterBar label="Policy filters">
            <Select
              aria-label="Policy type"
              options={typeOptions()}
              value={type}
              onValueChange={onTypeChange}
              className="w-44"
            />
            <Select
              aria-label="Scope"
              options={SCOPE_OPTIONS}
              value={scope}
              onValueChange={onScopeChange}
              className="w-40"
            />
          </FilterBar>
        }
        empty={{
          icon: <ShieldCheckIcon />,
          title: "No policies yet",
          description: canEdit
            ? "A policy sets what agents may do: budgets, tools, networks, oversight. Start with one for the whole organization."
            : "An operator or administrator adds policies. They show here once they exist.",
          ...(canEdit
            ? { actionHref: "/policies/create", actionLabel: "New policy" }
            : {}),
        }}
        emptyFiltered={{
          title: "No policies match",
          description: "Try another type or scope, or clear the search.",
        }}
        rowActions={
          canEdit
            ? (p) => (
                <>
                  <DropdownMenuItem onSelect={() => void onToggleEnabled(p)}>
                    {p.enabled ? "Turn off" : "Turn on"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void onDuplicate(p)}>
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleting(p)}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )
            : undefined
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this policy"}?`}
        description="Agents stop applying it at their next policy refresh. Its history stays in the audit log; the policy itself cannot be restored."
        confirmLabel="Delete policy"
        destructive
        onConfirm={() => (deleting ? onDelete(deleting) : undefined)}
      />
    </PageFrame>
  );
}
