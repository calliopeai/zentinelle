"use client";

import { cn } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import type { ChatModel } from "@/hooks/use-chat";

import { CONTROL_CLASS } from "../../../shared/controls";

export interface ModelSelectorProps {
  /** `useAvailableModels`: the models of providers with a key. */
  models: readonly ChatModel[];
  loading?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/** The assistant's model, grouped by provider. A native select, so keyboards and phones get the platform picker. */
export function ModelSelector({
  models,
  loading = false,
  value,
  onValueChange,
  className,
}: ModelSelectorProps) {
  const t = useTranslations("overview.assistant.model");
  const byProvider = new Map<string, ChatModel[]>();
  for (const model of models) {
    byProvider.set(model.provider, [
      ...(byProvider.get(model.provider) ?? []),
      model,
    ]);
  }
  const known = models.some((m) => m.value === value);
  return (
    <select
      aria-label={t("label")}
      value={loading || !known ? "" : value}
      disabled={loading || models.length === 0}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn(
        CONTROL_CLASS,
        "bg-background dark:bg-background h-8 w-auto max-w-56 pr-7",
        className,
      )}
    >
      {(loading || !known) && (
        <option value="" disabled>
          {loading
            ? t("loading")
            : models.length === 0
              ? t("none")
              : t("placeholder")}
        </option>
      )}
      {[...byProvider].map(([provider, providerModels]) => (
        <optgroup key={provider} label={provider}>
          {providerModels.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
