import {
  Button,
  DataTable,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { PlusIcon, SirenIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

import type { CreateIncidentInput, IncidentData } from "@/graphql/risks/types";

import { FilterSelect } from "../../shared/FilterSelect";
import { formatDateTime, humanize } from "../../shared/format";
import {
  useListController,
  type ListSource,
} from "./components/list-controller";
import { activityCrumb } from "./nav";
import { ReportIncidentDialog } from "./ReportIncidentDialog";
import {
  INCIDENT_STATUS_TONE,
  SEVERITY_TONE,
  SLA_TONE,
  toneOf,
  useActivityLabels,
} from "./tones";

export interface IncidentFilters {
  severity: string;
  status: string;
  incidentType: string;
}

export const NO_INCIDENT_FILTERS: IncidentFilters = {
  severity: "",
  status: "",
  incidentType: "",
};

export interface IncidentsScreenProps {
  /** `GetIncidents`, with the filters and search as its variables. */
  incidents: ListSource<IncidentData>;
  filters: IncidentFilters;
  onFiltersChange: (filters: IncidentFilters) => void;
  /** The live search input; the route debounces it into `search`. */
  search: string;
  onSearchChange: (search: string) => void;
  /** Operators and admins report incidents; viewers read them. */
  canMutate: boolean;
  onReport?: (input: CreateIncidentInput) => Promise<unknown> | void;
}

export const incidentHref = (i: Pick<IncidentData, "id">) =>
  `/incidents/${encodeURIComponent(i.id)}`;

const columns = (
  t: ReturnType<typeof useTranslations>,
  sla: (value: string) => string,
): Column<IncidentData>[] => [
  {
    id: "incident",
    header: t("columns.incident"),
    cell: (i) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{i.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {[i.incidentTypeDisplay ?? humanize(i.incidentType), i.endpointName]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    ),
  },
  {
    id: "severity",
    header: t("columns.severity"),
    width: "w-28",
    cell: (i) => (
      <StatusBadge tone={toneOf(SEVERITY_TONE, i.severity)}>
        {i.severityDisplay ?? humanize(i.severity)}
      </StatusBadge>
    ),
  },
  {
    id: "assignee",
    header: t("columns.assignee"),
    width: "w-36",
    cell: (i) => (
      <span className="block truncate">
        {i.assignedToName ?? t("unassigned")}
      </span>
    ),
  },
  {
    id: "occurred",
    header: t("columns.occurred"),
    width: "w-44",
    cell: (i) => (
      <span className="font-mono text-xs">
        {formatDateTime(i.occurredAt ?? i.createdAt)}
      </span>
    ),
  },
  {
    id: "sla",
    header: t("columns.sla"),
    width: "w-28",
    cell: (i) =>
      i.slaStatus ? (
        <StatusBadge tone={toneOf(SLA_TONE, i.slaStatus)}>
          {sla(i.slaStatus)}
        </StatusBadge>
      ) : (
        "–"
      ),
  },
  {
    id: "status",
    header: t("columns.status"),
    width: "w-32",
    cell: (i) => (
      <StatusBadge tone={toneOf(INCIDENT_STATUS_TONE, i.status)}>
        {i.statusDisplay ?? humanize(i.status)}
      </StatusBadge>
    ),
  },
];

/** Activity > Incidents: the list, searched and filtered on the server; each row is a link to the incident's page. */
export function IncidentsScreen({
  incidents,
  filters,
  onFiltersChange,
  search,
  onSearchChange,
  canMutate,
  onReport,
}: IncidentsScreenProps) {
  const t = useTranslations("activity.incidents");
  const labels = useActivityLabels();
  const [reporting, setReporting] = React.useState(false);
  const controller = useListController({
    ...incidents,
    isFiltered: Boolean(
      filters.severity || filters.status || filters.incidentType,
    ),
    clearFilters: () => onFiltersChange(NO_INCIDENT_FILTERS),
    search,
    onSearchChange,
  });

  return (
    <PageFrame
      crumbs={[activityCrumb("incidents")]}
      title={t("title")}
      description={t("description")}
      primaryAction={
        canMutate ? (
          <Button size="sm" onClick={() => setReporting(true)}>
            <PlusIcon aria-hidden />
            {t("report")}
          </Button>
        ) : undefined
      }
    >
      <DataTable
        label={t("tableLabel")}
        controller={controller}
        columns={columns(t, labels.sla)}
        getRowId={(i) => i.id}
        rowHref={incidentHref}
        rowLabel={(i) => i.title}
        searchPlaceholder={t("search")}
        empty={{
          icon: <SirenIcon className="size-5" aria-hidden />,
          title: t("empty.title"),
          description: t("empty.description"),
        }}
        emptyFiltered={{
          title: t("emptyFiltered.title"),
          description: t("emptyFiltered.description"),
        }}
        toolbar={
          <>
            <FilterSelect
              label={t("filters.status")}
              value={filters.status}
              options={labels.incidentStatuses}
              onChange={(status) => onFiltersChange({ ...filters, status })}
            />
            <FilterSelect
              label={t("filters.severity")}
              value={filters.severity}
              options={labels.incidentSeverities}
              onChange={(severity) => onFiltersChange({ ...filters, severity })}
            />
            <FilterSelect
              label={t("filters.type")}
              value={filters.incidentType}
              options={labels.incidentTypes}
              onChange={(incidentType) =>
                onFiltersChange({ ...filters, incidentType })
              }
            />
          </>
        }
      />
      {canMutate && onReport && (
        <ReportIncidentDialog
          open={reporting}
          onOpenChange={setReporting}
          onSubmit={onReport}
        />
      )}
    </PageFrame>
  );
}
