"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CpuIcon, SearchIcon, AlertTriangleIcon } from "lucide-react";
import { useAIModels } from "@/graphql/models/hooks";
import type { AIModelData } from "@/graphql/models/hooks";

function formatContext(tokens: number | null): string {
  if (!tokens) return "--";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1)}K`;
  return String(tokens);
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return "--";
  return `$${price.toFixed(2)}`;
}

function riskBadgeVariant(risk: string | null): "default" | "secondary" | "destructive" | "outline" {
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

function ModelCard({ model }: { model: AIModelData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="truncate text-sm font-medium" title={model.modelId}>
            {model.name || model.modelId}
          </CardTitle>
          <Badge variant="outline" className="shrink-0">
            {model.providerName || model.providerSlug || "Unknown"}
          </Badge>
        </div>
        {model.description && (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {model.description}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Type:</span>{" "}
            {model.modelType || "--"}
          </div>
          <div>
            <span className="text-muted-foreground">Context:</span>{" "}
            {formatContext(model.contextWindow)}
          </div>
          <div>
            <span className="text-muted-foreground">Input:</span>{" "}
            {formatPrice(model.inputPricePerMillion)}/M
          </div>
          <div>
            <span className="text-muted-foreground">Output:</span>{" "}
            {formatPrice(model.outputPricePerMillion)}/M
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {model.riskLevel && (
            <Badge variant={riskBadgeVariant(model.riskLevel)} className="text-xs">
              {model.riskLevel} risk
            </Badge>
          )}
          {model.deprecated && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangleIcon className="h-3 w-3" />
              Deprecated
            </Badge>
          )}
        </div>
        {model.capabilities && model.capabilities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {model.capabilities.slice(0, 4).map((cap) => (
              <Badge key={cap} variant="outline" className="text-[10px]">
                {cap}
              </Badge>
            ))}
            {model.capabilities.length > 4 && (
              <Badge variant="outline" className="text-[10px]">
                +{model.capabilities.length - 4}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-1 h-3 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ModelsPage() {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");

  const { models, loading, error } = useAIModels({
    search: search || null,
    providerSlug: providerFilter || null,
    availableOnly: true,
  });

  const providers = useMemo(() => {
    const slugs = new Map<string, string>();
    for (const m of models) {
      if (m.providerSlug && m.providerName) {
        slugs.set(m.providerSlug, m.providerName);
      }
    }
    return Array.from(slugs.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [models]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Model Registry</h1>
        <p className="text-muted-foreground">
          AI models available for agent use, synced from providers
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="border-input bg-background h-8 rounded-lg border px-3 text-sm"
          aria-label="Filter by provider"
        >
          <option value="">All providers</option>
          {providers.map(([slug, name]) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          Failed to load models. Please try again later.
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingSkeleton />}

      {/* Content */}
      {!loading && !error && (
        <>
          <p className="text-muted-foreground text-sm">
            {models.length} model{models.length !== 1 ? "s" : ""} available
          </p>
          {models.length === 0 ? (
            <Card className="flex min-h-[200px] items-center justify-center">
              <CardContent className="text-center">
                <CpuIcon className="text-muted-foreground mx-auto h-10 w-10" />
                <p className="text-muted-foreground mt-3 text-sm">
                  {search || providerFilter
                    ? "No models match your filters."
                    : "No models available. Sync models from providers to populate the registry."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {models.map((m) => (
                <ModelCard key={m.id} model={m} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
