import {
  Button,
  DataTable,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { PlusIcon, SirenIcon } from "lucide-react";
import * as React from "react";

import type { CreateIncidentInput, IncidentData } from "@/graphql/risks/types";

import { FilterSelect } from "../../shared/FilterSelect";
import { formatDateTime, humanize } from "../../shared/format";
import {
  useListController,
  type ListSource,
} from "../../shared/list-controller";
import { activityCrumb } from "./nav";
import { ReportIncidentDialog } from "./ReportIncidentDialog";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_STATUS_TONE,
  INCIDENT_TYPES,
  SEVERITY_TONE,
  SLA_TONE,
  toneOf,
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

const COLUMNS: Column<IncidentData>[] = [
  {
    id: "incident",
    header: "Incident",
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
    header: "Severity",
    width: "w-28",
    cell: (i) => (
      <StatusBadge tone={toneOf(SEVERITY_TONE, i.severity)}>
        {i.severityDisplay ?? humanize(i.severity)}
      </StatusBadge>
    ),
  },
  {
    id: "assignee",
    header: "Assignee",
    width: "w-36",
    cell: (i) => (
      <span className="block truncate">{i.assignedToName ?? "Unassigned"}</span>
    ),
  },
  {
    id: "occurred",
    header: "Occurred",
    width: "w-44",
    cell: (i) => (
      <span className="font-mono text-xs">
        {formatDateTime(i.occurredAt ?? i.createdAt)}
      </span>
    ),
  },
  {
    id: "sla",
    header: "SLA",
    width: "w-28",
    cell: (i) =>
      i.slaStatus ? (
        <StatusBadge tone={toneOf(SLA_TONE, i.slaStatus)}>
          {humanize(i.slaStatus).toLowerCase()}
        </StatusBadge>
      ) : (
        "–"
      ),
  },
  {
    id: "status",
    header: "Status",
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
      title="Incidents"
      description="What went wrong, who owns it, and how far it is from resolved."
      primaryAction={
        canMutate ? (
          <Button size="sm" onClick={() => setReporting(true)}>
            <PlusIcon aria-hidden />
            Report incident
          </Button>
        ) : undefined
      }
    >
      <DataTable
        label="Incidents"
        controller={controller}
        columns={COLUMNS}
        getRowId={(i) => i.id}
        rowHref={incidentHref}
        rowLabel={(i) => i.title}
        searchPlaceholder="Search incidents"
        empty={{
          icon: <SirenIcon className="size-5" aria-hidden />,
          title: "No incidents",
          description:
            "Incidents open from critical alerts and anomalies, or when someone reports one.",
        }}
        emptyFiltered={{
          title: "No incidents match",
          description: "Change the search or clear the filters.",
        }}
        toolbar={
          <>
            <FilterSelect
              label="Status"
              value={filters.status}
              options={INCIDENT_STATUSES}
              onChange={(status) => onFiltersChange({ ...filters, status })}
            />
            <FilterSelect
              label="Severity"
              value={filters.severity}
              options={INCIDENT_SEVERITIES}
              onChange={(severity) => onFiltersChange({ ...filters, severity })}
            />
            <FilterSelect
              label="Type"
              value={filters.incidentType}
              options={INCIDENT_TYPES}
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
