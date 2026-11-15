"use client";

import { EmptyState } from "@calliopelabs/ui";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * What the assistant dock shows until the assistant lands
 * (docs/design/assistant-ag-ui.md, zentinelle#447). The slot, its width and
 * its shortcut are real; only the conversation is missing.
 */
export function AssistantPlaceholder({
  title,
  description,
}: {
  /** The catalog's copy (`shell.assistantPlaceholder`) unless given. */
  title?: string;
  description?: string;
}) {
  const t = useTranslations("shell.assistantPlaceholder");
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-4">
      <EmptyState
        icon={<SparklesIcon aria-hidden />}
        title={title ?? t("title")}
        description={description ?? t("description")}
      />
    </div>
  );
}
