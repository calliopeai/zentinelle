"use client";

import { Button, PageFrame, StatusBadge } from "@calliopelabs/ui";
import { useCalliopeAgent } from "@calliopelabs/ui/agent";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

import {
  AssistantModelsContext,
  ZentinelleAgent,
} from "./components/ZentinelleAgent";

/**
 * The assistant on a page of its own (`/assistant`, reached from the
 * Overview): the same conversation as the chat bubble, with room to read.
 * Reads the nearest agent provider (`ZentinelleAssistantProvider` in the app).
 */
export function AssistantScreen() {
  const t = useTranslations("overview.assistant");
  const agent = useCalliopeAgent();
  const { models, model } = React.useContext(AssistantModelsContext);
  const selected = models.find((m) => m.value === model);
  const said = agent.view.timeline.length > 0 || !!agent.view.error;
  return (
    <PageFrame
      title={t("screen.title")}
      context={
        selected && (
          <span className="inline-flex items-center gap-1.5">
            {selected.label}
            <StatusBadge tone="muted">{selected.provider}</StatusBadge>
          </span>
        )
      }
      description={t("screen.description")}
      primaryAction={
        said && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void agent.newThread()}
            disabled={agent.running}
          >
            <Trash2Icon aria-hidden />
            {t("screen.clear")}
          </Button>
        )
      }
    >
      <div className="bg-card flex h-[calc(100dvh-16rem)] min-h-96 flex-col rounded-lg border">
        <ZentinelleAgent mode="page" hideHeader className="min-h-0 flex-1" />
      </div>
    </PageFrame>
  );
}
