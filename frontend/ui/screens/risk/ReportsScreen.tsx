import {
  Button,
  DataTable,
  useLocalTable,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ComplianceReportData } from "@/graphql/compliance-reports/types";

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

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

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

const JOB_NAME = (t: Translate): Record<ReportJob["report_type"], string> => ({
  control_coverage: t("controlCoverage"),
  violation_summary: t("violationSummary"),
  audit_trail: t("auditTrail"),
});

/** A `GetComplianceReports` row. */
export function fromComplianceReport(
  report: ComplianceReportData,
  /** The `risk.reportsScreen` translator. */
  t: Translate,
  frameworkName: (id: string) => string = (id) => id,
): ReportRow {
  return {
    key: `compliance-${report.id}`,
    type: "compliance",
    name: report.name ?? t("complianceReport"),
    subject: report.framework
      ? frameworkName(report.framework)
      : t("allFrameworks"),
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
  /** The `risk.reportsScreen` translator. */
  t: Translate,
  apiBase = "/api/zentinelle/v1",
): ReportRow {
  const from = job.params.date_from as string | undefined;
  const to = job.params.date_to as string | undefined;
  return {
    key: `job-${job.id}`,
    type: "risk",
    name: JOB_NAME(t)[job.report_type] ?? job.report_type,
    subject: t("jobExport", { format: job.format.toUpperCase() }),
    period:
      from || to
        ? t("jobPeriod", { from: from ?? t("start"), to: to ?? t("now") })
        : null,
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

const VIEWS = (t: Translate) =>
  [
    { key: "all", label: t("all"), href: "/reports" },
    {
      key: "compliance",
      label: t("compliance"),
      href: "/reports?type=compliance",
    },
    { key: "risk", label: t("riskAndAudit"), href: "/reports?type=risk" },
  ] as const;

const COLUMNS = (t: Translate): Column<ReportRow>[] => [
  {
    id: "name",
    header: t("report"),
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
    header: t("period"),
    cell: (r) =>
      r.period ?? <span className="text-muted-foreground">Not set</span>,
  },
  {
    id: "status",
    header: t("status"),
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
    header: t("generated"),
    width: "w-48",
    cell: (r) => formatDateTime(r.createdAt),
  },
  {
    id: "download",
    header: <span className="sr-only">Download</span>,
    label: t("download"),
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
          {t("download")}
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
  const t = useTranslations("risk.reportsScreen");
  const editable = canMutate(capabilities);
  const shown =
    view === "all" ? reports : reports.filter((r) => r.type === view);
  const controller = useLocalTable(shown, {
    loading,
    error,
    retry: onRetry,
  });
  const narrowed = view !== "all" && reports.length > 0;
  return (
    <PageFrame
      crumbs={[areaCrumb("reports", capabilities)]}
      title={t("reports")}
      primaryAction={
        editable ? (
          <Button onClick={onGenerate}>
            <PlusIcon aria-hidden />
            {t("generateReport")}
          </Button>
        ) : undefined
      }
      filters={
        <ViewSwitch label={t("reportTypes")} views={VIEWS(t)} active={view} />
      }
    >
      <DataTable
        label={t("reports")}
        controller={controller}
        columns={COLUMNS(t)}
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
                title: t("noReportsOfThisType"),
                actionHref: "/reports",
                actionLabel: t("showAllReports"),
              }
            : {
                icon: (
                  <FileTextIcon
                    className="size-5 text-muted-foreground"
                    aria-hidden
                  />
                ),
                title: t("noReportsYet"),
                description: editable
                  ? t("generateAComplianceCoverageViolation")
                  : t("noOneInYourOrganization"),
              }
        }
      />
    </PageFrame>
  );
}
