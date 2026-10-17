/**
 * Models, as the screens read them: `AiModels` (graphql/models/queries.ts).
 * The registry's prices are the ones metering and budgets charge, so the
 * cost estimate reads them too.
 */
import type { AIModelData } from "@/graphql/models/hooks";

export type Model = AIModelData;

export interface Option {
  value: string;
  label: string;
}

/** The provider filter's options. The route reads them from an unfiltered query, so they do not shrink as a filter narrows. */
export function providerOptions(models: readonly Model[]): Option[] {
  const seen = new Map<string, string>();
  for (const m of models) {
    if (m.providerSlug)
      seen.set(m.providerSlug, m.providerName ?? m.providerSlug);
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function isPriced(m: Model): m is Model & {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
} {
  return m.inputPricePerMillion != null && m.outputPricePerMillion != null;
}

/** The registry has no tokenizer: characters / 4, labelled as an estimate wherever it shows. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateCost(
  model: Model,
  inputTokens: number,
  outputRatio: number,
) {
  const outputTokens = Math.ceil(inputTokens * outputRatio);
  const input = ((model.inputPricePerMillion ?? 0) * inputTokens) / 1_000_000;
  const output =
    ((model.outputPricePerMillion ?? 0) * outputTokens) / 1_000_000;
  return { outputTokens, input, output, total: input + output };
}

export const MAX_COMPARE = 4;

export function compareHref(ids: readonly string[]) {
  return ids.length
    ? `/models/compare?ids=${ids.map(encodeURIComponent).join(",")}`
    : "/models/compare";
}
