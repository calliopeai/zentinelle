import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenuItem,
  DropdownMenuSeparator,
  PageFrame,
  Select,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { FileCheckIcon, PlusIcon } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";

import type { ContentRuleData } from "@/graphql/content-rules/types";

import {
  ANY,
  fromSelectValue,
  toSelectValue,
} from "../../../shared/select-any";
import { FilterBar } from "../../../shared/FilterBar";
import { useListController } from "../../../shared/list-controller";
import { accessOf } from "../access";
import { areaCrumb, rulesTabs } from "../frame";
import { SEVERITY_TONE, usePolicyLabels } from "../labels";
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
  const t = useTranslations("policies.contentRulesScreen");
  const { SEVERITY_OPTIONS, RULE_TYPE_OPTIONS, tabs } = usePolicyLabels();
  const { canEdit } = accessOf(capabilities);
  const [deleting, setDeleting] = React.useState<ContentRuleData | null>(null);
  const controller = useListController({
    rows: rules,
    loading,
    error,
    onRetry,
    search,
    onSearchChange,
    isFiltered: Boolean(search || ruleType || severity),
    clearFilters: () => {
      onSearchChange("");
      onRuleTypeChange("");
      onSeverityChange("");
    },
  });

  const columns: Column<ContentRuleData>[] = [
    {
      id: "name",
      header: t("rule"),
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
      header: t("severity"),
      width: "w-28",
      cell: (r) => (
        <StatusBadge tone={SEVERITY_TONE[r.severity] ?? "muted"}>
          {r.severityDisplay ?? r.severity}
        </StatusBadge>
      ),
    },
    {
      id: "action",
      header: t("onMatch"),
      width: "w-28",
      cell: (r) => r.actionDisplay ?? r.action,
    },
    { id: "where", header: t("scans"), width: "w-36", cell: where },
    {
      id: "status",
      header: t("status"),
      width: "w-32",
      cell: (r) => (
        <PolicyStatus enabled={r.enabled} enforcement={r.enforcement} />
      ),
    },
    {
      id: "hits",
      header: t("detections"),
      width: "w-28",
      align: "right",
      cell: (r) => (
        <span className="font-mono tabular-nums">
          {r.violationCount == null
            ? t("none")
            : r.violationCount.toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "content-rules")]}
      title={t("contentRules")}
      description={t("patternsTheScannerChecksIn")}
      tabs={rulesTabs("rules", tabs.rules)}
      tabsLabel={t("contentRules")}
      primaryAction={
        canEdit ? (
          <Button size="sm" onClick={() => onOpenRule(null)}>
            <PlusIcon aria-hidden /> New rule
          </Button>
        ) : undefined
      }
    >
      <DataTable
        label={t("contentRules")}
        controller={controller}
        columns={columns}
        getRowId={(r) => r.id}
        onRowActivate={(r) => onOpenRule(r)}
        rowLabel={(r) => r.name}
        searchPlaceholder={t("searchRules")}
        toolbar={
          <FilterBar label={t("ruleFilters")}>
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
            <Select
              aria-label={t("severity")}
              options={SEVERITY_OPTIONS}
              value={toSelectValue(severity)}
              onValueChange={(v) => onSeverityChange(fromSelectValue(v))}
              className="w-36"
            />
          </FilterBar>
        }
        empty={{
          icon: <FileCheckIcon />,
          title: t("noContentRulesYet"),
          description: canEdit
            ? t("startWithSecretsAndPersonal")
            : t("anOperatorOrAdministratorAdds"),
        }}
        emptyFiltered={{
          title: t("noRulesMatch"),
          description: t("tryAnotherTypeOrSeverity"),
        }}
        rowActions={(r) => (
          <>
            <DropdownMenuItem onSelect={() => onTest(r)}>
              {t("testOnSampleText")}
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuItem onSelect={() => void onToggleEnabled(r)}>
                  {r.enabled ? t("turnOff") : t("turnOn")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void onDuplicate(r)}>
                  {t("duplicate")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleting(r)}
                >
                  {t("delete")}
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
        description={t("theScannerStopsCheckingFor")}
        confirmLabel={t("deleteRule")}
        destructive
        onConfirm={() => (deleting ? onDelete(deleting) : undefined)}
      />
    </PageFrame>
  );
}
