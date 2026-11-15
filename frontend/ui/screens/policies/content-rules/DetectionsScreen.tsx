import {
  Button,
  DataTable,
  PageFrame,
  Select,
  Stat,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { DownloadIcon, RadarIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type {
  ContentScanData,
  ContentViolationData,
} from "@/graphql/content-scanner/types";

import {
  ANY,
  fromSelectValue,
  toSelectValue,
} from "../../../shared/select-any";
import { FilterBar } from "../../../shared/FilterBar";
import { useListController } from "../../../shared/list-controller";
import { areaCrumb, rulesTabs } from "../frame";
import { SEVERITY_TONE, usePolicyLabels } from "../labels";

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

const windows = (t: (key: string) => string) => [
  { value: "1", label: t("last24Hours") },
  { value: "7", label: t("last7Days") },
  { value: "30", label: t("last30Days") },
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
  const t = useTranslations("policies.detectionsScreen");
  const { SEVERITY_OPTIONS, RULE_TYPE_OPTIONS, formatDateTime, tabs } =
    usePolicyLabels();
  const filtered = Boolean(severity || ruleType);
  const controller = useListController({
    rows: violations,
    loading,
    error,
    onRetry,
    isFiltered: filtered,
    clearFilters: () => {
      onSeverityChange("");
      onRuleTypeChange("");
    },
  });
  const flagged = scans.filter((s) => s.hasViolations).length;
  const columns: Column<ContentViolationData>[] = [
    {
      id: "when",
      header: t("when"),
      width: "w-40",
      cell: (v) => formatDateTime(v.createdAt),
    },
    {
      id: "rule",
      header: t("rule"),
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
      header: t("matched"),
      cell: (v) => (
        <code className="line-clamp-2 block max-w-xs font-mono text-xs [overflow-wrap:anywhere]">
          {v.matchedText ?? t("notKept")}
        </code>
      ),
    },
    {
      id: "severity",
      header: t("severity"),
      width: "w-28",
      cell: (v) => (
        <StatusBadge tone={SEVERITY_TONE[v.severity] ?? "muted"}>
          {v.severityDisplay ?? v.severity}
        </StatusBadge>
      ),
    },
    { id: "outcome", header: t("outcome"), width: "w-28", cell: outcome },
  ];
  const ready = !loading && !error;
  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "content-rules")]}
      title={t("contentRules")}
      tabs={rulesTabs("detections", tabs.rules)}
      tabsLabel={t("contentRules")}
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
          <Stat
            label={t("detections")}
            value={violations.length.toLocaleString()}
          />
          <Stat
            label={t("blocked")}
            value={violations
              .filter((v) => v.wasBlocked)
              .length.toLocaleString()}
          />
          <Stat
            label={t("redacted")}
            value={violations
              .filter((v) => v.wasRedacted)
              .length.toLocaleString()}
          />
          <Stat
            label={t("scansFlagged")}
            value={flagged.toLocaleString()}
            hint={t("ofScanned", { count: scans.length.toLocaleString() })}
          />
        </div>
      )}
      <DataTable
        label={t("detections")}
        controller={controller}
        columns={columns}
        getRowId={(v) => v.id}
        toolbar={
          <FilterBar label={t("detectionFilters")}>
            <Select
              aria-label={t("window")}
              options={windows(t)}
              value={window}
              onValueChange={(v) => onWindowChange(v as DetectionWindow)}
              className="w-36"
            />
            <Select
              aria-label={t("severity")}
              options={SEVERITY_OPTIONS}
              value={toSelectValue(severity)}
              onValueChange={(v) => onSeverityChange(fromSelectValue(v))}
              className="w-36"
            />
            <Select
              aria-label={t("ruleType")}
              options={[
                { value: ANY, label: t("allTypes") },
                ...RULE_TYPE_OPTIONS,
              ]}
              value={toSelectValue(ruleType)}
              onValueChange={(v) => onRuleTypeChange(fromSelectValue(v))}
              className="w-48"
            />
          </FilterBar>
        }
        empty={{
          icon: <RadarIcon />,
          title: t("nothingDetectedInThisWindow"),
          description: t("theRulesRanAndMatched"),
          actionHref: "/content-rules",
          actionLabel: t("reviewTheRules"),
        }}
        emptyFiltered={{
          title: t("noDetectionsMatch"),
          description: t("tryAnotherSeverityOrType"),
        }}
      />
    </PageFrame>
  );
}
