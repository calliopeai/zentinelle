"use client";

import { useState, useMemo } from "react";
import { useMutation } from "@apollo/client/react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { usePolicies } from "@/graphql/policies/hooks";
import type {
  PolicyData,
  TogglePolicyEnabledPayload,
  DeletePolicyPayload,
} from "@/graphql/policies/types";
import {
  TOGGLE_POLICY_ENABLED,
  DELETE_POLICY,
  DUPLICATE_POLICY,
} from "@/graphql/policies/mutations";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";
import { EditPolicyDialog } from "./edit-policy-dialog";
import { PolicyHistoryDialog } from "./history-dialog";

/* ── Policy Coverage Heatmap ─────────────────────────────────────── */

const ALL_POLICY_TYPES = [
  "rate_limit",
  "tool_permission",
  "model_restriction",
  "agent_capability",
  "network_policy",
  "output_filter",
  "secret_access",
  "data_retention",
  "ai_guardrail",
];

const ALL_SCOPES = [
  "organization",
  "team",
  "deployment",
  "endpoint",
  "user",
];

interface CellData {
  policies: PolicyData[];
  enforced: number;
  audit: number;
  disabled: number;
}

function cellAccentClass(cell: CellData): string {
  if (cell.policies.length === 0) {
    return "border-dashed border-muted-foreground/15 hover:border-muted-foreground/30";
  }
  if (cell.enforced > 0) {
    return "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10";
  }
  if (cell.audit > 0) {
    return "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10";
  }
  return "border-muted-foreground/20 bg-muted/30";
}

