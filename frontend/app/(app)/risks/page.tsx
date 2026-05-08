"use client";

import { useState, useMemo, useCallback } from "react";
import { useMutation } from "@apollo/client/react";
import { type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { useRisks, useRiskStats } from "@/graphql/risks/hooks";
import { GET_RISKS } from "@/graphql/risks/queries";
import { DELETE_RISK } from "@/graphql/risks/mutations";
import { useConfirm } from "@/hooks/use-confirm";
import type { RiskData } from "@/graphql/risks/types";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangleIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  BarChart3Icon,
  XIcon,
  PlusIcon,
} from "lucide-react";
import { EditRiskDialog } from "./edit-risk-dialog";

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

/* ── Risk Matrix helpers ─────────────────────────────────────────── */

const MATRIX_SIZE = 5;
const IMPACT_LABELS = ["Negligible", "Minor", "Moderate", "Major", "Severe"];
const LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];

function matrixCellColor(score: number): string {
  if (score <= 4)  return "bg-emerald-600/30 hover:bg-emerald-500/50 border-emerald-500/40";
  if (score <= 9)  return "bg-yellow-500/30 hover:bg-yellow-400/50 border-yellow-500/40";
  if (score <= 15) return "bg-orange-500/35 hover:bg-orange-400/55 border-orange-500/50";
  return "bg-red-500/40 hover:bg-red-400/60 border-red-500/50";
}

function matrixCellColorSelected(score: number): string {
  if (score <= 4)  return "bg-emerald-500/60 border-emerald-400 ring-2 ring-emerald-400/60";
  if (score <= 9)  return "bg-yellow-500/60 border-yellow-400 ring-2 ring-yellow-400/60";
  if (score <= 15) return "bg-orange-500/60 border-orange-400 ring-2 ring-orange-400/60";
  return "bg-red-500/60 border-red-400 ring-2 ring-red-400/60";
}

interface MatrixCell {
  likelihood: number;
  impact: number;
  score: number;
  risks: RiskData[];
}

