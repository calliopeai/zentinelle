"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  useComplianceReports,
  useGenerateComplianceReport,
} from "@/graphql/compliance-reports/hooks";
import type { ComplianceReportData } from "@/graphql/compliance-reports/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileBarChartIcon,
  FileTextIcon,
  FileJsonIcon,
  TableIcon,
  DownloadIcon,
  LoaderIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from "lucide-react";

/* ── Report type definitions ──────────────────────────────────── */

type ReportType = "full" | "framework" | "executive";
type Format = "pdf" | "csv" | "json";

interface FrameworkOption {
  value: string;
  label: string;
}

const FRAMEWORKS: FrameworkOption[] = [
  { value: "soc2", label: "SOC 2" },
  { value: "gdpr", label: "GDPR" },
  { value: "hipaa", label: "HIPAA" },
  { value: "eu_ai_act", label: "EU AI Act" },
  { value: "nist_ai_rmf", label: "NIST AI RMF" },
  { value: "iso_42001", label: "ISO 42001" },
];

const FORMAT_ICONS: Record<Format, typeof FileTextIcon> = {
  pdf: FileTextIcon,
  csv: TableIcon,
  json: FileJsonIcon,
};

/* ── Status helpers ───────────────────────────────────────────── */

function statusVariant(status: string | null) {
  switch (status) {
    case "completed":
    case "ready":
      return "default";
    case "generating":
    case "running":
    case "pending":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function statusIcon(status: string | null) {
  switch (status) {
    case "completed":
    case "ready":
      return CheckCircleIcon;
    case "generating":
    case "running":
    case "pending":
      return ClockIcon;
    case "failed":
      return XCircleIcon;
    default:
      return ClockIcon;
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Mock report history ──────────────────────────────────────── */

function generateMockReports(): ComplianceReportData[] {
  const now = Date.now();
  return [
    {
      id: "mock-1",
      name: "Full Compliance Assessment",
      framework: "all",
      generatedAt: new Date(now - 2 * 86400000).toISOString(),
      period: "manual",
      status: "completed",
      downloadUrl: "/api/zentinelle/v1/export/summary.json",
    },
    {
      id: "mock-2",
      name: "SOC 2 Framework Report",
      framework: "soc2",
      generatedAt: new Date(now - 5 * 86400000).toISOString(),
      period: "manual",
      status: "completed",
      downloadUrl: "/api/zentinelle/v1/export/summary.json?framework=soc2",
    },
    {
      id: "mock-3",
      name: "GDPR Compliance Report",
      framework: "gdpr",
      generatedAt: new Date(now - 7 * 86400000).toISOString(),
      period: "manual",
      status: "completed",
      downloadUrl: "/api/zentinelle/v1/export/summary.json?framework=gdpr",
    },
    {
      id: "mock-4",
      name: "Executive Summary",
      framework: "all",
      generatedAt: new Date(now - 1 * 86400000).toISOString(),
      period: "manual",
      status: "generating",
      downloadUrl: null,
    },
    {
      id: "mock-5",
      name: "HIPAA Assessment",
      framework: "hipaa",
      generatedAt: new Date(now - 14 * 86400000).toISOString(),
      period: "manual",
      status: "failed",
      downloadUrl: null,
    },
  ];
}

/* ── Main page ─────────────────────────────────────────────────── */

export default function ComplianceReportsPage() {
  const { reports, loading, refetch } = useComplianceReports();
  const { generateReport, loading: generating } = useGenerateComplianceReport();

  // Form state
  const [reportType, setReportType] = useState<ReportType>("full");
  const [framework, setFramework] = useState<string>("soc2");
  const [format, setFormat] = useState<Format>("pdf");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Use real data or mock
  const hasRealData = reports.length > 0;
  const displayReports = hasRealData ? reports : generateMockReports();

  const handleGenerate = async () => {
    const vars: Record<string, string | null> = {
      framework: reportType === "framework" ? framework : null,
      startDate: startDate || null,
      endDate: endDate || null,
    };

    try {
      const { data } = await generateReport({ variables: vars });
      if (data?.generateComplianceReport?.success) {
        toast.success("Report generation started", {
          description: "You will be notified when the report is ready for download.",
        });
        refetch();
      } else {
        const err =
          data?.generateComplianceReport?.errors?.[0] ??
          "Failed to generate report";
        toast.error("Report generation failed", { description: err });
      }
    } catch {
      toast.error("Report generation failed", {
        description: "An unexpected error occurred. Please try again.",
      });
    }
  };

  const reportTypeName = useMemo(() => {
    switch (reportType) {
      case "full":
        return "Full Assessment";
      case "framework":
        return `${FRAMEWORKS.find((f) => f.value === framework)?.label ?? framework} Report`;
      case "executive":
        return "Executive Summary";
    }
  }, [reportType, framework]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Compliance Reports</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Generate and download compliance assessment reports
        </p>
      </div>

      {!hasRealData && (
        <div className="bg-muted/50 rounded-lg border border-dashed px-4 py-2 text-center text-sm">
          <span className="text-muted-foreground">
            Showing sample report history. Generate a report to see real data.
          </span>
        </div>
      )}

      {/* Generator form */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Generate Report</CardTitle>
            <CardDescription>
              Configure and generate a new compliance report
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Report type */}
            <div className="space-y-2">
              <Label>Report Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: "full", label: "Full Assessment", desc: "All frameworks" },
                    { value: "framework", label: "Framework-Specific", desc: "Single framework" },
                    { value: "executive", label: "Executive Summary", desc: "High-level overview" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setReportType(opt.value)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      reportType === opt.value
                        ? "border-primary bg-primary/5 ring-primary/20 ring-2"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-muted-foreground text-xs">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Framework selector - only visible for framework-specific */}
            {reportType === "framework" && (
              <div className="space-y-2">
                <Label>Framework</Label>
                <Select value={framework} onValueChange={setFramework}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAMEWORKS.map((fw) => (
                      <SelectItem key={fw.value} value={fw.value}>
                        {fw.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Format selector */}
            <div className="space-y-2">
              <Label>Format</Label>
              <div className="flex gap-2">
                {(["pdf", "csv", "json"] as const).map((f) => {
                  const FormatIcon = FORMAT_ICONS[f];
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        format === f
                          ? "border-primary bg-primary/5 ring-primary/20 ring-2"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <FormatIcon className="h-4 w-4" />
                      {f.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generate button */}
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full"
            >
              {generating ? (
                <>
                  <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileBarChartIcon className="mr-2 h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Preview card */}
        <Card>
          <CardHeader>
            <CardTitle>Report Preview</CardTitle>
            <CardDescription>Summary of report configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Report Name
              </p>
              <p className="mt-1 text-sm font-medium">{reportTypeName}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Date Range
              </p>
              <p className="mt-1 text-sm">
                {startDate && endDate
                  ? `${startDate} to ${endDate}`
                  : startDate
                    ? `From ${startDate}`
                    : endDate
                      ? `Until ${endDate}`
                      : "All available data"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Format
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                {(() => {
                  const FIcon = FORMAT_ICONS[format];
                  return <FIcon className="text-muted-foreground h-4 w-4" />;
                })()}
                <span className="text-sm">{format.toUpperCase()}</span>
              </div>
            </div>
            {reportType === "framework" && (
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Framework
                </p>
                <p className="mt-1 text-sm">
                  {FRAMEWORKS.find((f) => f.value === framework)?.label ?? framework}
                </p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Contents
              </p>
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {reportType === "full" && (
                  <>
                    <li>- Framework coverage analysis</li>
                    <li>- Control assessment details</li>
                    <li>- Gap identification</li>
                    <li>- Remediation recommendations</li>
                  </>
                )}
                {reportType === "framework" && (
                  <>
                    <li>- Control-by-control assessment</li>
                    <li>- Evidence mapping</li>
                    <li>- Compliance gaps</li>
                  </>
                )}
                {reportType === "executive" && (
                  <>
                    <li>- Compliance score summary</li>
                    <li>- Risk posture overview</li>
                    <li>- Key findings</li>
                  </>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report history */}
      <Card>
        <CardHeader>
          <CardTitle>Report History</CardTitle>
          <CardDescription>
            Previously generated compliance reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayReports.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No reports generated yet. Use the form above to create your first report.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Framework</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayReports.map((report) => {
                  const StatusIcon = statusIcon(report.status);
                  return (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        {report.name ?? "Compliance Report"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {report.framework === "all"
                            ? "All Frameworks"
                            : FRAMEWORKS.find((f) => f.value === report.framework)
                                ?.label ?? report.framework}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant(report.status)}
                          className="gap-1"
                        >
                          <StatusIcon className="h-3 w-3" />
                          {report.status ?? "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(report.generatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {report.downloadUrl &&
                        (report.status === "completed" ||
                          report.status === "ready") ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a
                              href={report.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <DownloadIcon className="mr-1.5 h-3.5 w-3.5" />
                              Download
                            </a>
                          </Button>
                        ) : report.status === "generating" ||
                          report.status === "running" ||
                          report.status === "pending" ? (
                          <span className="text-muted-foreground text-xs">
                            Processing...
                          </span>
                        ) : report.status === "failed" ? (
                          <span className="text-destructive text-xs">
                            Failed
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
