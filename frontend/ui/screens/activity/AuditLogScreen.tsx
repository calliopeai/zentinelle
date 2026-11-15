import {
  Button,
  DataTable,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { ScrollTextIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

import type { AuditLogData } from "@/graphql/events/types";

import { DateRangeFilter, type DateRange } from "../../shared/DateRangeFilter";
import { ExportMenu, type ExportFormat } from "../../shared/ExportMenu";
import { formatDateTime } from "../../shared/format";
import {
  useListController,
  type ListSource,
} from "./components/list-controller";
import { AuditEntryDrawer, actorLabel } from "./AuditEntryDrawer";
import { activityCrumb } from "./nav";
import { AUDIT_STATUS_TONE, toneOf, useActivityLabels } from "./tones";
import type { AuditChainVerification } from "./types";
import { VerifyChainDialog } from "./VerifyChainDialog";

export interface AuditLogScreenProps {
  /** `GetAuditLogs`, with `search`, `startDate` and `endDate` from the controls. */
  auditLogs: ListSource<AuditLogData>;
  search: string;
  onSearchChange: (search: string) => void;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  /** The REST base (`/api/zentinelle/v1`), for the export links. */
  apiBase: string;
  /** Today's date (YYYY-MM-DD): the export's upper bound when the range is open. */
  today: string;
  /** REST `audit/verify`. */
  verify: {
    verifying: boolean;
    result: AuditChainVerification | null;
    error?: { message: string } | null;
  };
  onVerify: () => void;
}

/** The export's earliest bound when the range is open: before any record exists. */
const EPOCH = "2020-01-01";

/**
 * The formats `audit/export/` streams (backend AuditExportView). The view
 * filters by `from` and `to` only, so the date range carries over and the
 * search does not.
 */
export function auditExportFormats(
  apiBase: string,
  range: DateRange,
  today: string,
  /** The `activity.audit` translator, for each format's name and description. */
  t: (key: string) => string,
): ExportFormat[] {
  const query = (format: string) =>
    `${apiBase.replace(/\/+$/, "")}/audit/export/?${new URLSearchParams({
      format,
      from: range.from || EPOCH,
      to: range.to || today,
    })}`;
  return ["csv", "ndjson", "cef", "bundle"].map((key) => ({
    key,
    label: t(`formats.${key}.label`),
    description: t(`formats.${key}.description`),
    href: query(key),
  }));
}

const columns = (
  t: ReturnType<typeof useTranslations>,
  status: (value: string) => string,
): Column<AuditLogData>[] => [
  {
    id: "when",
    header: t("columns.when"),
    width: "w-44",
    cell: (e) => (
      <span className="font-mono text-xs">{formatDateTime(e.timestamp)}</span>
    ),
  },
  {
    id: "action",
    header: t("columns.action"),
    cell: (e) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-xs">{e.action}</span>
        <span className="truncate text-xs text-muted-foreground">
          {e.resourceName || `${e.resourceType} ${e.resourceId}`}
        </span>
      </div>
    ),
  },
  {
    id: "actor",
    header: t("columns.actor"),
    width: "w-48",
    cell: (e) => <span className="block truncate">{actorLabel(e, t)}</span>,
  },
  {
    id: "status",
    header: t("columns.result"),
    width: "w-28",
    cell: (e) =>
      e.status ? (
        <StatusBadge tone={toneOf(AUDIT_STATUS_TONE, e.status)}>
          {status(e.status)}
        </StatusBadge>
      ) : (
        "–"
      ),
  },
];

/** What the export covers, under `activity.audit.range`. */
function rangeScope(
  t: ReturnType<typeof useTranslations>,
  { from, to }: DateRange,
) {
  if (from && to) return t("range.between", { from, to });
  if (from) return t("range.from", { from });
  if (to) return t("range.to", { to });
  return t("range.all");
}

/**
 * Activity > Audit log: every change, searchable on the server, with the
 * backend's four export formats and a check of the hash chain.
 */
export function AuditLogScreen({
  auditLogs,
  search,
  onSearchChange,
  range,
  onRangeChange,
  apiBase,
  today,
  verify,
  onVerify,
}: AuditLogScreenProps) {
  const t = useTranslations("activity.audit");
  const labels = useActivityLabels();
  const [open, setOpen] = React.useState<AuditLogData | null>(null);
  const [verifyOpen, setVerifyOpen] = React.useState(false);
  const controller = useListController({
    ...auditLogs,
    isFiltered: Boolean(range.from || range.to),
    clearFilters: () => onRangeChange({ from: "", to: "" }),
    search,
    onSearchChange,
    pageSize: 50,
  });
  return (
    <PageFrame
      crumbs={[activityCrumb("audit-log")]}
      title={t("title")}
      description={t("description")}
      primaryAction={
        <Button
          size="sm"
          variant="outline"
          data-tour="audit-chain"
          onClick={() => {
            setVerifyOpen(true);
            onVerify();
          }}
        >
          <ShieldCheckIcon aria-hidden />
          {t("verify")}
        </Button>
      }
      menu={
        <ExportMenu
          formats={auditExportFormats(apiBase, range, today, t)}
          scope={rangeScope(t, range)}
        />
      }
    >
      <DataTable
        label={t("tableLabel")}
        controller={controller}
        columns={columns(t, labels.auditStatus)}
        getRowId={(e) => e.id}
        onRowActivate={setOpen}
        rowLabel={(e) =>
          t("rowLabel", {
            action: e.action,
            time: formatDateTime(e.timestamp),
          })
        }
        searchPlaceholder={t("search")}
        empty={{
          icon: <ScrollTextIcon className="size-5" aria-hidden />,
          title: t("empty.title"),
          description: t("empty.description"),
        }}
        emptyFiltered={{
          title: t("emptyFiltered.title"),
          description: t("emptyFiltered.description"),
        }}
        toolbar={<DateRangeFilter value={range} onChange={onRangeChange} />}
      />
      <AuditEntryDrawer entry={open} onClose={() => setOpen(null)} />
      <VerifyChainDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        verifying={verify.verifying}
        result={verify.result}
        error={verify.error}
        onRetry={onVerify}
      />
    </PageFrame>
  );
}
