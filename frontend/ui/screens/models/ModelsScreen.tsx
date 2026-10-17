"use client";

import {
  Button,
  DataTable,
  DropdownMenuItem,
  PageFrame,
  StatusBadge,
  useRowSelection,
  useUI,
  type Column,
  type StatusTone,
} from "@calliopelabs/ui";
import { BrainCircuitIcon, CalculatorIcon } from "lucide-react";

import { SelectField } from "../../shared/SelectField";
import { formatPerMillion, formatTokens } from "../../shared/figures";
import { fixedList } from "../../shared/table";
import { EstimateCostDrawer } from "./EstimateCostDrawer";
import { areaCrumbs, can, modelsTabs } from "./frame";
import { MAX_COMPARE, compareHref, type Model, type Option } from "./models";

const RISK_TONE: Record<string, StatusTone> = {
  low: "ok",
  medium: "warn",
  high: "error",
  critical: "error",
};

export interface ModelsScreenProps {
  capabilities: readonly string[];
  /** `AiModels` with `availableOnly`, `search` and `providerSlug`. */
  models: readonly Model[];
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** The query's `search` argument: the route debounces and refetches. */
  search: string;
  onSearchChange: (search: string) => void;
  provider: string;
  onProviderChange: (provider: string) => void;
  /** Every provider in the registry, from an unfiltered read. */
  providers: readonly Option[];
  /** The Estimate cost drawer (`?panel=estimate`), and the model it opened on. */
  estimate: { modelId?: string } | null;
  onEstimate: (estimate: { modelId?: string } | null) => void;
  /** Every available model, for the drawer's picker; defaults to `models`. */
  allModels?: readonly Model[];
  locale?: string;
}

/**
 * Models (`/models`): the registry agents may use, searched and filtered on
 * the server. Actions: Estimate cost (a drawer) and Compare (select up to
 * four rows). Admins also get the Route check tab.
 */
export function ModelsScreen({
  capabilities,
  models,
  loading,
  error,
  onRetry,
  search,
  onSearchChange,
  provider,
  onProviderChange,
  providers,
  estimate,
  onEstimate,
  allModels,
  locale = "en",
}: ModelsScreenProps) {
  const { Link } = useUI();
  const selection = useRowSelection();

  const columns: Column<Model>[] = [
    {
      id: "model",
      header: "Model",
      cell: (m) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium [overflow-wrap:anywhere]">{m.name}</span>
          <span className="font-mono text-2xs text-muted-foreground [overflow-wrap:anywhere]">
            {m.modelId}
          </span>
        </div>
      ),
    },
    {
      id: "provider",
      header: "Provider",
      width: "w-36",
      cell: (m) => m.providerName ?? m.providerSlug ?? "Unknown",
    },
    {
      id: "type",
      header: "Type",
      width: "w-24",
      cell: (m) => (
        <span className="font-mono text-xs">{m.modelType ?? "unknown"}</span>
      ),
    },
    {
      id: "context",
      header: "Context",
      align: "right",
      width: "w-32",
      cell: (m) => (
        <span className="font-mono text-xs tabular-nums">
          {formatTokens(m.contextWindow, locale)}
        </span>
      ),
    },
    {
      id: "input",
      header: "Input",
      align: "right",
      width: "w-32",
      cell: (m) => (
        <span className="font-mono text-xs tabular-nums">
          {formatPerMillion(m.inputPricePerMillion, locale)}
        </span>
      ),
    },
    {
      id: "output",
      header: "Output",
      align: "right",
      width: "w-32",
      cell: (m) => (
        <span className="font-mono text-xs tabular-nums">
          {formatPerMillion(m.outputPricePerMillion, locale)}
        </span>
      ),
    },
    {
      id: "risk",
      header: "Risk",
      width: "w-36",
      cell: (m) => (
        <div className="flex flex-wrap gap-1">
          {m.riskLevel && (
            <StatusBadge tone={RISK_TONE[m.riskLevel] ?? "muted"}>
              {m.riskLevel}
            </StatusBadge>
          )}
          {m.deprecated && (
            <StatusBadge tone="muted" struck>
              deprecated
            </StatusBadge>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageFrame
      crumbs={areaCrumbs(capabilities, "models")}
      title="Models"
      description="The models agents may use, with the registry prices metering charges."
      tabs={modelsTabs("models", capabilities)}
      tabsLabel="Models tabs"
      primaryAction={
        <Button size="sm" onClick={() => onEstimate({})}>
          <CalculatorIcon aria-hidden />
          Estimate cost
        </Button>
      }
      menu={
        <Button asChild size="sm" variant="outline">
          <Link href={compareHref([])}>Compare</Link>
        </Button>
      }
    >
      <DataTable
        label="Models"
        controller={fixedList({
          rows: models,
          loading,
          error,
          onRetry,
          search,
          onSearchChange,
          filtered: provider !== "",
          onClearFilters: () => onProviderChange(""),
        })}
        columns={columns}
        getRowId={(m) => m.id}
        rowLabel={(m) => m.name}
        searchPlaceholder="Search models"
        toolbar={
          <SelectField
            label="Provider"
            hideLabel
            value={provider}
            onChange={onProviderChange}
            options={[{ value: "", label: "All providers" }, ...providers]}
          />
        }
        selection={selection}
        bulkActions={(s) =>
          s.selectedCount > MAX_COMPARE ? (
            <span className="text-sm text-muted-foreground">
              Compare up to {MAX_COMPARE} models
            </span>
          ) : (
            <Button asChild size="sm">
              <Link href={compareHref(s.selectedIds)}>
                Compare {s.selectedCount}
              </Link>
            </Button>
          )
        }
        rowActions={(m) => (
          <DropdownMenuItem onSelect={() => onEstimate({ modelId: m.id })}>
            Estimate cost
          </DropdownMenuItem>
        )}
        empty={{
          icon: <BrainCircuitIcon />,
          title: "No models in the registry",
          description: can(capabilities, "admin")
            ? "Add a provider key, then sync its models into the registry."
            : "An admin adds provider keys and syncs their models.",
          ...(can(capabilities, "admin")
            ? { actionHref: "/models/providers", actionLabel: "Open providers" }
            : {}),
        }}
        emptyFiltered={{
          title: "No models match",
          description: "Clear the search or choose All providers.",
        }}
      />
      <EstimateCostDrawer
        key={estimate?.modelId ?? "none"}
        open={estimate !== null}
        onOpenChange={(open) => {
          if (!open) onEstimate(null);
        }}
        models={allModels ?? models}
        modelId={estimate?.modelId}
        locale={locale}
      />
    </PageFrame>
  );
}
