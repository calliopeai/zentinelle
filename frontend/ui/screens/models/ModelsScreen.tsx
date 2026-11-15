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
import { useTranslations } from "next-intl";

import { SelectField } from "../../shared/SelectField";
import { formatPerMillion, formatTokens } from "../../shared/figures";
import { useListController } from "../../shared/list-controller";
import { EstimateCostDrawer } from "./EstimateCostDrawer";
import { areaCrumbs, can, useModelsFrame } from "./frame";
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
  const t = useTranslations("models.modelsScreen");
  const { modelsTabs } = useModelsFrame();
  const { Link } = useUI();
  const selection = useRowSelection();

  const controller = useListController({
    rows: models,
    loading,
    error,
    onRetry,
    search,
    onSearchChange,
    isFiltered: provider !== "",
    clearFilters: () => onProviderChange(""),
  });
  const columns: Column<Model>[] = [
    {
      id: "model",
      header: t("model"),
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
      header: t("provider"),
      width: "w-36",
      cell: (m) => m.providerName ?? m.providerSlug ?? t("unknown"),
    },
    {
      id: "type",
      header: t("type"),
      width: "w-24",
      cell: (m) => (
        <span className="font-mono text-xs">{m.modelType ?? "unknown"}</span>
      ),
    },
    {
      id: "context",
      header: t("context"),
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
      header: t("input"),
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
      header: t("output"),
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
      header: t("risk"),
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
      title={t("models")}
      description={t("theModelsAgentsMayUse")}
      tabs={modelsTabs("models", capabilities)}
      tabsLabel={t("modelsTabs")}
      primaryAction={
        <Button size="sm" onClick={() => onEstimate({})}>
          <CalculatorIcon aria-hidden />
          {t("estimateCost")}
        </Button>
      }
      menu={
        <Button asChild size="sm" variant="outline">
          <Link href={compareHref([])}>{t("compare")}</Link>
        </Button>
      }
    >
      <DataTable
        label={t("models")}
        controller={controller}
        columns={columns}
        getRowId={(m) => m.id}
        rowLabel={(m) => m.name}
        searchPlaceholder={t("searchModels")}
        toolbar={
          <SelectField
            label={t("provider")}
            hideLabel
            value={provider}
            onChange={onProviderChange}
            options={[{ value: "", label: t("allProviders") }, ...providers]}
          />
        }
        selection={selection}
        bulkActions={(s) =>
          s.selectedCount > MAX_COMPARE ? (
            <span className="text-sm text-muted-foreground">
              {t("compareUpTo", { max: MAX_COMPARE })}
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
            {t("estimateCost")}
          </DropdownMenuItem>
        )}
        empty={{
          icon: <BrainCircuitIcon />,
          title: t("noModelsInTheRegistry"),
          description: can(capabilities, "admin")
            ? t("addAProviderKeyThen")
            : t("anAdminAddsProviderKeys"),
          ...(can(capabilities, "admin")
            ? {
                actionHref: "/models/providers",
                actionLabel: t("openProviders"),
              }
            : {}),
        }}
        emptyFiltered={{
          title: t("noModelsMatch"),
          description: t("clearTheSearchOrChoose"),
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
