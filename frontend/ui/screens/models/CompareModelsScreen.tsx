"use client";

import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  StatusBadge,
} from "@calliopelabs/ui";
import { ScaleIcon, XIcon } from "lucide-react";
import type * as React from "react";

import { SelectField } from "../../shared/SelectField";
import {
  formatPerMillion,
  formatTokens,
  formatUsd,
} from "../../shared/figures";
import { areaCrumbs } from "./frame";
import { MAX_COMPARE, type Model } from "./models";

export interface CompareModelsScreenProps {
  capabilities: readonly string[];
  /** `AiModels` with `availableOnly`: the picker's choices. */
  models: readonly Model[];
  /** From `?ids=`, in order. */
  selectedIds: readonly string[];
  onSelectedChange: (ids: string[]) => void;
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  locale?: string;
}

/** 1M input plus 100K output tokens: a typical agent turn mix, as the current page prices it. */
function sampleCost(m: Model) {
  if (m.inputPricePerMillion == null && m.outputPricePerMillion == null)
    return null;
  return (m.inputPricePerMillion ?? 0) + (m.outputPricePerMillion ?? 0) * 0.1;
}

interface Row {
  label: string;
  value: (m: Model) => number | null;
  show: (m: Model, locale: string) => React.ReactNode;
  /** Which end of the scale is better, for the "best" mark. */
  better?: "low" | "high";
}

const ROWS: Row[] = [
  {
    label: "Provider",
    value: () => null,
    show: (m) => m.providerName ?? m.providerSlug ?? "Unknown",
  },
  {
    label: "Model id",
    value: () => null,
    show: (m) => (
      <span className="font-mono text-xs [overflow-wrap:anywhere]">
        {m.modelId}
      </span>
    ),
  },
  { label: "Type", value: () => null, show: (m) => m.modelType ?? "unknown" },
  {
    label: "Context window",
    value: (m) => m.contextWindow,
    show: (m, l) => formatTokens(m.contextWindow, l),
    better: "high",
  },
  {
    label: "Max output",
    value: (m) => m.maxOutputTokens,
    show: (m, l) => formatTokens(m.maxOutputTokens, l),
    better: "high",
  },
  {
    label: "Input price",
    value: (m) => m.inputPricePerMillion,
    show: (m, l) => formatPerMillion(m.inputPricePerMillion, l),
    better: "low",
  },
  {
    label: "Output price",
    value: (m) => m.outputPricePerMillion,
    show: (m, l) => formatPerMillion(m.outputPricePerMillion, l),
    better: "low",
  },
  {
    label: "1M in, 100K out",
    value: sampleCost,
    show: (m, l) => formatUsd(sampleCost(m), l),
    better: "low",
  },
  {
    label: "Risk",
    value: () => null,
    show: (m) =>
      m.riskLevel ? (
        <StatusBadge
          tone={
            m.riskLevel === "low"
              ? "ok"
              : m.riskLevel === "medium"
                ? "warn"
                : "error"
          }
        >
          {m.riskLevel}
        </StatusBadge>
      ) : (
        "Not rated"
      ),
  },
  {
    label: "Capabilities",
    value: () => null,
    show: (m) =>
      m.capabilities?.length ? m.capabilities.join(", ") : "None listed",
  },
  {
    label: "Status",
    value: () => null,
    show: (m) => (m.deprecated ? "Deprecated" : "Available"),
  },
];

/** The column with the best figure, or -1 when fewer than two have one or the best is tied. */
function bestIndex(row: Row, models: readonly Model[]) {
  if (!row.better) return -1;
  const values = models.map(row.value);
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return -1;
  const best = row.better === "low" ? Math.min(...known) : Math.max(...known);
  const at = values.flatMap((v, i) => (v === best ? [i] : []));
  return at.length === 1 ? at[0] : -1;
}

/**
 * Models > Compare (`/models/compare?ids=`): up to four models side by side,
 * with the best figure in each row marked in words. The route stays so
 * shared links keep working.
 */
export function CompareModelsScreen({
  capabilities,
  models,
  selectedIds,
  onSelectedChange,
  loading,
  error,
  onRetry,
  locale = "en",
}: CompareModelsScreenProps) {
  const byId = new Map(models.map((m) => [m.id, m]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((m): m is Model => Boolean(m));
  const choices = models.filter((m) => !selectedIds.includes(m.id));
  const full = selected.length >= MAX_COMPARE;

  return (
    <PageFrame
      crumbs={[
        ...areaCrumbs(capabilities, "models"),
        { label: "Models", href: "/models" },
      ]}
      title="Compare models"
      description={`Up to ${MAX_COMPARE} models side by side, at registry prices.`}
      filters={
        <SelectField
          label="Add a model"
          value=""
          disabled={full || loading || choices.length === 0}
          onChange={(id) => id && onSelectedChange([...selectedIds, id])}
          options={[
            {
              value: "",
              label: full
                ? `${MAX_COMPARE} chosen, the most`
                : "Choose a model",
            },
            ...choices.map((m) => ({
              value: m.id,
              label:
                `${m.providerName ?? m.providerSlug ?? ""} ${m.name}`.trim(),
            })),
          ]}
        />
      }
    >
      {error ? (
        <ErrorState
          title="Could not load models"
          error={error}
          onRetry={onRetry}
        />
      ) : loading ? (
        <LoadingState label="Loading models" />
      ) : selected.length === 0 ? (
        <EmptyState
          icon={<ScaleIcon />}
          title="Choose models to compare"
          description={`Add up to ${MAX_COMPARE} models above, or select rows on Models.`}
          actionHref="/models"
          actionLabel="Open models"
        />
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-lg border">
          <table className="w-full min-w-xl text-sm">
            <caption className="sr-only">Model comparison</caption>
            <thead>
              <tr className="border-b">
                <th
                  scope="col"
                  className="w-40 px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                >
                  <span className="sr-only">Attribute</span>
                </th>
                {selected.map((m) => (
                  <th
                    key={m.id}
                    scope="col"
                    className="px-3 py-2 text-left align-top"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium [overflow-wrap:anywhere]">
                        {m.name}
                      </span>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${m.name}`}
                        onClick={() =>
                          onSelectedChange(
                            selectedIds.filter((id) => id !== m.id),
                          )
                        }
                      >
                        <XIcon aria-hidden />
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const best = bestIndex(row, selected);
                return (
                  <tr key={row.label} className="border-b last:border-0">
                    <th
                      scope="row"
                      className="px-3 py-2 text-left text-xs font-normal text-muted-foreground"
                    >
                      {row.label}
                    </th>
                    {selected.map((m, i) => (
                      <td key={m.id} className="px-3 py-2 align-top">
                        <span
                          className={i === best ? "font-medium" : undefined}
                        >
                          {row.show(m, locale)}
                        </span>
                        {i === best && (
                          <span className="ml-2 text-2xs text-success-fg">
                            {row.better === "low" ? "lowest" : "highest"}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  );
}
