import {
  Button,
  DataTable,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { ScrollTextIcon, ShieldCheckIcon } from "lucide-react";
import * as React from "react";

import type { AuditLogData } from "@/graphql/events/types";

import { DateRangeFilter, type DateRange } from "../../shared/DateRangeFilter";
import { ExportMenu, type ExportFormat } from "../../shared/ExportMenu";
import { formatDateTime } from "../../shared/format";
import {
  useListController,
  type ListSource,
} from "../../shared/list-controller";
import { AuditEntryDrawer, actorLabel } from "./AuditEntryDrawer";
import { activityCrumb } from "./nav";
import { AUDIT_STATUS_TONE, toneOf } from "./tones";
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
): ExportFormat[] {
  const query = (format: string) =>
    `${apiBase.replace(/\/+$/, "")}/audit/export/?${new URLSearchParams({
      format,
      from: range.from || EPOCH,
      to: range.to || today,
    })}`;
  return [
    {
      key: "csv",
      label: "CSV",
      description: "One row per record, for a spreadsheet",
      href: query("csv"),
    },
    {
      key: "ndjson",
      label: "NDJSON",
      description: "One JSON record per line, with hashes",
      href: query("ndjson"),
    },
    {
      key: "cef",
      label: "CEF",
      description: "For a SIEM (Splunk, Sentinel, QRadar)",
      href: query("cef"),
    },
    {
      key: "bundle",
      label: "Evidence bundle",
      description: "Signed NDJSON with a chain checkpoint",
      href: query("bundle"),
    },
  ];
}

const COLUMNS: Column<AuditLogData>[] = [
  {
    id: "when",
    header: "When",
    width: "w-44",
    cell: (e) => (
      <span className="font-mono text-xs">{formatDateTime(e.timestamp)}</span>
    ),
  },
  {
    id: "action",
    header: "Action",
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
    header: "Actor",
    width: "w-48",
    cell: (e) => <span className="block truncate">{actorLabel(e)}</span>,
  },
  {
    id: "status",
    header: "Result",
    width: "w-28",
    cell: (e) =>
      e.status ? (
        <StatusBadge tone={toneOf(AUDIT_STATUS_TONE, e.status)}>
          {e.status}
        </StatusBadge>
      ) : (
        "–"
      ),
  },
];

function rangeLabel(range: DateRange) {
  if (range.from && range.to) return `from ${range.from} to ${range.to}`;
  if (range.from) return `from ${range.from} on`;
  if (range.to) return `up to ${range.to}`;
  return "of every date";
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
      title="Audit log"
      description="Who changed what, when, and from where. Records are hash-chained."
      primaryAction={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setVerifyOpen(true);
            onVerify();
          }}
        >
          <ShieldCheckIcon aria-hidden />
          Verify chain
        </Button>
      }
      menu={
        <ExportMenu
          formats={auditExportFormats(apiBase, range, today)}
          scope={`Exports every record ${rangeLabel(range)}. The search does not apply.`}
        />
      }
    >
      <DataTable
        label="Audit log"
        controller={controller}
        columns={COLUMNS}
        getRowId={(e) => e.id}
        onRowActivate={setOpen}
        rowLabel={(e) => `${e.action} at ${formatDateTime(e.timestamp)}`}
        searchPlaceholder="Search actions, resources and actors"
        empty={{
          icon: <ScrollTextIcon className="size-5" aria-hidden />,
          title: "No audit records",
          description:
            "Changes to policies, agents, keys and settings are recorded here as they happen.",
        }}
        emptyFiltered={{
          title: "No records match",
          description: "Change the search or widen the dates.",
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
