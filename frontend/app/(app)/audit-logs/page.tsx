"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuditLogs } from "@/graphql/events/hooks";
import type { AuditLogData, AuditChange } from "@/graphql/events/types";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString();
}

/* ── Audit chain verification ─────────────────────────────────── */

interface VerifyResult {
  valid: boolean;
  records_checked: number;
  broken_at_sequence: number | null;
  root_hash: string;
  expected_hash?: string;
  actual_hash?: string;
}

interface VerifyState {
  loading: boolean;
  result: VerifyResult | null;
  error: string | null;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "/api/zentinelle/v1";

async function verifyAuditChain(): Promise<VerifyResult> {
  const res = await fetch(`${API_BASE_URL}/audit/verify`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data?.error || data?.detail || message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  return (await res.json()) as VerifyResult;
}

function VerifyChainDialog({
  open,
  onOpenChange,
  state,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  state: VerifyState;
  onRetry: () => void;
}) {
  const { loading, result, error } = state;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5" />
            Audit Chain Verification
          </DialogTitle>
          <DialogDescription>
            Recomputes every entry hash and validates linkage across the
            tamper-evident audit chain.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {loading && (
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Verifying audit chain...
            </div>
          )}

          {!loading && error && (
            <div className="border-destructive/40 bg-destructive/5 flex items-start gap-3 rounded-md border p-3">
              <XCircleIcon className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  Verification request failed
                </div>
                <div className="text-muted-foreground text-xs">{error}</div>
              </div>
            </div>
          )}

          {!loading && !error && result && result.valid && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
                <CheckCircle2Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    Audit chain verified
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {result.records_checked.toLocaleString()}{" "}
                    {result.records_checked === 1 ? "entry" : "entries"} checked,
                    all hashes valid.
                  </div>
                </div>
              </div>

              <div className="text-xs">
                <div className="text-muted-foreground mb-1 text-[10px] font-medium uppercase tracking-wider">
                  Root hash
                </div>
                <code className="bg-muted block break-all rounded-md p-2 font-mono text-[11px]">
                  {result.root_hash || "(empty chain)"}
                </code>
              </div>
            </div>
          )}

          {!loading && !error && result && !result.valid && (
            <div className="space-y-3">
              <div className="border-destructive/40 bg-destructive/5 flex items-start gap-3 rounded-md border p-3">
                <XCircleIcon className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    Chain broken at entry #{result.broken_at_sequence ?? "?"}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Verified {result.records_checked.toLocaleString()} entries
                    before detecting a hash mismatch. The chain is no longer
                    tamper-evident from this point onward.
                  </div>
                </div>
              </div>

              {(result.expected_hash || result.actual_hash) && (
                <div className="space-y-2 text-xs">
                  {result.expected_hash && (
                    <div>
                      <div className="text-muted-foreground mb-1 text-[10px] font-medium uppercase tracking-wider">
                        Expected hash
                      </div>
                      <code className="block break-all rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                        {result.expected_hash}
                      </code>
                    </div>
                  )}
                  {result.actual_hash && (
                    <div>
                      <div className="text-muted-foreground mb-1 text-[10px] font-medium uppercase tracking-wider">
                        Actual hash
                      </div>
                      <code className="border-destructive/30 bg-destructive/5 text-destructive block break-all rounded-md border p-2 font-mono text-[11px]">
                        {result.actual_hash}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {result.root_hash && (
                <div className="text-xs">
                  <div className="text-muted-foreground mb-1 text-[10px] font-medium uppercase tracking-wider">
                    Last good root hash
                  </div>
                  <code className="bg-muted block break-all rounded-md p-2 font-mono text-[11px]">
                    {result.root_hash}
                  </code>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onRetry}
            disabled={loading}
            size="sm"
          >
            {loading ? (
              <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheckIcon className="mr-1.5 h-3.5 w-3.5" />
            )}
            Re-run
          </Button>
          <Button onClick={() => onOpenChange(false)} size="sm">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpandableChanges({ changes }: { changes: AuditChange[] | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!changes || changes.length === 0) {
    return <span className="text-muted-foreground text-xs">--</span>;
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-1 text-xs"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDownIcon className="h-3 w-3" />
        ) : (
          <ChevronRightIcon className="h-3 w-3" />
        )}
        {changes.length} change{changes.length !== 1 ? "s" : ""}
      </Button>
      {expanded && (
        <div className="bg-muted mt-2 space-y-1 rounded-md p-2">
          {changes.map((change, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium">{change.field}:</span>{" "}
              <span className="text-red-600 line-through dark:text-red-400">
                {change.oldValue ?? "null"}
              </span>{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                {change.newValue ?? "null"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  const { auditLogs, loading } = useAuditLogs();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyState, setVerifyState] = useState<VerifyState>({
    loading: false,
    result: null,
    error: null,
  });

  const runVerify = async () => {
    setVerifyOpen(true);
    setVerifyState({ loading: true, result: null, error: null });
    try {
      const result = await verifyAuditChain();
      setVerifyState({ loading: false, result, error: null });
      if (result.valid) {
        toast.success(
          `Audit chain verified — ${result.records_checked.toLocaleString()} ${
            result.records_checked === 1 ? "entry" : "entries"
          }, all hashes valid`,
        );
      } else {
        toast.error(
          `Chain broken at entry #${result.broken_at_sequence ?? "?"}`,
          {
            description: `Verified ${result.records_checked.toLocaleString()} entries before mismatch.`,
          },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to verify";
      setVerifyState({ loading: false, result: null, error: msg });
      toast.error("Audit chain verification failed", { description: msg });
    }
  };

  const columns: ColumnDef<AuditLogData, unknown>[] = [
    {
      accessorKey: "action",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Action" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.action}</Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.action === filterValue;
      },
    },
    {
      accessorKey: "resourceType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Resource Type" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.resourceType}</span>
      ),
    },
    {
      accessorKey: "resourceName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Resource" />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-sm">{row.original.resourceName}</span>
      ),
    },
    {
      id: "actor",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Actor" />
      ),
      accessorFn: (row) => row.actor?.email ?? row.actor?.name ?? "--",
      cell: ({ row }) => {
        const actor = row.original.actor;
        return (
          <div className="text-sm">
            <span>{actor?.name ?? actor?.email ?? "--"}</span>
            {actor?.type && (
              <Badge variant="outline" className="ml-1.5">
                {actor.type}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "timestamp",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Timestamp" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatTimestamp(row.original.timestamp)}
        </span>
      ),
    },
    {
      id: "changes",
      header: () => (
        <span className="flex h-8 items-center text-sm font-medium">Changes</span>
      ),
      cell: ({ row }) => <ExpandableChanges changes={row.original.changes} />,
      enableSorting: false,
    },
  ];

  const actionTypes = [...new Set(auditLogs.map((l) => l.action))].sort();

  const filters: FilterConfig[] = [
    {
      id: "action",
      label: "Action",
      type: "select",
      options: actionTypes.map((a) => ({ value: a, label: a })),
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Audit Logs</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track all changes and actions performed in your organization
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runVerify}
            disabled={verifyState.loading}
            className="h-9"
          >
            {verifyState.loading ? (
              <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheckIcon className="mr-1.5 h-4 w-4" />
            )}
            Verify Chain
          </Button>
          {["csv", "json"].map((fmt) => (
            <a
              key={fmt}
              href={`${process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1"}/audit/export/?format=${fmt}&from=2020-01-01&to=2030-01-01`}
              target="_blank"
              rel="noopener noreferrer"
              className="border-input bg-background hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium uppercase"
            >
              Export {fmt}
            </a>
          ))}
        </div>
      </div>
      <DataTable
        data={auditLogs}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search audit logs..."
      />

      <VerifyChainDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        state={verifyState}
        onRetry={runVerify}
      />
    </div>
  );
}
