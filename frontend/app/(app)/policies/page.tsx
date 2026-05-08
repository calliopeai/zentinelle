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

type HeatmapCellStatus = "enforced" | "audit" | "none";

function heatmapCellClass(status: HeatmapCellStatus): string {
  switch (status) {
    case "enforced":
      return "bg-emerald-500/30 dark:bg-emerald-500/25";
    case "audit":
      return "bg-amber-500/30 dark:bg-amber-500/25";
    case "none":
      return "bg-muted";
  }
}

function PolicyCoverageHeatmap({ policies }: { policies: PolicyData[] }) {
  const heatmap = useMemo(() => {
    const grid: Record<string, Record<string, HeatmapCellStatus>> = {};
    ALL_POLICY_TYPES.forEach((pt) => {
      grid[pt] = {};
      ALL_SCOPES.forEach((scope) => {
        grid[pt][scope] = "none";
      });
    });
    policies.forEach((p) => {
      const pt = p.policyType;
      const scope = p.scopeType;
      if (grid[pt] && grid[pt][scope] !== undefined) {
        if (p.enabled && p.enforcement === "block") {
          grid[pt][scope] = "enforced";
        } else if (p.enabled && grid[pt][scope] === "none") {
          grid[pt][scope] = "audit";
        }
      }
    });
    return grid;
  }, [policies]);

  const gapCount = useMemo(() => {
    let gaps = 0;
    ALL_POLICY_TYPES.forEach((pt) => {
      ALL_SCOPES.forEach((scope) => {
        if (heatmap[pt][scope] === "none") gaps++;
      });
    });
    return gaps;
  }, [heatmap]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Policy Coverage</CardTitle>
            <CardDescription>
              Governance coverage by policy type and scope
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/40" />
              Enforced
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/40" />
              Audit
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-muted inline-block h-2.5 w-2.5 rounded-sm border" />
              No policy
            </span>
            {gapCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {gapCount} gap{gapCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-muted-foreground px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider">
                  Policy Type
                </th>
                {ALL_SCOPES.map((scope) => (
                  <th
                    key={scope}
                    className="text-muted-foreground px-2 py-1.5 text-center text-[11px] font-medium capitalize"
                  >
                    {scope}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_POLICY_TYPES.map((pt) => (
                <tr key={pt}>
                  <td className="whitespace-nowrap px-2 py-1 text-xs font-medium">
                    {pt.replace(/_/g, " ")}
                  </td>
                  {ALL_SCOPES.map((scope) => (
                    <td key={scope} className="px-1 py-1">
                      <div
                        className={`h-7 rounded-md ${heatmapCellClass(
                          heatmap[pt][scope]
                        )}`}
                        title={`${pt} @ ${scope}: ${heatmap[pt][scope]}`}
                      />
                    </td>
                  ))}
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
}: {
  policy: PolicyData;
  onRefresh: () => void;
  onEdit: (policy: PolicyData) => void;
}) {
  const confirm = useConfirm();
  const [toggleEnabled] = useMutation<{ togglePolicyEnabled: TogglePolicyEnabledPayload }>(TOGGLE_POLICY_ENABLED);
  const [deletePolicy] = useMutation<{ deletePolicy: DeletePolicyPayload }>(DELETE_POLICY);

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

  const handleEdit = (policy: PolicyData) => {
    setEditPolicy(policy);
    setEditOpen(true);
  };

  const columns: ColumnDef<PolicyData, unknown>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
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
        <ActionsCell policy={row.original} onRefresh={refetch} onEdit={handleEdit} />
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

      <PolicyCoverageHeatmap policies={policies} />

      <DataTable
        data={policies}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search policies..."
      />

      <EditPolicyDialog
        policy={editPolicy}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refetch}
      />
    </div>
  );
}
