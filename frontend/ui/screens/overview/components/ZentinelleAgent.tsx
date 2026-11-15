"use client";

import { CalliopeAgent, type CalliopeAgentMode } from "@calliopelabs/ui/agent";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

import type { ChatModel } from "@/hooks/use-chat";

import { MarkdownContent, zentinelleRenderers } from "./AssistantParts";

/**
 * The models the person may pick for the next turn (`GET
 * /assistant/providers?require_tools=true`) and the one picked, which the
 * provider sends with every run (`forwardedProps.model`).
 */
export interface AssistantModels {
  models: readonly ChatModel[];
  loading: boolean;
  model: string;
  setModel: (model: string) => void;
}

export const AssistantModelsContext = React.createContext<AssistantModels>({
  models: [],
  loading: false,
  model: "",
  setModel: () => {},
});

/**
 * Zentinelle AI on any surface: the library's CalliopeAgent with the
 * console's markdown, page links, approval cards and model picker. Reads the
 * nearest agent provider (`ZentinelleAssistantProvider` in the app).
 */
export function ZentinelleAgent({
  mode,
  hideHeader,
  className,
}: {
  mode: CalliopeAgentMode;
  hideHeader?: boolean;
  className?: string;
}) {
  const t = useTranslations("overview.assistant");
  const { models, loading, model, setModel } = React.useContext(
    AssistantModelsContext,
  );
  return (
    <CalliopeAgent
      mode={mode}
      title={t("title")}
      launcherIcon={<SparklesIcon aria-hidden className="size-5" />}
      renderContent={(text) => <MarkdownContent content={text} />}
      renderers={zentinelleRenderers}
      modelPicker={{
        options: models.map((m) => ({
          value: m.value,
          label: `${m.label} · ${m.provider}`,
        })),
        value: model,
        onValueChange: setModel,
        disabled: loading || models.length === 0,
        label: loading ? t("model.loading") : t("model.label"),
      }}
      placeholder={t("input.placeholder")}
      empty={
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="bg-primary/10 flex size-12 items-center justify-center rounded-full">
            <SparklesIcon aria-hidden className="size-6" />
          </div>
          <div>
            <p className="text-foreground text-sm font-medium">{t("title")}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("message.welcome")}
            </p>
          </div>
        </div>
      }
      {...(hideHeader !== undefined ? { hideHeader } : {})}
      {...(className ? { className } : {})}
    />
  );
}