function RiskMatrix({
  risks,
  selectedCell,
  onCellClick,
}: {
  risks: RiskData[];
  selectedCell: { likelihood: number; impact: number } | null;
  onCellClick: (likelihood: number, impact: number) => void;
}) {
  const grid = useMemo(() => {
    const cells: MatrixCell[][] = [];
    for (let l = MATRIX_SIZE; l >= 1; l--) {
      const row: MatrixCell[] = [];
      for (let i = 1; i <= MATRIX_SIZE; i++) {
        row.push({
          likelihood: l,
          impact: i,
          score: l * i,
          risks: risks.filter((r) => r.likelihood === l && r.impact === i),
        });
      }
      cells.push(row);
    }
    return cells;
  }, [risks]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Risk Matrix</CardTitle>
            <CardDescription>
              5x5 likelihood vs impact assessment grid
              {selectedCell && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCellClick(0, 0);
                  }}
                  className="text-muted-foreground hover:text-foreground ml-2 inline-flex items-center gap-1 text-xs"
                >
                  <XIcon className="h-3 w-3" />
                  Clear filter
                </button>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/40" />
              Low (1-4)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/40" />
              Medium (5-9)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-500/40" />
              High (10-15)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/40" />
              Critical (16-25)
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {/* Y-axis label */}
          <div className="flex flex-col items-center justify-center">
            <span className="text-muted-foreground -rotate-90 whitespace-nowrap text-xs font-medium tracking-wide uppercase">
              Likelihood
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-0">
            {/* Y-axis tick labels + grid */}
            <div className="flex flex-1 flex-col">
              {grid.map((row, rowIdx) => (
                <div key={rowIdx} className="flex items-stretch">
                  {/* Y-axis tick */}
                  <div className="flex w-24 shrink-0 items-center justify-end pr-2">
                    <span className="text-muted-foreground text-[11px]">
                      {LIKELIHOOD_LABELS[MATRIX_SIZE - 1 - rowIdx]}
                    </span>
                  </div>
                  {/* Cells */}
                  <div className="grid flex-1 grid-cols-5 gap-0">
                    {row.map((cell) => {
                      const isSelected =
                        selectedCell?.likelihood === cell.likelihood &&
                        selectedCell?.impact === cell.impact;
                      return (
                        <button
                          key={`${cell.likelihood}-${cell.impact}`}
                          onClick={() => onCellClick(cell.likelihood, cell.impact)}
                          className={`relative flex min-h-[52px] flex-col items-center justify-center border transition-all ${
                            isSelected
                              ? matrixCellColorSelected(cell.score)
                              : matrixCellColor(cell.score)
                          } cursor-pointer`}
                          title={`Likelihood: ${cell.likelihood}, Impact: ${cell.impact}, Score: ${cell.score}`}
                        >
                          <span className="text-muted-foreground text-[10px] font-medium">
                            {cell.score}
                          </span>
                          {cell.risks.length > 0 && (
                            <div className="mt-0.5 flex items-center gap-0.5">
                              {cell.risks.length <= 3 ? (
                                cell.risks.map((r) => (
                                  <div
                                    key={r.id}
                                    className="bg-foreground/70 h-2 w-2 rounded-full"
                                    title={r.name}
                                  />
                                ))
                              ) : (
                                <span className="text-foreground text-[11px] font-bold">
                                  {cell.risks.length}
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* X-axis labels */}
            <div className="flex">
              <div className="w-24 shrink-0" />
              <div className="grid flex-1 grid-cols-5 gap-1 pt-1">
                {IMPACT_LABELS.map((label) => (
                  <div key={label} className="text-center">
                    <span className="text-muted-foreground text-[11px]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* X-axis title */}
            <div className="flex">
              <div className="w-24 shrink-0" />
              <div className="pt-1 text-center">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Impact
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export default function RisksPage() {
  const { risks, loading, refetch } = useRisks();
  const { stats, loading: statsLoading } = useRiskStats();
  const [selectedCell, setSelectedCell] = useState<{
    likelihood: number;
    impact: number;
  } | null>(null);
  const [editRisk, setEditRisk] = useState<RiskData | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const handleEdit = (risk: RiskData) => {
    setEditRisk(risk);
    setEditOpen(true);
  };

  const confirmDialog = useConfirm();
  const [deleteRisk] = useMutation(DELETE_RISK, {
    refetchQueries: [GET_RISKS],
  });

  const handleDelete = async (risk: RiskData) => {
    const ok = await confirmDialog({
      title: `Delete risk "${risk.name}"?`,
      description:
        "Permanently removes this risk from the register. This cannot be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await deleteRisk({ variables: { id: risk.id } });
      toast.success("Risk deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete risk");
    }
  };

  const handleCellClick = useCallback(
    (likelihood: number, impact: number) => {
      if (likelihood === 0 && impact === 0) {
        setSelectedCell(null);
        return;
      }
      if (
        selectedCell?.likelihood === likelihood &&
        selectedCell?.impact === impact
      ) {
        setSelectedCell(null);
      } else {
        setSelectedCell({ likelihood, impact });
      }
    },
    [selectedCell]
  );

  const filteredRisks = useMemo(() => {
    if (!selectedCell) return risks;
    return risks.filter(
      (r) =>
        r.likelihood === selectedCell.likelihood &&
        r.impact === selectedCell.impact
    );
  }, [risks, selectedCell]);

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
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(row.original)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handleDelete(row.original)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
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
        <Skeleton className="h-[300px] w-full rounded-md" />
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Risks</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Identify, assess, and track risks across your AI operations
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/risks/create">
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Create Risk
          </Link>
        </Button>
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

      <RiskMatrix
        risks={risks}
        selectedCell={selectedCell}
        onCellClick={handleCellClick}
      />

      {selectedCell && (
        <p className="text-muted-foreground -mt-2 text-sm">
          Showing {filteredRisks.length} risk{filteredRisks.length !== 1 ? "s" : ""} at
          likelihood {selectedCell.likelihood}, impact {selectedCell.impact}
          (score {selectedCell.likelihood * selectedCell.impact})
        </p>
      )}

      <DataTable
        data={filteredRisks}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search risks..."
      />

      <EditRiskDialog
        risk={editRisk}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refetch}
      />
    </div>
  );
}
