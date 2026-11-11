import {
  ErrorState,
  List,
  ListItem,
  StatusBadge,
  type StatusTone,
} from "@calliopelabs/ui";
import {
  BotIcon,
  ClipboardListIcon,
  GitPullRequestArrowIcon,
  ShieldAlertIcon,
  SirenIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type * as React from "react";

import type { AttentionItem, AttentionKind } from "./overview-model";

const ICONS: Record<AttentionKind, React.ComponentType> = {
  alerts: TriangleAlertIcon,
  incidents: SirenIcon,
  approvals: ClipboardListIcon,
  changes: GitPullRequestArrowIcon,
  agents: BotIcon,
  risks: ShieldAlertIcon,
};

const TONE_LABEL: Record<StatusTone, string> = {
  error: "urgent",
  warn: "review",
  info: "pending",
  ok: "ok",
  muted: "info",
};

export interface NeedsAttentionProps {
  items: readonly AttentionItem[];
  loading?: boolean;
  /** Some of the signals could not be read; the rest still show. */
  error?: { message: string } | null;
  onRetry?: () => void;
}

/** What someone should open next, most urgent first; every row links to it. */
export function NeedsAttention({
  items,
  loading = false,
  error,
  onRetry,
}: NeedsAttentionProps) {
  const list = (
    <List
      label="Needs attention"
      items={items}
      getKey={(item) => item.kind}
      loading={loading}
      loadingCount={3}
      empty={{
        title: "Nothing needs attention",
        description:
          "No open alerts, incidents, approvals or staged changes right now.",
      }}
      renderItem={(item) => {
        const Icon = ICONS[item.kind];
        return (
          <ListItem
            title={item.title}
            href={item.href}
            description={item.description}
            icon={<Icon />}
            status={
              <StatusBadge tone={item.tone}>
                {TONE_LABEL[item.tone]}
              </StatusBadge>
            }
          />
        );
      }}
    />
  );
  if (!error) return list;
  // A failed signal must not read as "nothing needs attention": say what
  // failed, and show only the rows that did load.
  return (
    <div className="space-y-3">
      <ErrorState
        title="Some signals could not be read"
        error={error}
        onRetry={onRetry}
      />
      {items.length > 0 && list}
    </div>
  );
}
