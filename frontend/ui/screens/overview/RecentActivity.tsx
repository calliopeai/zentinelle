import { List, ListItem } from "@calliopelabs/ui";
import { HistoryIcon } from "lucide-react";

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
  return (
    <List
      label="Recent activity"
      items={entries}
      getKey={(entry) => entry.id}
      loading={loading}
      loadingCount={4}
      empty={{
        icon: <HistoryIcon />,
        title: "No activity yet",
        description:
          "Changes to agents, policies and settings appear here as they happen.",
      }}
      renderItem={(entry) => (
        <ListItem
          title={entry.description}
          description={entry.actor ?? undefined}
          meta={
            <time
              dateTime={entry.timestamp ?? undefined}
              title={entry.timestamp ?? undefined}
            >
              {timeAgo(entry.timestamp, now)}
            </time>
          }
        />
      )}
    />
  );
}
