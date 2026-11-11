import { StatusDot, cn, type StatusTone } from "@calliopelabs/ui";
import type * as React from "react";

import { formatDateTime } from "./format";

export interface TimelineEntry {
  id: string;
  /** ISO time. */
  at: string;
  title: React.ReactNode;
  /** Who, or what, did it. */
  actor?: React.ReactNode;
  body?: React.ReactNode;
  tone?: StatusTone;
}

export interface TimelineProps {
  /** Names the list for screen readers ("Incident timeline"). */
  label: string;
  entries: readonly TimelineEntry[];
  /** Shown when there are no entries. */
  emptyLabel?: string;
  className?: string;
}

/** What happened, oldest first, on one rule. Entries arrive sorted; the timeline does not reorder. */
export function Timeline({
  label,
  entries,
  emptyLabel = "Nothing has happened yet.",
  className,
}: TimelineProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ol aria-label={label} className={cn("flex flex-col", className)}>
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < entries.length - 1 && (
            <span
              aria-hidden
              className="absolute top-3 bottom-0 left-1 w-px -translate-x-1/2 bg-border"
            />
          )}
          <StatusDot tone={entry.tone ?? "muted"} className="mt-1.5" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium">{entry.title}</span>
              {entry.actor && (
                <span className="text-xs text-muted-foreground">
                  {entry.actor}
                </span>
              )}
              <time
                dateTime={entry.at}
                className="ml-auto font-mono text-xs text-muted-foreground"
              >
                {formatDateTime(entry.at)}
              </time>
            </div>
            {entry.body && (
              <div className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
                {entry.body}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
