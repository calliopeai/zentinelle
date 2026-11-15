import {
  Button,
  DataTable,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { ActivityIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

import type { EventData } from "@/graphql/events/types";

import { FilterSelect } from "../../shared/FilterSelect";
import { formatDateTime } from "../../shared/format";
import {
  useListController,
  type ListSource,
} from "../../shared/list-controller";
import { NewRowsPill } from "../../shared/NewRowsPill";
import { EventDrawer } from "./EventDrawer";
import { activityCrumb } from "./nav";
import { EVENT_STATUS_TONE, toneOf, useActivityLabels } from "./tones";

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

const columns = (
  t: ReturnType<typeof useTranslations>,
  labels: ReturnType<typeof useActivityLabels>,
): Column<EventData>[] => [
  {
    id: "occurred",
    header: t("columns.occurred"),
    width: "w-44",
    cell: (e) => (
      <span className="font-mono text-xs">{formatDateTime(e.occurredAt)}</span>
    ),
  },
  {
    id: "event",
    header: t("columns.event"),
    cell: (e) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">
          {labels.eventType(e.eventType)}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {labels.eventCategory(e.eventCategory)}
          {e.userIdentifier ? ` · ${e.userIdentifier}` : ""}
        </span>
      </div>
    ),
  },
  {
    id: "agent",
    header: t("columns.agent"),
    width: "w-48",
    cell: (e) => (
      <span className="block truncate">{e.endpointName ?? "–"}</span>
    ),
  },
  {
    id: "status",
    header: t("columns.status"),
    width: "w-28",
    cell: (e) => (
      <StatusBadge
        tone={toneOf(EVENT_STATUS_TONE, e.status)}
        pulse={e.status === "processing"}
      >
        {labels.eventStatus(e.status)}
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
  const t = useTranslations("activity.events");
  const labels = useActivityLabels();
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
      title={t("title")}
      description={t("description")}
      primaryAction={
        <Button
          size="sm"
          variant="outline"
          aria-pressed={live}
          onClick={() => onLiveChange(!live)}
        >
          {live ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
          {live ? t("pause") : t("resume")}
        </Button>
      }
    >
      <NewRowsPill
        count={heldCount}
        onShow={onShowHeld}
        label={(n) => t("newRows", { count: n })}
        className="mb-2"
      />
      <DataTable
        label={t("tableLabel")}
        controller={controller}
        columns={columns(t, labels)}
        getRowId={(e) => e.id}
        onRowActivate={setOpen}
        rowLabel={(e) =>
          t("rowLabel", {
            event: labels.eventType(e.eventType),
            time: formatDateTime(e.occurredAt),
          })
        }
        empty={{
          icon: <ActivityIcon className="size-5" aria-hidden />,
          title: t("empty.title"),
          description: t("empty.description"),
          actionHref: "/agents",
          actionLabel: t("empty.action"),
        }}
        emptyFiltered={{
          title: t("emptyFiltered.title"),
          description: t("emptyFiltered.description"),
        }}
        toolbar={
          <>
            <FilterSelect
              label={t("filters.category")}
              value={filters.category}
              options={labels.eventCategories}
              onChange={(category) => onFiltersChange({ ...filters, category })}
            />
            <FilterSelect
              label={t("filters.type")}
              value={filters.eventType}
              options={labels.eventTypes}
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
