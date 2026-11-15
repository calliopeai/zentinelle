import {
  Button,
  ConfirmDialog,
  DataTable,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  PageFrame,
  StatusBadge,
  type Column,
} from "@calliopelabs/ui";
import { GitPullRequestArrowIcon } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";

import { CodeBlock } from "../../shared/CodeBlock";
import { DefinitionList } from "./components/DefinitionList";
import { FilterBar } from "../../shared/FilterBar";
import { useListController } from "../../shared/list-controller";
import { Select } from "../../shared/Select";
import { accessOf } from "./access";
import { areaCrumb, workspaceTabs } from "./frame";
import {
  CHANGE_STATUS_TONE,
  CHANGE_TRANSITIONS,
  usePolicyLabels,
} from "./labels";
import type { PolicyChangeSet } from "./rest-types";

export interface PolicyChangesScreenProps {
  capabilities: readonly string[];
  /** REST `policy-changes`, newest first. */
  changes: readonly PolicyChangeSet[];
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  status: string;
  onStatusChange: (status: string) => void;
  /** The change set open in the drawer (`?change=`), or null. */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  /** REST `policy-changes/{id}/transition`. A rejection is the server's refusal, shown in place. */
  onTransition: (change: PolicyChangeSet, to: string) => Promise<unknown>;
}

function StatusPill({ status }: { status: string }) {
  const { changeStatusLabel } = usePolicyLabels();
  return (
    <StatusBadge
      tone={CHANGE_STATUS_TONE[status] ?? "muted"}
      struck={status === "rolled_back"}
    >
      {changeStatusLabel(status)}
    </StatusBadge>
  );
}

/**
 * Policies > Changes: staged policy change sets and their review. Operators
 * validate, stage and reject; approving, promoting and rolling back need an
 * administrator, as the transition endpoint enforces.
 */
