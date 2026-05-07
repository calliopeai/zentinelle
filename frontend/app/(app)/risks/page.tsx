"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { useRisks, useRiskStats } from "@/graphql/risks/hooks";
import type { RiskData } from "@/graphql/risks/types";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangleIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  BarChart3Icon,
} from "lucide-react";

function riskLevelVariant(level: string | null) {
  switch (level?.toLowerCase()) {
    case "critical":
      return "destructive";
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "outline";
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "open":
      return "destructive";
    case "mitigating":
      return "secondary";
    case "accepted":
      return "outline";
    case "closed":
      return "default";
    default:
      return "outline";
  }
}

export default function RisksPage() {
  const { risks, loading } = useRisks();
  const { stats, loading: statsLoading } = useRiskStats();

  const columns: ColumnDef<RiskData, unknown>[] = [
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
      accessorKey: "category",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Category" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.categoryDisplay ?? row.original.category}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.category === filterValue;
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {row.original.statusDisplay ?? row.original.status}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.status === filterValue;
      },
    },
    {
      accessorKey: "likelihood",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Likelihood" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.likelihoodDisplay ?? row.original.likelihood}
        </span>
      ),
    },
    {
      accessorKey: "impact",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Impact" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.impactDisplay ?? row.original.impact}
        </span>
      ),
    },
    {
      accessorKey: "riskScore",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Risk Score" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">
            {row.original.riskScore ?? "--"}
          </span>
          {row.original.riskLevel && (
            <Badge variant={riskLevelVariant(row.original.riskLevel)}>
              {row.original.riskLevel}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "ownerName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Owner" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.ownerName ?? "--"}
        </span>
      ),
    },
  ];

  const categories = [...new Set(risks.map((r) => r.category))].sort();
  const statuses = [...new Set(risks.map((r) => r.status))].sort();

  const filters: FilterConfig[] = [
    {
      id: "category",
      label: "Category",
      type: "select",
      options: categories.map((c) => ({ value: c, label: c })),
    },
    {
      id: "status",
      label: "Status",
      type: "select",
      options: statuses.map((s) => ({ value: s, label: s })),
    },
  ];

  if (loading || statsLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-md" />
      </div>
    );
  }

  const summaryCards = [
    {
      label: "Total Risks",
      value: stats?.totalRisks ?? 0,
      icon: BarChart3Icon,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Open Risks",
      value: stats?.openRisks ?? 0,
      icon: AlertTriangleIcon,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Critical",
      value: stats?.criticalRisks ?? 0,
      icon: ShieldAlertIcon,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
    },
    {
      label: "High",
      value: stats?.highRisks ?? 0,
      icon: ShieldCheckIcon,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-500/10",
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Risks</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Identify, assess, and track risks across your AI operations
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {label}
              </CardTitle>
              <div className={`${bg} rounded-md p-1.5`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        data={risks}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search risks..."
      />
    </div>
  );
}
