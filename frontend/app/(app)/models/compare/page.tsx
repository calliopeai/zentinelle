"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3Icon,
  CheckIcon,
  CpuIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useAIModels } from "@/graphql/models/hooks";
import type { AIModelData } from "@/graphql/models/hooks";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MAX_MODELS = 4;

/* ── Formatting helpers ──────────────────────────────────────────── */

function formatContext(tokens: number | null): string {
  if (!tokens) return "--";
  if (tokens >= 1_000_000)
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1_000)
    return `${(tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1)}K`;
  return String(tokens);
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return "--";
  return `$${price.toFixed(2)}`;
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "--";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function riskBadgeVariant(
  risk: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch (risk) {
    case "low":
      return "default";
    case "medium":
      return "secondary";
    case "high":
    case "critical":
      return "destructive";
    default:
      return "outline";
  }
}

function hasCapability(model: AIModelData, cap: string): boolean {
  if (!model.capabilities) return false;
  return model.capabilities.some(
    (c) => c.toLowerCase() === cap.toLowerCase(),
  );
}

/**
 * Estimated cost for 1M input + 100K output tokens.
 * inputPricePerMillion is $/M tokens, outputPricePerMillion is $/M tokens.
 * So: 1M input = inputPricePerMillion * 1, 100K output = outputPricePerMillion * 0.1
 */
function estimatedCost(model: AIModelData): number | null {
  const inP = model.inputPricePerMillion;
  const outP = model.outputPricePerMillion;
  if (inP === null && outP === null) return null;
  return (inP ?? 0) * 1 + (outP ?? 0) * 0.1;
}

/* ── Model picker popover ────────────────────────────────────────── */