export function PolicyChangesScreen({
  capabilities,
  changes,
  loading,
  error,
  onRetry,
  status,
  onStatusChange,
  openId,
  onOpenChange,
  onTransition,
}: PolicyChangesScreenProps) {
  const t = useTranslations("policies.policyChangesScreen");
  const { CHANGE_STATUS_OPTIONS, formatDateTime, tabs, transitionLabel } =
    usePolicyLabels();
  const { canEdit, canAdmin } = accessOf(capabilities);
  const [confirming, setConfirming] = React.useState<{
    change: PolicyChangeSet;
    to: string;
    label: string;
  } | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const controller = useListController({
    rows: changes,
    loading,
    error,
    onRetry,
    filtered: Boolean(status),
    onClearFilters: () => onStatusChange(""),
  });
  const open = changes.find((c) => c.id === openId) ?? null;

  const run = async (change: PolicyChangeSet, to: string) => {
    setFailure(null);
    setPending(true);
    try {
      await onTransition(change, to);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const columns: Column<PolicyChangeSet>[] = [
    {
      id: "title",
      header: t("change"),
      cell: (c) => (
        <div className="min-w-0 max-w-md">
          <div className="font-medium [overflow-wrap:anywhere]">{c.title}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {c.id.slice(0, 12)}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: t("status"),
      width: "w-32",
      cell: (c) => <StatusPill status={c.status} />,
    },
    {
      id: "by",
      header: t("proposedBy"),
      width: "w-48",
      cell: (c) => (
        <span className="[overflow-wrap:anywhere]">{c.created_by}</span>
      ),
    },
    {
      id: "updated",
      header: t("updated"),
      width: "w-40",
      cell: (c) => formatDateTime(c.updated_at),
    },
  ];

  const steps = open ? (CHANGE_TRANSITIONS[open.status] ?? []) : [];
  const allowed = steps.filter((s) => (s.admin ? canAdmin : canEdit));
  const held = steps.filter((s) => s.admin && !canAdmin && canEdit);

  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "policies")]}
      title={t("policies")}
      tabs={workspaceTabs("changes", tabs.workspace)}
      tabsLabel={t("policies")}
    >
      <DataTable
        label={t("policyChanges")}
        controller={controller}
        columns={columns}
        getRowId={(c) => c.id}
        onRowActivate={(c) => {
          setFailure(null);
          onOpenChange(c.id);
        }}
        rowLabel={(c) => `change ${c.title}`}
        toolbar={
          <FilterBar label={t("changeFilters")}>
            <Select
              aria-label={t("status")}
              options={CHANGE_STATUS_OPTIONS}
              value={status}
              onValueChange={onStatusChange}
              className="w-40"
            />
          </FilterBar>
        }
        empty={{
          icon: <GitPullRequestArrowIcon />,
          title: t("noPolicyChanges"),
          description: t("aChangeSetBundlesEdits"),
        }}
        emptyFiltered={{
          title: t("noChangesInThisStatus"),
          description: t("chooseAnotherStatusOrAll"),
        }}
      />
      <Drawer
        open={open !== null}
        onOpenChange={(o) => !o && onOpenChange(null)}
      >
        <DrawerContent className="sm:max-w-lg">
          {open && (
            <>
              <DrawerHeader>
                <DrawerTitle className="[overflow-wrap:anywhere]">
                  {open.title}
                </DrawerTitle>
                <DrawerDescription>
                  {open.description || t("noDescription")}
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
                <DefinitionList
                  items={[
                    {
                      term: t("status"),
                      description: <StatusPill status={open.status} />,
                    },
                    { term: t("proposedBy"), description: open.created_by },
                    {
                      term: t("reviewedBy"),
                      description: open.reviewed_by || t("notYet"),
                    },
                    {
                      term: t("approvedBy"),
                      description: open.approved_by || t("notYet"),
                    },
                    {
                      term: t("staged"),
                      description: formatDateTime(open.staged_at),
                    },
                    {
                      term: t("promoted"),
                      description: formatDateTime(open.promoted_at),
                    },
                  ]}
                />
                {(
                  [
                    [t("editsInThisChange"), open.changes, true],
                    [
                      "Validation",
                      open.validation,
                      Object.keys(open.validation).length > 0,
                    ],
                    [
                      "Targets",
                      open.target_selectors,
                      Object.keys(open.target_selectors).length > 0,
                    ],
                  ] as const
                )
                  .filter(([, , shown]) => shown)
                  .map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-1">
                      <h3 className="text-sm font-semibold">{label}</h3>
                      <CodeBlock label={label} value={value} maxHeight="sm" />
                    </div>
                  ))}
                {failure && (
                  <p
                    role="alert"
                    className="rounded-lg border border-danger-border bg-danger-bg p-2 text-sm text-danger-fg"
                  >
                    {failure}
                  </p>
                )}
                {held.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("needsAdmin", {
                      steps: held.map((s) => transitionLabel(s.to)).join(", "),
                    })}
                  </p>
                )}
              </div>
              {allowed.length > 0 && (
                <DrawerFooter className="flex-row flex-wrap justify-end gap-2">
                  {allowed.map((step) => (
                    <Button
                      key={step.to}
                      size="sm"
                      disabled={pending}
                      variant={step.destructive ? "outline" : "default"}
                      onClick={() =>
                        step.destructive
                          ? setConfirming({
                              change: open,
                              to: step.to,
                              label: transitionLabel(step.to),
                            })
                          : void run(open, step.to)
                      }
                    >
                      {transitionLabel(step.to)}
                    </Button>
                  ))}
                </DrawerFooter>
              )}
            </>
          )}
        </DrawerContent>
      </Drawer>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={t("confirmTitle", {
          step: confirming?.label ?? t("reject"),
          title: confirming?.change.title ?? t("thisChange"),
        })}
        description={
          confirming?.to === "rolled_back"
            ? t("everyPolicyInTheChange")
            : t("theChangeClosesAndCannot")
        }
        confirmLabel={confirming?.label}
        destructive
        onConfirm={() =>
          confirming
            ? onTransition(confirming.change, confirming.to)
            : undefined
        }
      />
    </PageFrame>
  );
}
