"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileTextIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileJsonIcon,
  ClipboardListIcon,
  BarChart3Icon,
  AlertTriangleIcon,
  LoaderIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
} from "lucide-react";
import { toast } from "sonner";

/* ── Report type definitions ─────────────────────────────────── */

/**
 * UI-facing report types, mapped to backend ReportType values.
 *
 * The risks reports page exposes risk-assessment / executive-summary /
 * incident-report categories. Internally these map to the existing backend
 * ReportType enum (control_coverage / violation_summary / audit_trail).
 */
type UiReportTypeId = "risk-assessment" | "executive-summary" | "incident-report";
type BackendReportType =
  | "control_coverage"
  | "violation_summary"
  | "audit_trail";
type ReportFormat = "csv" | "pdf" | "ndjson";

interface ReportTypeConfig {
  id: UiReportTypeId;
  backendType: BackendReportType;
  name: string;
  description: string;
  icon: React.ReactNode;
  /** Whether this report type requires a date range. */
  requiresDateRange: boolean;
  /** Compliance pack name required for control_coverage reports. */
  defaultPackName?: string;
}

const REPORT_TYPES: ReportTypeConfig[] = [
  {
    id: "risk-assessment",
    backendType: "control_coverage",
    name: "Risk Assessment Report",
    description:
      "Full inventory of open risks with scores, owners, and mitigation plans",
    icon: <ClipboardListIcon className="h-6 w-6" />,
    requiresDateRange: false,
    defaultPackName: "soc2",
  },
  {
    id: "executive-summary",
    backendType: "violation_summary",
    name: "Executive Summary",
    description:
      "One-page overview for leadership: risk index, top risks, trends",
    icon: <BarChart3Icon className="h-6 w-6" />,
    requiresDateRange: true,
  },
  {
    id: "incident-report",
    backendType: "audit_trail",
    name: "Incident Report",
    description:
      "Detailed breakdown of incidents, SLAs, root causes, resolution times",
    icon: <AlertTriangleIcon className="h-6 w-6" />,
    requiresDateRange: true,
  },
];

const FORMATS: Array<{
  id: ReportFormat;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "pdf", label: "PDF", icon: <FileTextIcon className="h-4 w-4" /> },
  { id: "csv", label: "CSV", icon: <FileSpreadsheetIcon className="h-4 w-4" /> },
  {
    id: "ndjson",
    label: "NDJSON",
    icon: <FileJsonIcon className="h-4 w-4" />,
  },
];

/* ── API helpers ─────────────────────────────────────────────── */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:8080/api/zentinelle/v1";

interface ReportRecord {
  id: number;
  report_type: BackendReportType | string;
  status: "pending" | "generating" | "complete" | "failed" | string;
  format: string;
  params: Record<string, unknown>;
  created_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  /** Locally tracked UI-level report type. */
  uiTypeId?: UiReportTypeId;
}

async function postReport(body: {
  report_type: BackendReportType;
  format: ReportFormat;
  params: Record<string, unknown>;
}): Promise<{ id: number; status: string } | { error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/reports/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data.detail || `HTTP ${res.status}` };
    }
    return { id: data.id, status: data.status };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

