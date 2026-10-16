import {
  Button,
  DataTable,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { ActivityIcon, PauseIcon, PlayIcon } from "lucide-react";
import * as React from "react";

import type { EventData } from "@/graphql/events/types";

import { FilterSelect } from "../../shared/FilterSelect";
import { formatDateTime, humanize } from "../../shared/format";
import {
  useListController,
  type ListSource,
} from "../../shared/list-controller";
import { NewRowsPill } from "../../shared/NewRowsPill";
import { EventDrawer } from "./EventDrawer";
import { activityCrumb } from "./nav";
import {
  EVENT_CATEGORIES,
  EVENT_STATUS_TONE,
  EVENT_TYPES,
  toneOf,
} from "./tones";

export interface EventFilters {
  category: string;
  eventType: string;
}

export const NO_EVENT_FILTERS: EventFilters = { category: "", eventType: "" };

export interface EventsScreenProps {
  /** `GetEvents`, filtered by `category` and `eventType`. The rows on screen, without the held ones. */
  events: ListSource<EventData>;
  filters: EventFilters;
  onFiltersChange: (filters: EventFilters) => void;
  /** Polling every 5 seconds, as /events does today. */
  live: boolean;
  onLiveChange: (live: boolean) => void;
  /** Rows a poll brought in, held so the list does not move under the reader. */
  heldCount: number;
  onShowHeld: () => void;
}

const COLUMNS: Column<EventData>[] = [
  {
    id: "occurred",
    header: "Occurred",
    width: "w-44",
    cell: (e) => (
      <span className="font-mono text-xs">{formatDateTime(e.occurredAt)}</span>
    ),
  },
  {
    id: "event",
    header: "Event",
    cell: (e) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{humanize(e.eventType)}</span>
        <span className="truncate text-xs text-muted-foreground">
          {humanize(e.eventCategory)}
          {e.userIdentifier ? ` · ${e.userIdentifier}` : ""}
        </span>
      </div>
    ),
  },
  {
    id: "agent",
    header: "Agent",
    width: "w-48",
    cell: (e) => (
      <span className="block truncate">{e.endpointName ?? "–"}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "w-28",
    cell: (e) => (
      <StatusBadge
        tone={toneOf(EVENT_STATUS_TONE, e.status)}
        pulse={e.status === "processing"}
      >
        {e.status}
      </StatusBadge>
    ),
  },
];

/**
 * Activity > Events: what agents report, newest first. Live polling holds
 * new rows behind a pill rather than pushing the list down; each row opens
 * the event and its payload in a side sheet.
 */
export function EventsScreen({
  events,
  filters,
  onFiltersChange,
  live,
  onLiveChange,
  heldCount,
  onShowHeld,
}: EventsScreenProps) {
  const [open, setOpen] = React.useState<EventData | null>(null);
  const controller = useListController({
    ...events,
    isFiltered: Boolean(filters.category || filters.eventType),
    clearFilters: () => onFiltersChange(NO_EVENT_FILTERS),
    pageSize: 50,
  });
  return (
    <PageFrame
      crumbs={[activityCrumb("events")]}
      title="Events"
      description="Telemetry, audit and alert events as agents report them."
      primaryAction={
        <Button
          size="sm"
          variant="outline"
          aria-pressed={live}
          onClick={() => onLiveChange(!live)}
        >
          {live ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
          {live ? "Pause live updates" : "Resume live updates"}
        </Button>
      }
    >
      <NewRowsPill
        count={heldCount}
        onShow={onShowHeld}
        label={(n) => `${n} new ${n === 1 ? "event" : "events"}`}
        className="mb-2"
      />
      <DataTable
        label="Events"
        controller={controller}
        columns={COLUMNS}
        getRowId={(e) => e.id}
        onRowActivate={setOpen}
        rowLabel={(e) =>
          `${humanize(e.eventType)} at ${formatDateTime(e.occurredAt)}`
        }
        empty={{
          icon: <ActivityIcon className="size-5" aria-hidden />,
          title: "No events yet",
          description:
            "Agents report heartbeats, requests and violations once they run with the Zentinelle AI SDK.",
          actionHref: "/agents",
          actionLabel: "See agents",
        }}
        emptyFiltered={{
          title: "No events match",
          description: "Clear the filters to see every event.",
        }}
        toolbar={
          <>
            <FilterSelect
              label="Category"
              value={filters.category}
              options={EVENT_CATEGORIES}
              onChange={(category) => onFiltersChange({ ...filters, category })}
            />
            <FilterSelect
              label="Type"
              value={filters.eventType}
              options={EVENT_TYPES}
              onChange={(eventType) =>
                onFiltersChange({ ...filters, eventType })
              }
            />
          </>
        }
      />
      <EventDrawer event={open} onClose={() => setOpen(null)} />
    </PageFrame>
  );
}
