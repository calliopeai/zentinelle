"use client";

import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenuItem,
  PageFrame,
  StatusBadge,
  useUI,
  type Column,
  type TabNavItem,
} from "@calliopelabs/ui";
import { ArchiveIcon, ScaleIcon } from "lucide-react";
import * as React from "react";

import { Select, type SelectOption } from "./components/FormField";
import { listController } from "./components/list-controller";
import { SwitchField } from "../../shared/SwitchField";
import { LegalHoldDialog } from "./LegalHoldDialog";
import {
  COMPLIANCE_REQUIREMENTS,
  EXPIRATION_ACTIONS,
  HOLD_TONE,
  RETENTION_ENTITY_TYPES,
  formatDay,
  holdScope,
  labelOf,
  settingsCrumbs,
  type LegalHold,
  type LegalHoldInput,
  type Loadable,
  type RetentionPolicy,
  type RetentionPolicyInput,
} from "./model";
import { RetentionPolicyDialog } from "./RetentionPolicyDialog";

export type RetentionTab = "policies" | "legal-holds";

export interface RetentionPolicyActions {
  onSave: (
    input: RetentionPolicyInput,
    policy: RetentionPolicy | null,
  ) => Promise<void>;
  onToggle: (policy: RetentionPolicy, enabled: boolean) => Promise<void>;
  onDelete: (policy: RetentionPolicy) => Promise<void>;
}

export interface LegalHoldActions {
  onCreate: (input: LegalHoldInput) => Promise<void>;
  onRelease: (hold: LegalHold) => Promise<void>;
  onDelete: (hold: LegalHold) => Promise<void>;
}

export interface HoldFilters {
  holdType: string;
  status: string;
}

export interface RetentionScreenProps {
  tab: RetentionTab;
  /** RetentionData.retentionPolicies; read on Policies. */
  policies: Loadable<readonly RetentionPolicy[]>;
  /** Active holds, from RetentionData.legalHolds: they keep data past any policy. */
  activeHolds?: number;
  policyActions: RetentionPolicyActions;
  /** LegalHolds(holdType, status); read on Legal holds. */
  holds: Loadable<readonly LegalHold[]>;
  /** LegalHoldOptions. */
  holdTypes: readonly SelectOption[];
  holdStatuses: readonly SelectOption[];
  filters: HoldFilters;
  onFiltersChange: (filters: HoldFilters) => void;
  holdActions: LegalHoldActions;
}

function tabs(active: RetentionTab): TabNavItem[] {
  return [
    {
      key: "policies",
      label: "Policies",
      href: "/settings/retention",
      active: active === "policies",
    },
    {
      key: "legal-holds",
      label: "Legal holds",
      href: "/settings/retention/legal-holds",
      active: active === "legal-holds",
    },
  ];
}

