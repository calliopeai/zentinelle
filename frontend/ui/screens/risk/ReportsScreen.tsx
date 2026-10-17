import {
  Button,
  DataTable,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { FileTextIcon, PlusIcon } from "lucide-react";

import type { ComplianceReportData } from "@/graphql/compliance-reports/types";

import { useListController } from "../../patterns/list-controller";
import { ViewSwitch } from "../../patterns/ViewSwitch";
import {
  IN_FLIGHT_REPORT,
  REPORT_TONE,
  areaCrumb,
  canMutate,
  formatDateTime,
  type QueryState,
} from "./model";
import type { ReportJob } from "./rest-types";

/** One row of the list, whichever operation produced it. */
export interface ReportRow {
  key: string;
  type: "compliance" | "risk";
  name: string;
  /** The framework, or the report kind of a job. */
  subject: string | null;
  period: string | null;
  status: string;
  createdAt: string | null;
  downloadUrl: string | null;
  error: string | null;
}

const JOB_NAME: Record<ReportJob["report_type"], string> = {
  control_coverage: "Control coverage",
  violation_summary: "Violation summary",
  audit_trail: "Audit trail",
};

/** A `GetComplianceReports` row. */
export function fromComplianceReport(
  report: ComplianceReportData,
  frameworkName: (id: string) => string = (id) => id,
): ReportRow {
  return {
    key: `compliance-${report.id}`,
    type: "compliance",
    name: report.name ?? "Compliance report",
    subject: report.framework
      ? frameworkName(report.framework)
      : "All frameworks",
    period: report.period,
    status: report.status ?? "pending",
    createdAt: report.generatedAt,
    downloadUrl: report.downloadUrl,
    error: null,
  };
}

/** A `reports/` job; it downloads from `reports/{id}/download/` once completed. */
export function fromReportJob(
  job: ReportJob,
  apiBase = "/api/zentinelle/v1",
): ReportRow {
  const from = job.params.date_from as string | undefined;
  const to = job.params.date_to as string | undefined;
  return {
    key: `job-${job.id}`,
    type: "risk",
    name: JOB_NAME[job.report_type] ?? job.report_type,
    subject: `${job.format.toUpperCase()} export`,
    period: from || to ? `${from ?? "start"} to ${to ?? "now"}` : null,
    status: job.status,
    createdAt: job.created_at,
    downloadUrl:
      job.status === "completed"
        ? `${apiBase}/reports/${job.id}/download/`
        : null,
    error: job.error_message,
  };
}

export type ReportsView = "all" | "compliance" | "risk";

export interface ReportsScreenProps extends QueryState {
  capabilities: readonly string[];
  view: ReportsView;
  /** Newest first. */
  reports: readonly ReportRow[];
  onGenerate?: () => void;
}

const VIEWS = [
  { key: "all", label: "All", href: "/reports" },
  { key: "compliance", label: "Compliance", href: "/reports?type=compliance" },
  { key: "risk", label: "Risk and audit", href: "/reports?type=risk" },
] as const;

const COLUMNS: Column<ReportRow>[] = [
  {
    id: "name",
    header: "Report",
    cell: (r) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{r.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {r.subject}
        </span>
      </span>
    ),
    cellClassName: "max-w-sm",
  },
  {
    id: "period",
    header: "Period",
    cell: (r) =>
      r.period ?? <span className="text-muted-foreground">Not set</span>,
  },
  {
    id: "status",
    header: "Status",
    width: "w-32",
    cell: (r) => (
      <StatusBadge
        tone={REPORT_TONE[r.status] ?? "muted"}
        pulse={IN_FLIGHT_REPORT.has(r.status)}
        title={r.error ?? undefined}
      >
        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
      </StatusBadge>
    ),
  },
  {
    id: "created",
    header: "Generated",
    width: "w-48",
    cell: (r) => formatDateTime(r.createdAt),
  },
  {
    id: "download",
    header: <span className="sr-only">Download</span>,
    label: "Download",
    width: "w-28",
    align: "right",
    cell: (r) =>
      r.downloadUrl ? (
        <a
          href={r.downloadUrl}
          download
          className="relative z-10 text-sm underline underline-offset-2"
          aria-label={`Download ${r.name}`}
        >
          Download
        </a>
      ) : null,
  },
];

/**
 * Reports: risk, audit and compliance reports in one list, newest first,
 * replacing `/risks/reports` and `/compliance/reports`. Generate opens one
 * dialog for both kinds.
 */
export function ReportsScreen({
  capabilities,
  view,
  reports,
  onGenerate,
  loading,
  error,
  onRetry,
}: ReportsScreenProps) {
  const editable = canMutate(capabilities);
  const shown =
    view === "all" ? reports : reports.filter((r) => r.type === view);
  const controller = useListController(shown, {
    loading,
    error,
    retry: onRetry,
  });
  const narrowed = view !== "all" && reports.length > 0;
  return (
    <PageFrame
      crumbs={[areaCrumb("reports", capabilities)]}
      title="Reports"
      primaryAction={
        editable ? (
          <Button onClick={onGenerate}>
            <PlusIcon aria-hidden />
            Generate report
          </Button>
        ) : undefined
      }
      filters={<ViewSwitch label="Report types" views={VIEWS} active={view} />}
    >
      <DataTable
        label="Reports"
        controller={controller}
        columns={COLUMNS}
        getRowId={(r) => r.key}
        rowLabel={(r) => r.name}
        empty={
          narrowed
            ? {
                icon: (
                  <FileTextIcon
                    className="size-5 text-muted-foreground"
                    aria-hidden
                  />
                ),
                title: "No reports of this type",
                actionHref: "/reports",
                actionLabel: "Show all reports",
              }
            : {
                icon: (
                  <FileTextIcon
                    className="size-5 text-muted-foreground"
                    aria-hidden
                  />
                ),
                title: "No reports yet",
                description: editable
                  ? "Generate a compliance, coverage, violation or audit report for a period."
                  : "No one in your organization has generated a report yet.",
              }
        }
      />
    </PageFrame>
  );
}
