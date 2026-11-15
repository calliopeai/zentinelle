"use client";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  Field,
  Textarea,
} from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import { FactList } from "../../shared/FactList";
import { Meter } from "../../shared/Meter";
import { SelectField } from "../../shared/SelectField";
import {
  formatCount,
  formatPerMillion,
  formatTokens,
  formatUsd,
} from "../../shared/figures";
import { estimateCost, estimateTokens, isPriced, type Model } from "./models";

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const RATIOS = (t: Translate) => [
  { value: "0.5", label: t("halfTheInputShortReply") },
  { value: "1", label: t("sameAsTheInput") },
  { value: "2", label: t("twiceTheInputLongReply") },
  { value: "4", label: t("fourTimesTheInput") },
];

export interface EstimateCostDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The registry (`AiModels`, available only); unpriced models are left out. */
  models: readonly Model[];
  /** The model to start on, when opened from its row. */
  modelId?: string;
  locale?: string;
}

/**
 * Models > Estimate cost (`/models?panel=estimate`, formerly
 * `/tools/token-calculator`): a prompt's cost on one model at registry
 * prices. Tokens are counted as characters / 4, and the drawer says so.
 */
export function EstimateCostDrawer({
  open,
  onOpenChange,
  models,
  modelId,
  locale = "en",
}: EstimateCostDrawerProps) {
  const t = useTranslations("models.estimateCostDrawer");
  const priced = React.useMemo(() => models.filter(isPriced), [models]);
  const [text, setText] = React.useState("");
  const [selected, setSelected] = React.useState(modelId ?? "");
  const [ratio, setRatio] = React.useState("1");
  const model = priced.find((m) => m.id === selected) ?? priced[0];
  const tokens = text ? estimateTokens(text) : 0;
  const cost = model ? estimateCost(model, tokens, Number(ratio)) : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="right" className="w-full gap-0 sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{t("estimateCost")}</DrawerTitle>
          <DrawerDescription>
            {t("atRegistryPricesThePrices")}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {priced.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {t("noModelInTheRegistry")}
            </p>
          ) : (
            <>
              <SelectField
                label={t("model")}
                value={model?.id ?? ""}
                onChange={setSelected}
                options={priced.map((m) => ({
                  value: m.id,
                  label:
                    `${m.providerName ?? m.providerSlug ?? ""} ${m.name}`.trim(),
                }))}
              />
              <div className="flex flex-col gap-1.5">
                <Field label={t("prompt")}>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    placeholder={t("pasteAPromptADocument")}
                    className="font-mono text-xs md:text-xs"
                  />
                </Field>
                <p className="text-xs text-muted-foreground">
                  {formatCount(text.length, locale)} characters, about{" "}
                  {formatCount(tokens, locale)} tokens
                </p>
              </div>
              <SelectField
                label={t("replyLength")}
                value={ratio}
                onChange={setRatio}
                options={RATIOS(t)}
              />
              {model && cost && (
                <section
                  aria-label={t("estimate")}
                  className="flex flex-col gap-3"
                >
                  <p className="font-mono text-2xl font-semibold tabular-nums">
                    {formatUsd(cost.total, locale)}
                    <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                      estimated
                    </span>
                  </p>
                  <FactList
                    items={[
                      {
                        term: t("input"),
                        value: t("tokensCost", {
                          tokens: formatCount(tokens, locale),
                          cost: formatUsd(cost.input, locale),
                        }),
                        mono: true,
                      },
                      {
                        term: t("reply"),
                        value: t("tokensCost", {
                          tokens: formatCount(cost.outputTokens, locale),
                          cost: formatUsd(cost.output, locale),
                        }),
                        mono: true,
                      },
                      {
                        term: t("inputPrice"),
                        value: formatPerMillion(
                          model.inputPricePerMillion,
                          locale,
                        ),
                        mono: true,
                      },
                      {
                        term: t("outputPrice"),
                        value: formatPerMillion(
                          model.outputPricePerMillion,
                          locale,
                        ),
                        mono: true,
                      },
                    ]}
                  />
                  {model.contextWindow ? (
                    <Meter
                      label={t("contextWindow")}
                      value={tokens}
                      max={model.contextWindow}
                      valueText={`${((tokens / model.contextWindow) * 100).toFixed(1)}% of ${formatTokens(model.contextWindow, locale)}`}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("theRegistryHasNoContext")}
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
