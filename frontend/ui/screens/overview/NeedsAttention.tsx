import { ErrorState, List, ListItem, StatusBadge } from "@calliopelabs/ui";
import {
  BotIcon,
  ClipboardListIcon,
  GitPullRequestArrowIcon,
  ShieldAlertIcon,
  SirenIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("overview.attention");
  const list = (
    <List
      label={t("label")}
      items={items}
      getKey={(item) => item.kind}
      loading={loading}
      loadingCount={3}
      empty={{
        title: t("empty.title"),
        description: t("empty.description"),
      }}
      renderItem={(item) => {
        const Icon = ICONS[item.kind];
        return (
          <ListItem
            title={t(`${item.kind}.title`, { count: item.count })}
            href={item.href}
            description={t(item.description.key, item.description.values)}
            icon={<Icon />}
            status={
              <StatusBadge tone={item.tone}>
                {t(`tones.${item.tone}`)}
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
      <ErrorState title={t("partialError")} error={error} onRetry={onRetry} />
      {items.length > 0 && list}
    </div>
  );
}