async function fetchReportStatus(id: number): Promise<ReportRecord | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/reports/${id}/`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ReportRecord;
  } catch {
    return null;
  }
}

function reportDownloadUrl(id: number): string {
  return `${API_BASE_URL}/reports/${id}/download/`;
}

/* ── Status helpers ──────────────────────────────────────────── */

function statusBadge(status: string) {
  switch (status) {
    case "complete":
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2Icon className="h-3 w-3" />
          Complete
        </Badge>
      );
    case "generating":
      return (
        <Badge variant="secondary" className="gap-1">
          <LoaderIcon className="h-3 w-3 animate-spin" />
          Generating
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1">
          <ClockIcon className="h-3 w-3" />
          Pending
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircleIcon className="h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reportTypeLabel(record: ReportRecord): string {
  if (record.uiTypeId) {
    const cfg = REPORT_TYPES.find((t) => t.id === record.uiTypeId);
    if (cfg) return cfg.name;
  }
  // Fallback for records loaded fresh without a UI hint.
  switch (record.report_type) {
    case "control_coverage":
      return "Risk Assessment Report";
    case "violation_summary":
      return "Executive Summary";
    case "audit_trail":
      return "Incident Report";
    default:
      return record.report_type;
  }
}

/* ── localStorage persistence ─────────────────────────────────── */

const STORAGE_KEY = "zentinelle.risk-report-history";

function loadHistoryIds(): Array<{ id: number; uiTypeId?: UiReportTypeId }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is { id: number; uiTypeId?: UiReportTypeId } =>
        entry && typeof entry.id === "number",
    );
  } catch {
    return [];
  }
}

function saveHistoryIds(
  entries: Array<{ id: number; uiTypeId?: UiReportTypeId }>,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, 25)),
    );
  } catch {
    /* localStorage unavailable */
  }
}

/* ── Main page ───────────────────────────────────────────────── */

export default function RiskReportsPage() {
  const [selectedType, setSelectedType] = useState<UiReportTypeId>(
    "risk-assessment",
  );
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>("pdf");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<ReportRecord[]>([]);

  const selectedTypeConfig = useMemo(
    () => REPORT_TYPES.find((t) => t.id === selectedType) ?? REPORT_TYPES[0],
    [selectedType],
  );

  /* Refresh history records in-place. Used both on mount and as a poller
   * for any report still in pending/generating state. */
  const refreshHistory = useCallback(async () => {
    const stored = loadHistoryIds();
    if (stored.length === 0) {
      setHistory([]);
      return;
    }
    const records = await Promise.all(
      stored.map(async (entry): Promise<ReportRecord | null> => {
        const fresh = await fetchReportStatus(entry.id);
        if (!fresh) return null;
        return { ...fresh, uiTypeId: entry.uiTypeId };
      }),
    );
    const filtered = records.filter((r): r is ReportRecord => r !== null);
    setHistory(filtered);
  }, []);

  // Initial load — refreshHistory awaits a network call before any setState,
  // so the lint warning about synchronous setState in effects does not apply.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshHistory();
  }, [refreshHistory]);

  // Poll while any record is still in progress.
  const hasPending = history.some(
    (r) => r.status === "pending" || r.status === "generating",
  );
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(refreshHistory, 3000);
    return () => clearInterval(id);
  }, [hasPending, refreshHistory]);

  const handleGenerate = async () => {
    if (selectedTypeConfig.requiresDateRange && (!startDate || !endDate)) {
      toast.error("Date range is required", {
        description:
          "Both start and end dates must be set for this report type.",
      });
      return;
    }

    setGenerating(true);

    const params: Record<string, unknown> = {};
    if (selectedTypeConfig.backendType === "control_coverage") {
      params.pack_name =
        selectedTypeConfig.defaultPackName ?? "soc2";
    }
    if (startDate) params.date_from = startDate;
    if (endDate) params.date_to = endDate;

    const result = await postReport({
      report_type: selectedTypeConfig.backendType,
      format: selectedFormat,
      params,
    });

    if ("error" in result) {
      toast.error("Failed to start report", { description: result.error });
      setGenerating(false);
      return;
    }

    toast.success("Report generation started", {
      description: "Track progress in the history table below.",
    });

    // Persist the new ID with its UI type hint
    const stored = loadHistoryIds();
    saveHistoryIds([
      { id: result.id, uiTypeId: selectedType },
      ...stored.filter((s) => s.id !== result.id),
    ]);

    await refreshHistory();
    setGenerating(false);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Risk Reports</h1>
        <p className="text-muted-foreground">
          Generate exportable risk assessment reports
        </p>
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map((type) => (
          <Card
            key={type.id}
            className={`cursor-pointer transition-all ${
              selectedType === type.id
                ? "border-primary ring-1 ring-primary/30"
                : "hover:border-primary/30"
            }`}
            onClick={() => setSelectedType(type.id)}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="text-primary">{type.icon}</div>
                <div>
                  <CardTitle className="text-sm">{type.name}</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {type.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Configuration form */}
      <Card>
        <CardHeader>
          <CardTitle>Report Configuration</CardTitle>
          <CardDescription>
            {selectedTypeConfig.requiresDateRange
              ? "Date range and format settings"
              : "Format settings (date range optional)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Start Date
                {selectedTypeConfig.requiresDateRange && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                End Date
                {selectedTypeConfig.requiresDateRange && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Format</label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((fmt) => (
                <Button
                  key={fmt.id}
                  variant={selectedFormat === fmt.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFormat(fmt.id)}
                  className="gap-2"
                >
                  {fmt.icon}
                  {fmt.label}
                </Button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full md:w-auto"
          >
            {generating ? (
              <>
                <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <DownloadIcon className="mr-2 h-4 w-4" />
                Generate Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Report History</CardTitle>
          <CardDescription>
            Recently generated risk reports. Status updates automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No reports generated yet. Use the form above to create your
              first report.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      {reportTypeLabel(record)}
                      {record.error_message ? (
                        <p className="text-destructive mt-0.5 text-xs">
                          {record.error_message}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {record.format}
                      </Badge>
                    </TableCell>
                    <TableCell>{statusBadge(record.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(record.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {record.status === "complete" ? (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={reportDownloadUrl(record.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <DownloadIcon className="mr-1.5 h-3.5 w-3.5" />
                            Download
                          </a>
                        </Button>
                      ) : record.status === "failed" ? (
                        <span className="text-destructive text-xs">
                          Failed
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Processing...
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
