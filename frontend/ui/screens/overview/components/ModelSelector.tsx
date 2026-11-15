"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  cn,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import type { ChatModel } from "@/hooks/use-chat";

export interface ModelSelectorProps {
  /** `useAvailableModels`: the models of providers with a key. */
  models: readonly ChatModel[];
  loading?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/** The assistant's model, grouped by provider. */
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
    <Select
      aria-label={t("label")}
      value={loading || !known ? "" : value}
      disabled={loading || models.length === 0}
      onValueChange={onValueChange}
    >
      <SelectTrigger
        className={cn("bg-background dark:bg-background max-w-56", className)}
      >
        <SelectValue
          placeholder={
            loading
              ? t("loading")
              : models.length === 0
                ? t("none")
                : t("placeholder")
          }
        />
      </SelectTrigger>
      <SelectContent>
        {[...byProvider].map(([provider, providerModels]) => (
          <SelectGroup key={provider}>
            <SelectLabel>{provider}</SelectLabel>
            {providerModels.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