function PoliciesTab({
  policies,
  actions,
  editing,
  setEditing,
}: {
  policies: RetentionScreenProps["policies"];
  actions: RetentionPolicyActions;
  editing: RetentionPolicy | null | undefined;
  setEditing: (policy: RetentionPolicy | null | undefined) => void;
}) {
  const [deleting, setDeleting] = React.useState<RetentionPolicy | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);
  const columns: Column<RetentionPolicy>[] = [
    {
      id: "name",
      header: "Policy",
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.name}</p>
          {p.description && (
            <p className="truncate text-xs text-muted-foreground">
              {p.description}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "data",
      header: "Data",
      width: "w-40",
      cell: (p) =>
        labelOf(RETENTION_ENTITY_TYPES, p.entityType, p.entityTypeDisplay),
    },
    {
      id: "kept",
      header: "Kept for",
      width: "w-32",
      align: "right",
      cell: (p) => (
        <span className="font-mono text-xs">
          {p.retentionDays} days
          {p.minimumRetentionDays ? (
            <span className="block text-muted-foreground">
              min {p.minimumRetentionDays}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "then",
      header: "Then",
      width: "w-40",
      cell: (p) =>
        labelOf(
          EXPIRATION_ACTIONS,
          p.expirationAction,
          p.expirationActionDisplay,
        ),
    },
    {
      id: "requirement",
      header: "Requirement",
      width: "w-40",
      cell: (p) =>
        labelOf(
          COMPLIANCE_REQUIREMENTS,
          p.complianceRequirement,
          p.complianceRequirementDisplay,
        ),
    },
    {
      id: "enabled",
      header: "Enabled",
      width: "w-24",
      cell: (p) => (
        <SwitchField
          label={<span className="sr-only">Enable {p.name}</span>}
          checked={p.enabled}
          className="py-0"
          onCheckedChange={async (enabled) => {
            setToggleError(null);
            try {
              await actions.onToggle(p, enabled);
            } catch (failure) {
              setToggleError(
                failure instanceof Error
                  ? failure.message
                  : `Could not change ${p.name}.`,
              );
            }
          }}
        />
      ),
    },
  ];
  return (
    <>
      {toggleError && (
        <p role="alert" className="mb-2 text-xs text-danger">
          {toggleError}
        </p>
      )}
      <DataTable
        label="Retention policies"
        controller={listController({
          rows: policies.data,
          loading: policies.loading,
          error: policies.error,
          retry: policies.retry,
        })}
        columns={columns}
        getRowId={(p) => p.id}
        onRowActivate={(p) => setEditing(p)}
        rowLabel={(p) => `policy ${p.name}`}
        empty={{
          icon: <ArchiveIcon aria-hidden className="size-6" />,
          title: "No retention policies",
          description:
            "Without one, Zentinelle AI keeps every record until it is deleted by hand.",
        }}
        rowActions={(p) => (
          <>
            <DropdownMenuItem onSelect={() => setEditing(p)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleting(p)}
            >
              Delete
            </DropdownMenuItem>
          </>
        )}
      />
      <RetentionPolicyDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        policy={editing}
        onSave={(input) => actions.onSave(input, editing ?? null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        destructive
        title={`Delete ${deleting?.name}?`}
        description="Data it covers falls to the next policy by priority, or is kept until deleted by hand. Nothing is deleted now."
        confirmLabel="Delete policy"
        onConfirm={() => deleting && actions.onDelete(deleting)}
      />
    </>
  );
}

function HoldsTab({
  holds,
  holdTypes,
  holdStatuses,
  filters,
  onFiltersChange,
  actions,
}: Pick<
  RetentionScreenProps,
  "holds" | "holdTypes" | "holdStatuses" | "filters" | "onFiltersChange"
> & {
  actions: LegalHoldActions;
}) {
  const [confirm, setConfirm] = React.useState<{
    hold: LegalHold;
    action: "release" | "delete";
  } | null>(null);
  const filtered = filters.holdType !== "" || filters.status !== "";
  const columns: Column<LegalHold>[] = [
    {
      id: "name",
      header: "Hold",
      cell: (h) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{h.name}</p>
          {h.referenceNumber && (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {h.referenceNumber}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      width: "w-32",
      cell: (h) => h.holdTypeDisplay ?? h.holdType,
    },
    {
      id: "scope",
      header: "Covers",
      width: "w-48",
      cell: (h) => <span className="text-xs">{holdScope(h)}</span>,
    },
    {
      id: "status",
      header: "Status",
      width: "w-28",
      cell: (h) => (
        <StatusBadge tone={HOLD_TONE[h.status] ?? "muted"}>
          {h.statusDisplay ?? h.status}
        </StatusBadge>
      ),
    },
    {
      id: "dates",
      header: "In force",
      width: "w-48",
      cell: (h) => (
        <span className="text-xs">
          {formatDay(h.effectiveDate)} to{" "}
          {h.releasedAt
            ? formatDay(h.releasedAt)
            : h.expirationDate
              ? formatDay(h.expirationDate)
              : "release"}
        </span>
      ),
    },
    {
      id: "custodian",
      header: "Custodian",
      width: "w-48",
      cell: (h) => (
        <span className="text-xs [overflow-wrap:anywhere]">
          {h.custodianEmail ?? "None"}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        label="Legal holds"
        controller={listController({
          rows: holds.data,
          loading: holds.loading,
          error: holds.error,
          retry: holds.retry,
          isFiltered: filtered,
          clearFilters: () => onFiltersChange({ holdType: "", status: "" }),
        })}
        columns={columns}
        getRowId={(h) => h.id}
        rowLabel={(h) => `hold ${h.name}`}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Hold type"
              className="w-40"
              options={[{ value: "", label: "All types" }, ...holdTypes]}
              value={filters.holdType}
              onChange={(e) =>
                onFiltersChange({ ...filters, holdType: e.target.value })
              }
            />
            <Select
              aria-label="Hold status"
              className="w-36"
              options={[{ value: "", label: "All statuses" }, ...holdStatuses]}
              value={filters.status}
              onChange={(e) =>
                onFiltersChange({ ...filters, status: e.target.value })
              }
            />
          </div>
        }
        empty={{
          icon: <ScaleIcon aria-hidden className="size-6" />,
          title: "No legal holds",
          description:
            "Place a hold when litigation, an audit or an investigation needs data kept past its retention period.",
        }}
        emptyFiltered={{
          title: "No hold matches these filters",
          description: "Clear the filters to see every hold.",
        }}
        rowActions={(h) => (
          <>
            {h.status === "active" && (
              <DropdownMenuItem
                onSelect={() => setConfirm({ hold: h, action: "release" })}
              >
                Release
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirm({ hold: h, action: "delete" })}
            >
              Delete
            </DropdownMenuItem>
          </>
        )}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        destructive
        title={
          confirm?.action === "release"
            ? `Release ${confirm.hold.name}?`
            : `Delete ${confirm?.hold.name}?`
        }
        description={
          confirm?.action === "release"
            ? "Retention policies apply again to the data it held, so data past its period can be deleted on the next run. The hold stays on record as released."
            : "The hold leaves the record entirely. Release it instead to keep the history."
        }
        confirmLabel={
          confirm?.action === "release" ? "Release hold" : "Delete hold"
        }
        onConfirm={() =>
          confirm &&
          (confirm.action === "release"
            ? actions.onRelease(confirm.hold)
            : actions.onDelete(confirm.hold))
        }
      />
    </>
  );
}

/**
 * Settings > Data retention (`/settings/retention`, from `/retention`), with
 * Legal holds as its second tab (`/settings/retention/legal-holds`). Each
 * tab reads only its own query.
 */
export function RetentionScreen(props: RetentionScreenProps) {
  const { tab, activeHolds = 0 } = props;
  const [editing, setEditing] = React.useState<
    RetentionPolicy | null | undefined
  >(undefined);
  const [creatingHold, setCreatingHold] = React.useState(false);
  const { Link } = useUI();
  return (
    <PageFrame
      crumbs={settingsCrumbs("retention")}
      title="Data retention"
      tabs={tabs(tab)}
      tabsLabel="Data retention"
      primaryAction={
        tab === "policies" ? (
          <Button type="button" onClick={() => setEditing(null)}>
            New policy
          </Button>
        ) : (
          <Button type="button" onClick={() => setCreatingHold(true)}>
            New legal hold
          </Button>
        )
      }
      notice={
        tab === "policies" && activeHolds > 0 ? (
          <p
            role="status"
            className="rounded-lg border border-warning-border bg-warning/5 p-3 text-sm"
          >
            {activeHolds} active legal{" "}
            {activeHolds === 1 ? "hold keeps" : "holds keep"} data past these
            policies.{" "}
            <Link className="underline" href="/settings/retention/legal-holds">
              See legal holds
            </Link>
          </p>
        ) : undefined
      }
    >
      {tab === "policies" ? (
        <PoliciesTab
          policies={props.policies}
          actions={props.policyActions}
          editing={editing}
          setEditing={setEditing}
        />
      ) : (
        <>
          <HoldsTab {...props} actions={props.holdActions} />
          <LegalHoldDialog
            open={creatingHold}
            onOpenChange={setCreatingHold}
            holdTypes={props.holdTypes}
            onCreate={props.holdActions.onCreate}
          />
        </>
      )}
    </PageFrame>
  );
}
