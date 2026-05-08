"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GitCompareArrowsIcon,
  Loader2Icon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PolicyData } from "@/graphql/policies/types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";

/* ── Types ───────────────────────────────────────────────────────── */

interface PolicyVersion {
  id: number;
  policy_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  changed_by: string | null;
  changed_at: string | null;
  change_summary: string | null;
}

interface HistoryResponse {
  count: number;
  results: PolicyVersion[];
}

interface DiffPayload {
  policy_id: string;
  from_version: number;
  to_version: number;
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, unknown>;
}

/* ── Formatting helpers ──────────────────────────────────────────── */

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatJSON(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isConfigSubDiff(
  v: unknown,
): v is { added?: Record<string, unknown>; removed?: Record<string, unknown>; changed?: Record<string, unknown> } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    ("added" in v || "removed" in v || "changed" in v)
  );
}

/* ── Component ───────────────────────────────────────────────────── */

interface HistoryDialogProps {
  policy: PolicyData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PolicyHistoryDialog({
  policy,
  open,
  onOpenChange,
}: HistoryDialogProps) {
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const policyId = policy?.id ?? null;

  const loadHistory = useCallback(async () => {
    if (!policyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/policies/${policyId}/history/`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Failed to load history (${res.status})${text ? `: ${text}` : ""}`,
        );
      }
      const data: HistoryResponse = await res.json();
      setVersions(data.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history");
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [policyId]);

  // Reset state and load fresh data each time the dialog opens
  useEffect(() => {
    if (open && policyId) {
      setExpanded(null);
      setSelected(new Set());
      setDiff(null);
      setDiffError(null);
      loadHistory();
    }
  }, [open, policyId, loadHistory]);

  const toggleSelected = useCallback((version: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(version)) {
        next.delete(version);
      } else {
        // Cap at 2 selections — drop the oldest selection if a third is added
        if (next.size >= 2) {
          const oldest = [...next][0];
          next.delete(oldest);
        }
        next.add(version);
      }
      return next;
    });
    // Selection change invalidates the rendered diff
    setDiff(null);
    setDiffError(null);
  }, []);

  const compareEnabled = selected.size === 2;

  const runDiff = useCallback(async () => {
    if (!policyId || selected.size !== 2) return;
    const sorted = [...selected].sort((a, b) => a - b);
    const [from, to] = sorted;
    setDiffLoading(true);
    setDiffError(null);
    try {
      const res = await fetch(
        `${API_URL}/policies/${policyId}/diff/?from=${from}&to=${to}`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Failed to compute diff (${res.status})${text ? `: ${text}` : ""}`,
        );
      }
      const data: DiffPayload = await res.json();
      setDiff(data);
    } catch (e) {
      setDiffError(e instanceof Error ? e.message : "Failed to compute diff");
      setDiff(null);
    } finally {
      setDiffLoading(false);
    }
  }, [policyId, selected]);

  const selectedVersions = useMemo(
    () => [...selected].sort((a, b) => a - b),
    [selected],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[95vw] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span>Version History</span>
            {policy && (
              <Badge variant="outline" className="font-normal">
                {policy.name}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Inspect prior revisions and compare any two versions to see exactly
            what changed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-6">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-muted-foreground text-xs">
              {versions.length > 0
                ? `${versions.length} version${versions.length === 1 ? "" : "s"}`
                : null}
              {selected.size > 0 && (
                <span className="ml-2">
                  · Selected:{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {selectedVersions.map((v) => `v${v}`).join(" → ")}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={loadHistory}
                disabled={loading}
              >
                <RefreshCwIcon
                  className={cn(
                    "mr-1.5 h-3.5 w-3.5",
                    loading && "animate-spin",
                  )}
                />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={runDiff}
                disabled={!compareEnabled || diffLoading}
              >
                {diffLoading ? (
                  <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitCompareArrowsIcon className="mr-1.5 h-3.5 w-3.5" />
                )}
                Compare {compareEnabled ? "selected" : "(pick 2)"}
              </Button>
            </div>
          </div>

          {/* Diff result */}
          {diffError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {diffError}
            </div>
          )}
          {diff && <DiffView diff={diff} />}

          {/* History table */}
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            {error ? (
              <div className="text-muted-foreground p-6 text-center text-sm">
                <span className="text-red-600 dark:text-red-400">
                  {error}
                </span>
              </div>
            ) : loading ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 p-10 text-sm">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Loading history…
              </div>
            ) : versions.length === 0 ? (
              <div className="text-muted-foreground p-10 text-center text-sm">
                No history recorded for this policy yet. Future edits will
                appear here.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/40 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-[44px]" />
                    <TableHead className="w-[40px]">Pick</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => {
                    const isExpanded = expanded === v.version;
                    const isSelected = selected.has(v.version);
                    return (
                      <>
                        <TableRow
                          key={`row-${v.version}`}
                          data-state={isSelected ? "selected" : undefined}
                          className={cn(
                            "cursor-pointer",
                            isSelected && "bg-primary/5",
                          )}
                          onClick={() =>
                            setExpanded(isExpanded ? null : v.version)
                          }
                        >
                          <TableCell className="pl-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpanded(isExpanded ? null : v.version);
                              }}
                              aria-label={isExpanded ? "Collapse" : "Expand"}
                            >
                              {isExpanded ? (
                                <ChevronDownIcon className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRightIcon className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="border-input text-primary focus-visible:ring-ring h-4 w-4 cursor-pointer rounded border bg-transparent focus:outline-none focus-visible:ring-2"
                              checked={isSelected}
                              onChange={() => toggleSelected(v.version)}
                              aria-label={`Select version ${v.version} for comparison`}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="font-mono tabular-nums"
                            >
                              v{v.version}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {formatDate(v.changed_at)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {v.changed_by || (
                              <span className="text-muted-foreground italic">
                                system
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-[400px] truncate text-sm">
                            {v.change_summary || (
                              <span className="italic">no summary</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow
                            key={`expand-${v.version}`}
                            className="bg-muted/30 hover:bg-muted/30"
                          >
                            <TableCell colSpan={6} className="p-0">
                              <div className="px-4 py-3">
                                <div className="text-muted-foreground mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider">
                                  <span>
                                    Snapshot · v{v.version}
                                  </span>
                                  <button
                                    className="hover:text-foreground inline-flex items-center gap-1 normal-case tracking-normal"
                                    onClick={() => setExpanded(null)}
                                  >
                                    <XIcon className="h-3 w-3" />
                                    Collapse
                                  </button>
                                </div>
                                <pre className="bg-background max-h-[320px] overflow-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed">
                                  {formatJSON(v.snapshot)}
                                </pre>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Diff view ───────────────────────────────────────────────────── */

function DiffView({ diff }: { diff: DiffPayload }) {
  const addedKeys = Object.keys(diff.added ?? {});
  const removedKeys = Object.keys(diff.removed ?? {});
  const changedKeys = Object.keys(diff.changed ?? {});

  const empty =
    addedKeys.length === 0 &&
    removedKeys.length === 0 &&
    changedKeys.length === 0;

  return (
    <div className="rounded-md border">
      <div className="bg-muted/40 flex items-center justify-between border-b px-3 py-2 text-xs">
        <span className="font-medium">
          Diff{" "}
          <span className="text-muted-foreground font-mono">
            v{diff.from_version} → v{diff.to_version}
          </span>
        </span>
        <span className="text-muted-foreground flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {addedKeys.length} added
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            {changedKeys.length} changed
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            {removedKeys.length} removed
          </span>
        </span>
      </div>

      <div className="max-h-[280px] overflow-auto p-3">
        {empty ? (
          <p className="text-muted-foreground py-2 text-center text-sm">
            No differences between these versions.
          </p>
        ) : (
          <div className="flex flex-col gap-1 font-mono text-[11px] leading-relaxed">
            {addedKeys.map((k) => (
              <DiffLine key={`a-${k}`} kind="added" field={k} value={diff.added[k]} />
            ))}
            {removedKeys.map((k) => (
              <DiffLine
                key={`r-${k}`}
                kind="removed"
                field={k}
                value={diff.removed[k]}
              />
            ))}
            {changedKeys.map((k) => {
              const v = diff.changed[k];
              if (k === "config" && isConfigSubDiff(v)) {
                return <ConfigSubDiff key={`c-${k}`} sub={v} />;
              }
              if (Array.isArray(v) && v.length === 2) {
                return (
                  <DiffChangeLine
                    key={`c-${k}`}
                    field={k}
                    oldVal={v[0]}
                    newVal={v[1]}
                  />
                );
              }
              return (
                <DiffLine
                  key={`c-${k}`}
                  kind="changed"
                  field={k}
                  value={v as unknown}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffLine({
  kind,
  field,
  value,
}: {
  kind: "added" | "removed" | "changed";
  field: string;
  value: unknown;
}) {
  const styles = {
    added:
      "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
    removed: "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300",
    changed:
      "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  } as const;
  const prefix = { added: "+", removed: "-", changed: "~" }[kind];
  return (
    <div className={cn("rounded border-l-2 px-2 py-1", styles[kind])}>
      <span className="mr-2 select-none">{prefix}</span>
      <span className="font-semibold">{field}:</span>{" "}
      <span className="text-foreground/80">{formatJSON(value)}</span>
    </div>
  );
}

function DiffChangeLine({
  field,
  oldVal,
  newVal,
}: {
  field: string;
  oldVal: unknown;
  newVal: unknown;
}) {
  return (
    <div className="rounded border-l-2 border-amber-500/30 bg-amber-500/5 px-2 py-1">
      <div className="text-amber-700 dark:text-amber-300">
        <span className="mr-2 select-none">~</span>
        <span className="font-semibold">{field}</span>
      </div>
      <div className="ml-5 mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
        <div className="text-red-700 dark:text-red-300">
          <span className="mr-1 select-none">−</span>
          {formatJSON(oldVal)}
        </div>
        <div className="text-emerald-700 dark:text-emerald-300">
          <span className="mr-1 select-none">+</span>
          {formatJSON(newVal)}
        </div>
      </div>
    </div>
  );
}

function ConfigSubDiff({
  sub,
}: {
  sub: {
    added?: Record<string, unknown>;
    removed?: Record<string, unknown>;
    changed?: Record<string, unknown>;
  };
}) {
  const added = Object.entries(sub.added ?? {});
  const removed = Object.entries(sub.removed ?? {});
  const changed = Object.entries(sub.changed ?? {});
  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return null;
  }
  return (
    <div className="rounded border-l-2 border-amber-500/30 bg-amber-500/5 px-2 py-1">
      <div className="text-amber-700 dark:text-amber-300">
        <span className="mr-2 select-none">~</span>
        <span className="font-semibold">config</span>{" "}
        <span className="text-muted-foreground">(field-level changes)</span>
      </div>
      <div className="ml-5 mt-1 flex flex-col gap-1">
        {added.map(([k, v]) => (
          <DiffLine key={`ca-${k}`} kind="added" field={k} value={v} />
        ))}
        {removed.map(([k, v]) => (
          <DiffLine key={`cr-${k}`} kind="removed" field={k} value={v} />
        ))}
        {changed.map(([k, v]) => {
          if (Array.isArray(v) && v.length === 2) {
            return (
              <DiffChangeLine
                key={`cc-${k}`}
                field={k}
                oldVal={v[0]}
                newVal={v[1]}
              />
            );
          }
          return (
            <DiffLine
              key={`cc-${k}`}
              kind="changed"
              field={k}
              value={v as unknown}
            />
          );
        })}
      </div>
    </div>
  );
}
