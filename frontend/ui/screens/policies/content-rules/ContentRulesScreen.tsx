import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenuItem,
  DropdownMenuSeparator,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { FileCheckIcon, PlusIcon } from "lucide-react";
import * as React from "react";

import type { ContentRuleData } from "@/graphql/content-rules/types";

import { FilterBar } from "../../../shared/FilterBar";
import { useListController } from "../../../shared/list-controller";
import { Select } from "../../../shared/Select";
import { accessOf } from "../access";
import { areaCrumb, rulesTabs } from "../frame";
import { RULE_TYPE_OPTIONS, SEVERITY_OPTIONS, SEVERITY_TONE } from "../labels";
import { PolicyStatus } from "../PolicyStatus";

export interface ContentRulesScreenProps {
  capabilities: readonly string[];
  /** `GetContentRules` with the search and filters below as its variables. */
  rules: readonly ContentRuleData[];
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  ruleType: string;
  onRuleTypeChange: (ruleType: string) => void;
  severity: string;
  onSeverityChange: (severity: string) => void;
  /** Opens the rule drawer: a rule to edit (or read, for a viewer), or null for a new one. */
  onOpenRule: (rule: ContentRuleData | null) => void;
  onTest: (rule: ContentRuleData) => void;
  onToggleEnabled: (rule: ContentRuleData) => Promise<unknown> | void;
  onDuplicate: (rule: ContentRuleData) => Promise<unknown> | void;
  onDelete: (rule: ContentRuleData) => Promise<unknown>;
}

function where(rule: ContentRuleData) {
  return (
    [
      rule.scanInput && "prompts",
      rule.scanOutput && "answers",
      rule.scanContext && "context",
    ]
      .filter(Boolean)
      .join(", ") || "nothing"
  );
}

/** Content rules > Rules: what the scanner looks for in prompts and answers, and what it does on a match. */
export function ContentRulesScreen({
  capabilities,
  rules,
  loading,
  error,
  onRetry,
  search,
  onSearchChange,
  ruleType,
  onRuleTypeChange,
  severity,
  onSeverityChange,
  onOpenRule,
  onTest,
  onToggleEnabled,
  onDuplicate,
  onDelete,
}: ContentRulesScreenProps) {
  const { canEdit } = accessOf(capabilities);
  const [deleting, setDeleting] = React.useState<ContentRuleData | null>(null);
  const controller = useListController({
    rows: rules,
    loading,
    error,
    onRetry,
    search,
    onSearchChange,
    filtered: Boolean(search || ruleType || severity),
    onClearFilters: () => {
      onSearchChange("");
      onRuleTypeChange("");
      onSeverityChange("");
    },
  });

  const columns: Column<ContentRuleData>[] = [
    {
      id: "name",
      header: "Rule",
      cell: (r) => (
        <div className="min-w-0 max-w-md">
          <div className="font-medium [overflow-wrap:anywhere]">{r.name}</div>
          <div className="text-xs text-muted-foreground">
            {r.ruleTypeDisplay ?? r.ruleType}
          </div>
        </div>
      ),
    },
    {
      id: "severity",
      header: "Severity",
      width: "w-28",
      cell: (r) => (
        <StatusBadge tone={SEVERITY_TONE[r.severity] ?? "muted"}>
          {r.severityDisplay ?? r.severity}
        </StatusBadge>
      ),
    },
    {
      id: "action",
      header: "On match",
      width: "w-28",
      cell: (r) => r.actionDisplay ?? r.action,
    },
    { id: "where", header: "Scans", width: "w-36", cell: where },
    {
      id: "status",
      header: "Status",
      width: "w-32",
      cell: (r) => (
        <PolicyStatus enabled={r.enabled} enforcement={r.enforcement} />
      ),
    },
    {
      id: "hits",
      header: "Detections",
      width: "w-28",
      align: "right",
      cell: (r) => (
        <span className="font-mono tabular-nums">
          {r.violationCount == null
            ? "None"
            : r.violationCount.toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "content-rules")]}
      title="Content rules"
      description="Patterns the scanner checks in prompts, answers and context: secrets, personal data, injection attempts."
      tabs={rulesTabs("rules")}
      tabsLabel="Content rules"
      primaryAction={
        canEdit ? (
          <Button size="sm" onClick={() => onOpenRule(null)}>
            <PlusIcon aria-hidden /> New rule
          </Button>
        ) : undefined
      }
    >
      <DataTable
        label="Content rules"
        controller={controller}
        columns={columns}
        getRowId={(r) => r.id}
        onRowActivate={(r) => onOpenRule(r)}
        rowLabel={(r) => r.name}
        searchPlaceholder="Search rules"
        toolbar={
          <FilterBar label="Rule filters">
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
            <Select
              aria-label="Severity"
              options={SEVERITY_OPTIONS}
              value={severity}
              onValueChange={onSeverityChange}
              className="w-36"
            />
          </FilterBar>
        }
        empty={{
          icon: <FileCheckIcon />,
          title: "No content rules yet",
          description: canEdit
            ? "Start with secrets and personal data: the two leaks that cost the most."
            : "An operator or administrator adds content rules. They show here once they exist.",
        }}
        emptyFiltered={{
          title: "No rules match",
          description: "Try another type or severity, or clear the search.",
        }}
        rowActions={(r) => (
          <>
            <DropdownMenuItem onSelect={() => onTest(r)}>
              Test on sample text
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuItem onSelect={() => void onToggleEnabled(r)}>
                  {r.enabled ? "Turn off" : "Turn on"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void onDuplicate(r)}>
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleting(r)}
                >
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this rule"}?`}
        description="The scanner stops checking for it at once. Detections it already made stay in Detections and the audit log."
        confirmLabel="Delete rule"
        destructive
        onConfirm={() => (deleting ? onDelete(deleting) : undefined)}
      />
    </PageFrame>
  );
}
