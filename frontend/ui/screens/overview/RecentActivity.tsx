import { List, ListItem } from "@calliopelabs/ui";
import { HistoryIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { timeAgo, type ActivityEntry } from "./overview-model";

export interface RecentActivityProps {
  entries: readonly ActivityEntry[];
  loading?: boolean;
  /** Times are shown against this; stories pass a fixed one. */
  now?: Date;
}

/** The latest audit log entries; the full log is one link away. */
export function RecentActivity({
  entries,
  loading = false,
  now = new Date(),
}: RecentActivityProps) {
  const t = useTranslations("overview.recentActivity");
  return (
    <List
      label={t("label")}
      items={entries}
      getKey={(entry) => entry.id}
      loading={loading}
      loadingCount={4}
      empty={{
        icon: <HistoryIcon />,
        title: t("empty.title"),
        description: t("empty.description"),
      }}
      renderItem={(entry) => {
        const ago = timeAgo(entry.timestamp, now);
        return (
          <ListItem
            title={entry.description ?? t("untitled")}
            description={entry.actor ?? undefined}
            meta={
              <time
                dateTime={entry.timestamp ?? undefined}
                title={entry.timestamp ?? undefined}
              >
                {t(`time.${ago.key}`, ago.values)}
              </time>
            }
          />
        );
      }}
    />
  );
}
