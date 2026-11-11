"use client";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@calliopelabs/ui";
import * as React from "react";

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

const RATIOS = [
  { value: "0.5", label: "Half the input (short reply)" },
  { value: "1", label: "Same as the input" },
  { value: "2", label: "Twice the input (long reply)" },
  { value: "4", label: "Four times the input" },
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
  const priced = React.useMemo(() => models.filter(isPriced), [models]);
  const [text, setText] = React.useState("");
  const [selected, setSelected] = React.useState(modelId ?? "");
  const [ratio, setRatio] = React.useState("1");
  const textId = React.useId();
  const model = priced.find((m) => m.id === selected) ?? priced[0];
  const tokens = text ? estimateTokens(text) : 0;
  const cost = model ? estimateCost(model, tokens, Number(ratio)) : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="right" className="w-full gap-0 sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>Estimate cost</DrawerTitle>
          <DrawerDescription>
            At registry prices, the prices metering and budgets charge. Tokens
            are estimated as characters / 4.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {priced.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No model in the registry has prices yet. Sync models from a
              provider to estimate costs.
            </p>
          ) : (
            <>
              <SelectField
                label="Model"
                value={model?.id ?? ""}
                onChange={setSelected}
                options={priced.map((m) => ({
                  value: m.id,
                  label:
                    `${m.providerName ?? m.providerSlug ?? ""} ${m.name}`.trim(),
                }))}
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor={textId} className="text-sm font-medium">
                  Prompt
                </label>
                <textarea
                  id={textId}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder="Paste a prompt, a document or a conversation."
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <p className="text-xs text-muted-foreground">
                  {formatCount(text.length, locale)} characters, about{" "}
                  {formatCount(tokens, locale)} tokens
                </p>
              </div>
              <SelectField
                label="Reply length"
                value={ratio}
                onChange={setRatio}
                options={RATIOS}
              />
              {model && cost && (
                <section aria-label="Estimate" className="flex flex-col gap-3">
                  <p className="font-mono text-2xl font-semibold tabular-nums">
                    {formatUsd(cost.total, locale)}
                    <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                      estimated
                    </span>
                  </p>
                  <FactList
                    items={[
                      {
                        term: "Input",
                        value: `${formatCount(tokens, locale)} tokens, ${formatUsd(cost.input, locale)}`,
                        mono: true,
                      },
                      {
                        term: "Reply",
                        value: `${formatCount(cost.outputTokens, locale)} tokens, ${formatUsd(cost.output, locale)}`,
                        mono: true,
                      },
                      {
                        term: "Input price",
                        value: formatPerMillion(
                          model.inputPricePerMillion,
                          locale,
                        ),
                        mono: true,
                      },
                      {
                        term: "Output price",
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
                      label="Context window"
                      value={tokens}
                      max={model.contextWindow}
                      valueText={`${((tokens / model.contextWindow) * 100).toFixed(1)}% of ${formatTokens(model.contextWindow, locale)}`}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      The registry has no context window for this model.
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