function ModelPicker({
  models,
  selectedIds,
  onSelect,
  disabled,
}: {
  models: AIModelData[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) =>
      [m.name, m.modelId, m.providerName, m.providerSlug]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [models, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-1.5"
        >
          <PlusIcon className="h-4 w-4" />
          Add model
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="border-b p-2">
          <Input
            autoFocus
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground p-4 text-center text-sm">
              No models found.
            </div>
          ) : (
            <ul className="py-1">
              {filtered.map((m) => {
                const isSelected = selectedIds.includes(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={isSelected}
                      onClick={() => {
                        onSelect(m.id);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={cn(
                        "hover:bg-muted/60 flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                        isSelected && "opacity-50",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {m.name || m.modelId}
                          </span>
                          {isSelected && (
                            <CheckIcon className="text-primary h-3.5 w-3.5 shrink-0" />
                          )}
                        </div>
                        <div className="text-muted-foreground truncate text-xs">
                          {m.providerName || m.providerSlug}
                          {m.contextWindow
                            ? ` · ${formatContext(m.contextWindow)} ctx`
                            : ""}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Comparison table ───────────────────────────────────────────── */

interface RowConfig {
  label: string;
  render: (model: AIModelData) => React.ReactNode;
  /** Numeric value for "best value" highlighting. Returns null if not comparable. */
  numericValue?: (model: AIModelData) => number | null;
  /** Whether higher is better (true) or lower is better (false). */
  higherIsBetter?: boolean;
}

const ROWS: RowConfig[] = [
  {
    label: "Provider",
    render: (m) => (
      <Badge variant="outline">
        {m.providerName || m.providerSlug || "Unknown"}
      </Badge>
    ),
  },
  {
    label: "Model ID",
    render: (m) => (
      <code className="bg-muted/50 truncate rounded px-1.5 py-0.5 text-xs">
        {m.modelId}
      </code>
    ),
  },
  {
    label: "Type",
    render: (m) => (
      <span className="text-muted-foreground text-sm">
        {m.modelType || "--"}
      </span>
    ),
  },
  {
    label: "Context window",
    render: (m) => formatContext(m.contextWindow),
    numericValue: (m) => m.contextWindow,
    higherIsBetter: true,
  },
  {
    label: "Max output tokens",
    render: (m) => formatContext(m.maxOutputTokens),
    numericValue: (m) => m.maxOutputTokens,
    higherIsBetter: true,
  },
  {
    label: "Input price (per 1M)",
    render: (m) => `${formatPrice(m.inputPricePerMillion)}/M`,
    numericValue: (m) => m.inputPricePerMillion,
    higherIsBetter: false,
  },
  {
    label: "Output price (per 1M)",
    render: (m) => `${formatPrice(m.outputPricePerMillion)}/M`,
    numericValue: (m) => m.outputPricePerMillion,
    higherIsBetter: false,
  },
  {
    label: "Vision",
    render: (m) =>
      hasCapability(m, "vision") ? (
        <CheckIcon className="text-emerald-600 dark:text-emerald-400 h-4 w-4" />
      ) : (
        <span className="text-muted-foreground">--</span>
      ),
  },
  {
    label: "Function calling",
    render: (m) =>
      hasCapability(m, "function_calling") ||
      hasCapability(m, "tools") ||
      hasCapability(m, "tool_use") ? (
        <CheckIcon className="text-emerald-600 dark:text-emerald-400 h-4 w-4" />
      ) : (
        <span className="text-muted-foreground">--</span>
      ),
  },
  {
    label: "Streaming",
    render: (m) =>
      hasCapability(m, "streaming") ? (
        <CheckIcon className="text-emerald-600 dark:text-emerald-400 h-4 w-4" />
      ) : (
        <span className="text-muted-foreground">--</span>
      ),
  },
  {
    label: "Risk level",
    render: (m) =>
      m.riskLevel ? (
        <Badge variant={riskBadgeVariant(m.riskLevel)}>{m.riskLevel}</Badge>
      ) : (
        <span className="text-muted-foreground">--</span>
      ),
  },
  {
    label: "Est. cost (1M in + 100K out)",
    render: (m) => {
      const c = estimatedCost(m);
      return c === null ? (
        <span className="text-muted-foreground">--</span>
      ) : (
        <span className="font-medium">{formatCurrency(c)}</span>
      );
    },
    numericValue: (m) => estimatedCost(m),
    higherIsBetter: false,
  },
];

function findBestIndex(
  models: AIModelData[],
  numericValue: (m: AIModelData) => number | null,
  higherIsBetter: boolean,
): Set<number> {
  const values = models.map((m) => numericValue(m));
  const valid = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (valid.length < 2) return new Set();
  const best = higherIsBetter ? Math.max(...valid) : Math.min(...valid);
  const bestIndices = new Set<number>();
  values.forEach((v, i) => {
    if (v !== null && !Number.isNaN(v) && v === best) bestIndices.add(i);
  });
  return bestIndices;
}

function ComparisonTable({ models }: { models: AIModelData[] }) {
  const colCount = models.length;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-muted-foreground bg-muted/30 sticky left-0 z-10 w-[200px] px-4 py-3 text-left text-xs font-medium uppercase tracking-wide">
                Attribute
              </th>
              {models.map((m) => (
                <th
                  key={m.id}
                  className="min-w-[200px] border-l px-4 py-3 text-left align-top"
                >
                  <div className="space-y-1">
                    <div className="truncate font-medium" title={m.modelId}>
                      {m.name || m.modelId}
                    </div>
                    {m.description && (
                      <div className="text-muted-foreground line-clamp-2 text-xs font-normal">
                        {m.description}
                      </div>
                    )}
                  </div>
                </th>
              ))}
              {colCount < MAX_MODELS &&
                Array.from({ length: MAX_MODELS - colCount }).map((_, i) => (
                  <th
                    key={`empty-${i}`}
                    className="min-w-[200px] border-l px-4 py-3"
                  />
                ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, rowIdx) => {
              const bestIndices =
                row.numericValue && row.higherIsBetter !== undefined
                  ? findBestIndex(models, row.numericValue, row.higherIsBetter)
                  : new Set<number>();
              return (
                <tr
                  key={row.label}
                  className={cn(
                    "border-b last:border-b-0",
                    rowIdx % 2 === 0 ? "" : "bg-muted/20",
                  )}
                >
                  <td className="bg-muted/30 text-muted-foreground sticky left-0 z-10 w-[200px] px-4 py-2.5 text-xs font-medium">
                    {row.label}
                  </td>
                  {models.map((m, idx) => {
                    const isBest = bestIndices.has(idx);
                    return (
                      <td
                        key={m.id}
                        className={cn(
                          "border-l px-4 py-2.5 align-top",
                          isBest &&
                            "bg-emerald-500/10 dark:bg-emerald-500/15",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {row.render(m)}
                          {isBest && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-400"
                            >
                              best
                            </Badge>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  {colCount < MAX_MODELS &&
                    Array.from({ length: MAX_MODELS - colCount }).map((_, i) => (
                      <td
                        key={`empty-${rowIdx}-${i}`}
                        className="border-l px-4 py-2.5"
                      />
                    ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── Loading skeleton ────────────────────────────────────────────── */

function CompareSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-32" />
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Main component (uses search params) ────────────────────────── */

function ModelCompareInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { models, loading, error } = useAIModels({ availableOnly: true });

  // Initialize from URL ?ids=a,b,c
  const idsParam = searchParams.get("ids") || "";
  const initialIds = useMemo(
    () =>
      idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_MODELS),
    [idsParam],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);

  // Keep state in sync if URL changes (e.g. browser back/forward)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds(initialIds);
  }, [initialIds]);

  const updateUrl = useCallback(
    (next: string[]) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next.length === 0) {
        sp.delete("ids");
      } else {
        sp.set("ids", next.join(","));
      }
      const qs = sp.toString();
      router.replace(qs ? `/models/compare?${qs}` : "/models/compare", {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const handleAdd = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        if (prev.includes(id) || prev.length >= MAX_MODELS) return prev;
        const next = [...prev, id];
        updateUrl(next);
        return next;
      });
    },
    [updateUrl],
  );

  const handleRemove = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = prev.filter((x) => x !== id);
        updateUrl(next);
        return next;
      });
    },
    [updateUrl],
  );

  const handleClear = useCallback(() => {
    setSelectedIds([]);
    updateUrl([]);
  }, [updateUrl]);

  const selectedModels = useMemo(() => {
    if (!models.length) return [];
    const byId = new Map(models.map((m) => [m.id, m]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((m): m is AIModelData => Boolean(m));
  }, [models, selectedIds]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <CompareSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Model Comparison</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Compare up to {MAX_MODELS} AI models side-by-side. Best value per
            row is highlighted. The URL updates so you can share this comparison.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          Failed to load models. Please try again later.
        </div>
      )}

      {/* Selected models chips + picker */}
      <div className="flex flex-wrap items-center gap-2">
        {selectedModels.map((m) => (
          <Badge
            key={m.id}
            variant="outline"
            className="h-8 gap-1.5 px-2.5 text-sm"
          >
            <span className="font-medium">{m.name || m.modelId}</span>
            <button
              type="button"
              onClick={() => handleRemove(m.id)}
              className="hover:bg-muted/60 -mr-1 rounded p-0.5"
              aria-label={`Remove ${m.name || m.modelId}`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <ModelPicker
          models={models}
          selectedIds={selectedIds}
          onSelect={handleAdd}
          disabled={selectedIds.length >= MAX_MODELS}
        />
        {selectedModels.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-muted-foreground"
          >
            Clear all
          </Button>
        )}
        <span className="text-muted-foreground ml-auto text-xs">
          {selectedModels.length}/{MAX_MODELS} selected
        </span>
      </div>

      {/* Comparison table or empty state */}
      {selectedModels.length === 0 ? (
        <Card className="flex min-h-[280px] items-center justify-center">
          <CardContent className="flex flex-col items-center text-center">
            <BarChart3Icon className="text-muted-foreground h-10 w-10" />
            <p className="mt-3 text-sm font-medium">No models selected</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
              Add up to {MAX_MODELS} models to see a side-by-side comparison
              across price, context window, capabilities, and risk level.
            </p>
          </CardContent>
        </Card>
      ) : selectedModels.length === 1 ? (
        <>
          <ComparisonTable models={selectedModels} />
          <Card className="flex items-center gap-3 p-4">
            <CpuIcon className="text-muted-foreground h-5 w-5 shrink-0" />
            <p className="text-muted-foreground text-sm">
              Add at least one more model to highlight best-value attributes.
            </p>
          </Card>
        </>
      ) : (
        <ComparisonTable models={selectedModels} />
      )}
    </div>
  );
}

export default function ModelComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col gap-6 p-6">
          <Skeleton className="h-7 w-48" />
          <CompareSkeleton />
        </div>
      }
    >
      <ModelCompareInner />
    </Suspense>
  );
}
