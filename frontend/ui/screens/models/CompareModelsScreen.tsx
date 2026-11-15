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
import { useTranslations } from "next-intl";

import { SelectField } from "../../shared/SelectField";
import {
  formatPerMillion,
  formatTokens,
  formatUsd,
} from "../../shared/figures";
import { areaCrumbs } from "./frame";
import { MAX_COMPARE, type Model } from "./models";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

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

const ROWS = (t: Translate): Row[] => [
  {
    label: t("provider"),
    value: () => null,
    show: (m) => m.providerName ?? m.providerSlug ?? t("unknown"),
  },
  {
    label: t("modelId"),
    value: () => null,
    show: (m) => (
      <span className="font-mono text-xs [overflow-wrap:anywhere]">
        {m.modelId}
      </span>
    ),
  },
  {
    label: t("type"),
    value: () => null,
    show: (m) => m.modelType ?? "unknown",
  },
  {
    label: t("contextWindow"),
    value: (m) => m.contextWindow,
    show: (m, l) => formatTokens(m.contextWindow, l),
    better: "high",
  },
  {
    label: t("maxOutput"),
    value: (m) => m.maxOutputTokens,
    show: (m, l) => formatTokens(m.maxOutputTokens, l),
    better: "high",
  },
  {
    label: t("inputPrice"),
    value: (m) => m.inputPricePerMillion,
    show: (m, l) => formatPerMillion(m.inputPricePerMillion, l),
    better: "low",
  },
  {
    label: t("outputPrice"),
    value: (m) => m.outputPricePerMillion,
    show: (m, l) => formatPerMillion(m.outputPricePerMillion, l),
    better: "low",
  },
  {
    label: t("n1mIn100kOut"),
    value: sampleCost,
    show: (m, l) => formatUsd(sampleCost(m), l),
    better: "low",
  },
  {
    label: t("risk"),
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
        t("notRated")
      ),
  },
  {
    label: t("capabilities"),
    value: () => null,
    show: (m) =>
      m.capabilities?.length ? m.capabilities.join(", ") : t("noneListed"),
  },
  {
    label: t("status"),
    value: () => null,
    show: (m) => (m.deprecated ? t("deprecated") : t("available")),
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
  const t = useTranslations("models.compareModelsScreen");
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
        { label: t("models"), href: "/models" },
      ]}
      title={t("compareModels")}
      description={t("upTo", { max: MAX_COMPARE })}
      filters={
        <SelectField
          label={t("addAModel")}
          value=""
          disabled={full || loading || choices.length === 0}
          onChange={(id) => id && onSelectedChange([...selectedIds, id])}
          options={[
            {
              value: "",
              label: full ? t("full", { max: MAX_COMPARE }) : t("chooseAModel"),
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
          title={t("couldNotLoadModels")}
          error={error}
          onRetry={onRetry}
        />
      ) : loading ? (
        <LoadingState label={t("loadingModels")} />
      ) : selected.length === 0 ? (
        <EmptyState
          icon={<ScaleIcon />}
          title={t("chooseModelsToCompare")}
          description={t("addUpTo", { max: MAX_COMPARE })}
          actionHref="/models"
          actionLabel={t("openModels")}
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
              {ROWS(t).map((row) => {
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
