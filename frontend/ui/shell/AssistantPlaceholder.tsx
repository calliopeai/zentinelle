"use client";

import { EmptyState } from "@calliopelabs/ui";
import { SparklesIcon } from "lucide-react";

/**
 * What the assistant dock shows until the assistant lands
 * (docs/design/assistant-ag-ui.md, zentinelle#447). The slot, its width and
 * its shortcut are real; only the conversation is missing.
 */
export function AssistantPlaceholder({
  title = "The assistant docks here",
  description = "Ask about policies, agents and spend, and act on the page in view. Coming with the Zentinelle AI assistant.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-4">
      <EmptyState
        icon={<SparklesIcon aria-hidden />}
        title={title}
        description={description}
      />
    </div>
  );
}