function PolicyCoverageHeatmap({ policies }: { policies: PolicyData[] }) {
  const grid = useMemo(() => {
    const g: Record<string, Record<string, CellData>> = {};
    ALL_POLICY_TYPES.forEach((pt) => {
      g[pt] = {};
      ALL_SCOPES.forEach((scope) => {
        g[pt][scope] = { policies: [], enforced: 0, audit: 0, disabled: 0 };
      });
    });
    policies.forEach((p) => {
      const cell = g[p.policyType]?.[p.scopeType];
      if (!cell) return;
      cell.policies.push(p);
      if (!p.enabled) cell.disabled++;
      else if (p.enforcement === "block") cell.enforced++;
      else cell.audit++;
    });
    return g;
  }, [policies]);

  const totals = useMemo(() => {
    let enforced = 0,
      audit = 0,
      empty = 0;
    ALL_POLICY_TYPES.forEach((pt) => {
      ALL_SCOPES.forEach((scope) => {
        const c = grid[pt][scope];
        if (c.policies.length === 0) empty++;
        else if (c.enforced > 0) enforced++;
        else if (c.audit > 0) audit++;
      });
    });
    const totalCells = ALL_POLICY_TYPES.length * ALL_SCOPES.length;
    return { enforced, audit, empty, totalCells };
  }, [grid]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>Policy Coverage Matrix</CardTitle>
            <CardDescription>
              {policies.length} policies across {ALL_POLICY_TYPES.length} types ×{" "}
              {ALL_SCOPES.length} scopes — {totals.empty} cells uncovered
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
              {totals.enforced} enforced
            </Badge>
            <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">
              {totals.audit} audit
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {totals.empty} gaps
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-muted-foreground sticky left-0 bg-card px-2 py-2 text-left font-medium uppercase tracking-wider text-[10px] w-32">
                  Type
                </th>
                {ALL_SCOPES.map((scope) => (
                  <th
                    key={scope}
                    className="text-muted-foreground px-2 py-2 text-center font-medium uppercase tracking-wider text-[10px] capitalize"
                  >
                    {scope}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_POLICY_TYPES.map((pt) => (
                <tr key={pt}>
                  <td className="sticky left-0 bg-card px-2 py-1.5 font-medium text-xs whitespace-nowrap border-r">
                    {pt.replace(/_/g, " ")}
                  </td>
                  {ALL_SCOPES.map((scope) => {
                    const cell = grid[pt][scope];
                    const isEmpty = cell.policies.length === 0;
                    return (
                      <td key={scope} className="p-1 align-top">
                        <div
                          className={`min-h-[60px] border rounded p-1.5 transition-colors cursor-default ${cellAccentClass(cell)}`}
                          title={
                            isEmpty
                              ? `No ${pt} policy at ${scope} scope`
                              : cell.policies
                                  .map((p) => `${p.name} (${p.enforcement})`)
                                  .join(", ")
                          }
                        >
                          {isEmpty ? (
                            <div className="h-full flex items-center justify-center">
                              <span className="text-muted-foreground/40 text-[10px]">—</span>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="font-bold tabular-nums">
                                  {cell.policies.length}
                                </span>
                                <span className="flex items-center gap-0.5">
                                  {cell.enforced > 0 && (
                                    <span className="size-1.5 rounded-full bg-emerald-500" />
                                  )}
                                  {cell.audit > 0 && (
                                    <span className="size-1.5 rounded-full bg-amber-500" />
                                  )}
                                  {cell.disabled > 0 && (
                                    <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                                  )}
                                </span>
                              </div>
                              <div className="space-y-0.5">
                                {cell.policies.slice(0, 2).map((p) => (
                                  <div
                                    key={p.id}
                                    className="text-[10px] truncate text-foreground/80 leading-tight"
                                  >
                                    {p.name}
                                  </div>
                                ))}
                                {cell.policies.length > 2 && (
                                  <div className="text-[10px] text-muted-foreground">
                                    +{cell.policies.length - 2} more
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Policy enforcement helpers ──────────────────────────────────── */

function enforcementVariant(enforcement: string) {
  switch (enforcement) {
    case "block":
      return "destructive";
    case "warn":
      return "secondary";
    case "log":
      return "outline";
    default:
      return "outline";
  }
}

function ActionsCell({
  policy,
  onRefresh,
  onEdit,
  onHistory,
}: {
  policy: PolicyData;
  onRefresh: () => void;
  onEdit: (policy: PolicyData) => void;
  onHistory: (policy: PolicyData) => void;
}) {
  const confirm = useConfirm();
  const [toggleEnabled] = useMutation<{ togglePolicyEnabled: TogglePolicyEnabledPayload }>(TOGGLE_POLICY_ENABLED);
  const [deletePolicy] = useMutation<{ deletePolicy: DeletePolicyPayload }>(DELETE_POLICY);
  const [duplicatePolicy] = useMutation<{ duplicatePolicy: { success: boolean; error: string; policy: PolicyData } }>(DUPLICATE_POLICY);

  const handleDuplicate = async () => {
    try {
      const { data } = await duplicatePolicy({ variables: { id: policy.id } });
      if (data?.duplicatePolicy?.success) {
        toast.success(`Duplicated "${policy.name}"`);
        onRefresh();
      } else {
        toast.error(data?.duplicatePolicy?.error ?? "Failed to duplicate");
      }
    } catch {
      toast.error("Failed to duplicate policy");
    }
  };

  const handleToggle = async () => {
    try {
      const { data } = await toggleEnabled({ variables: { id: policy.id } });
      if (data?.togglePolicyEnabled?.success) {
        toast.success(
          `"${policy.name}" ${policy.enabled ? "disabled" : "enabled"}`
        );
        onRefresh();
      } else {
        toast.error(data?.togglePolicyEnabled?.error ?? "Failed to toggle");
      }
    } catch {
      toast.error("Failed to toggle policy");
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete Policy",
      description: `Permanently delete "${policy.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const { data } = await deletePolicy({ variables: { id: policy.id } });
      if (data?.deletePolicy?.success) {
        toast.success(`"${policy.name}" deleted`);
        onRefresh();
      } else {
        toast.error(data?.deletePolicy?.error ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete policy");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(policy)}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleToggle}>
          {policy.enabled ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDuplicate}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onHistory(policy)}>
          History
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function PoliciesPage() {
  const { policies, loading, refetch } = usePolicies();
  const [editPolicy, setEditPolicy] = useState<PolicyData | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [historyPolicy, setHistoryPolicy] = useState<PolicyData | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleEdit = (policy: PolicyData) => {
    setEditPolicy(policy);
    setEditOpen(true);
  };

  const handleHistory = (policy: PolicyData) => {
    setHistoryPolicy(policy);
    setHistoryOpen(true);
  };

  const columns: ColumnDef<PolicyData, unknown>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <Link
          href={`/policies/${row.original.id}`}
          className="font-medium hover:underline underline-offset-2"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "policyType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.policyType}</Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.policyType === filterValue;
      },
    },
    {
      accessorKey: "scopeType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Scope" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.scopeName ?? row.original.scopeType}
        </span>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.scopeType === filterValue;
      },
    },
    {
      accessorKey: "enforcement",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Enforcement" />
      ),
      cell: ({ row }) => (
        <Badge variant={enforcementVariant(row.original.enforcement)}>
          {row.original.enforcement}
        </Badge>
      ),
    },
    {
      accessorKey: "enabled",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Enabled" />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.enabled ? "default" : "secondary"}>
          {row.original.enabled ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      accessorKey: "priority",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Priority" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.priority}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <ActionsCell
          policy={row.original}
          onRefresh={refetch}
          onEdit={handleEdit}
          onHistory={handleHistory}
        />
      ),
      enableSorting: false,
    },
  ];

  const policyTypes = [...new Set(policies.map((p) => p.policyType))].sort();
  const scopeTypes = [...new Set(policies.map((p) => p.scopeType))].sort();

  const filters: FilterConfig[] = [
    {
      id: "policyType",
      label: "Policy Type",
      type: "select",
      options: policyTypes.map((t) => ({ value: t, label: t })),
    },
    {
      id: "scopeType",
      label: "Scope",
      type: "select",
      options: scopeTypes.map((s) => ({ value: s, label: s })),
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Policies</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Define and manage governance policies for your AI agents
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/policies/create">
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Create Policy
          </Link>
        </Button>
      </div>

      <div data-tour="policies-heatmap">
        <PolicyCoverageHeatmap policies={policies} />
      </div>

      <div data-tour="policies-table">
      <DataTable
        data={policies}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search policies..."
      />
      </div>

      <EditPolicyDialog
        policy={editPolicy}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refetch}
      />

      <PolicyHistoryDialog
        policy={historyPolicy}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
