import {
  Button,
  DataTable,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { DownloadIcon, RadarIcon } from "lucide-react";

import type {
  ContentScanData,
  ContentViolationData,
} from "@/graphql/content-scanner/types";

import { FilterBar } from "../../../shared/FilterBar";
import { useListController } from "../../../shared/list-controller";
import { Select } from "../../../shared/Select";
import { StatTile } from "../components/StatTile";
import { areaCrumb, rulesTabs } from "../frame";
import {
  RULE_TYPE_OPTIONS,
  SEVERITY_OPTIONS,
  SEVERITY_TONE,
  formatDateTime,
} from "../labels";

export type DetectionWindow = "1" | "7" | "30";

export interface DetectionsScreenProps {
  capabilities: readonly string[];
  /** `GetContentViolations`, with `startDate` from the window and the filters below. */
  violations: readonly ContentViolationData[];
  /** `GetContentScans` over the same window, for the scanned-versus-flagged figure. */
  scans: readonly ContentScanData[];
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  window: DetectionWindow;
  onWindowChange: (window: DetectionWindow) => void;
  severity: string;
  onSeverityChange: (severity: string) => void;
  ruleType: string;
  onRuleTypeChange: (ruleType: string) => void;
  /** REST `export/violations.csv` with the active filters. */
  exportHref: string;
}

const WINDOWS = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

function outcome(v: ContentViolationData) {
  if (v.wasBlocked) return <StatusBadge tone="error">blocked</StatusBadge>;
  if (v.wasRedacted) return <StatusBadge tone="warn">redacted</StatusBadge>;
  return <StatusBadge tone="muted">recorded</StatusBadge>;
}

/** Content rules > Detections: what the rules caught, with the outcome, over a window. */
export function DetectionsScreen({
  capabilities,
  violations,
  scans,
  loading,
  error,
  onRetry,
  window,
  onWindowChange,
  severity,
  onSeverityChange,
  ruleType,
  onRuleTypeChange,
  exportHref,
}: DetectionsScreenProps) {
  const filtered = Boolean(severity || ruleType);
  const controller = useListController({
    rows: violations,
    loading,
    error,
    onRetry,
    filtered,
    onClearFilters: () => {
      onSeverityChange("");
      onRuleTypeChange("");
    },
  });
  const flagged = scans.filter((s) => s.hasViolations).length;
  const columns: Column<ContentViolationData>[] = [
    {
      id: "when",
      header: "When",
      width: "w-40",
      cell: (v) => formatDateTime(v.createdAt),
    },
    {
      id: "rule",
      header: "Rule",
      cell: (v) => (
        <div className="min-w-0 max-w-xs">
          <div className="font-medium [overflow-wrap:anywhere]">
            {v.ruleName ?? v.ruleTypeDisplay ?? v.ruleType}
          </div>
          {v.category && (
            <div className="font-mono text-xs text-muted-foreground">
              {v.category}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "match",
      header: "Matched",
      cell: (v) => (
        <code className="line-clamp-2 block max-w-xs font-mono text-xs [overflow-wrap:anywhere]">
          {v.matchedText ?? "Not kept"}
        </code>
      ),
    },
    {
      id: "severity",
      header: "Severity",
      width: "w-28",
      cell: (v) => (
        <StatusBadge tone={SEVERITY_TONE[v.severity] ?? "muted"}>
          {v.severityDisplay ?? v.severity}
        </StatusBadge>
      ),
    },
    { id: "outcome", header: "Outcome", width: "w-28", cell: outcome },
  ];
  const ready = !loading && !error;
  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "content-rules")]}
      title="Content rules"
      tabs={rulesTabs("detections")}
      tabsLabel="Content rules"
      primaryAction={
        <Button asChild size="sm" variant="outline">
          <a href={exportHref} download>
            <DownloadIcon aria-hidden /> Export CSV
          </a>
        </Button>
      }
    >
      {ready && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label="Detections"
            value={violations.length.toLocaleString()}
          />
          <StatTile
            label="Blocked"
            value={violations
              .filter((v) => v.wasBlocked)
              .length.toLocaleString()}
          />
          <StatTile
            label="Redacted"
            value={violations
              .filter((v) => v.wasRedacted)
              .length.toLocaleString()}
          />
          <StatTile
            label="Scans flagged"
            value={flagged.toLocaleString()}
            hint={`of ${scans.length.toLocaleString()} scanned`}
          />
        </div>
      )}
      <DataTable
        label="Detections"
        controller={controller}
        columns={columns}
        getRowId={(v) => v.id}
        toolbar={
          <FilterBar label="Detection filters">
            <Select
              aria-label="Window"
              options={WINDOWS}
              value={window}
              onValueChange={(v) => onWindowChange(v as DetectionWindow)}
              className="w-36"
            />
            <Select
              aria-label="Severity"
              options={SEVERITY_OPTIONS}
              value={severity}
              onValueChange={onSeverityChange}
              className="w-36"
            />
            <Select
              aria-label="Rule type"
              options={[
                { value: "", label: "All types" },
                ...RULE_TYPE_OPTIONS,
              ]}
              value={ruleType}
              onValueChange={onRuleTypeChange}
              className="w-48"
            />
          </FilterBar>
        }
        empty={{
          icon: <RadarIcon />,
          title: "Nothing detected in this window",
          description:
            "The rules ran and matched nothing. Widen the window, or check that the rules you expect are on.",
          actionHref: "/content-rules",
          actionLabel: "Review the rules",
        }}
        emptyFiltered={{
          title: "No detections match",
          description: "Try another severity or type, or a wider window.",
        }}
      />
    </PageFrame>
  );
}
