import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  Section,
  useUI,
  type Column,
} from "@calliopelabs/ui";
import { MoreHorizontalIcon, SearchXIcon } from "lucide-react";
import * as React from "react";

import type { PolicyData } from "@/graphql/policies/types";

import { Card } from "./components/Card";
import { CodeBlock } from "../../shared/CodeBlock";
import { DefinitionList } from "./components/DefinitionList";
import { useListController } from "../../shared/list-controller";
import { StatTile } from "./components/StatTile";
import { accessOf } from "./access";
import { areaCrumb, policyTabs, type PolicyTab } from "./frame";
import {
  actionLabel,
  BLOCK_LEVEL_OPTIONS,
  formatDateTime,
  scopeLabel,
  typeLabel,
} from "./labels";
import { PolicyStatus } from "./PolicyStatus";
import type { PolicyDiff, PolicyVersion } from "./rest-types";
import type { Simulation } from "./SimulatePanel";

interface Async<T> {
  data: T;
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
}

export interface PolicyDetailScreenProps {
  capabilities: readonly string[];
  /** `GetPolicy`. */
  policy: PolicyData | null;
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  tab: PolicyTab;
  /** Scope and effect: `SimulatePolicy` over this policy's type and config, last 7 days. Queried when the tab opens. */
  effect?: Async<Simulation | null>;
  /** History: REST `policies/{id}/history/`. Fetched when the tab opens. */
  history?: Async<readonly PolicyVersion[]>;
  /** REST `policies/{id}/diff/?from=&to=`, for the pair being compared. */
  diff?: {
    data: PolicyDiff | null;
    loading: boolean;
    error?: { message: string } | null;
  };
  onCompare: (from: number, to: number) => void;
  onSimulate: () => void;
  onAskAssistant: () => void;
  onToggleEnabled: () => Promise<unknown> | void;
  onDuplicate: () => Promise<unknown> | void;
  onDelete: () => Promise<unknown>;
}

function DiffView({ diff }: { diff: PolicyDiff }) {
  const rows = [
    ...Object.entries(diff.added).map(([k, v]) => ({ k, kind: "Added", v })),
    ...Object.entries(diff.removed).map(([k, v]) => ({
      k,
      kind: "Removed",
      v,
    })),
    ...Object.entries(diff.changed).map(([k, v]) => ({
      k,
      kind: "Changed",
      v,
    })),
  ];
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        The two versions are the same.
      </p>
    );
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.map((r) => (
        <li
          key={`${r.kind}-${r.k}`}
          className="grid gap-1 sm:grid-cols-[6rem_1fr]"
        >
          <span className="text-muted-foreground">{r.kind}</span>
          <span className="min-w-0">
            <code className="font-mono text-xs [overflow-wrap:anywhere]">
              {r.k}
            </code>
            <CodeBlock
              label={`${r.kind} ${r.k}`}
              value={r.v}
              maxHeight="sm"
              className="mt-1"
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function History({
  history,
  diff,
  onCompare,
}: Pick<PolicyDetailScreenProps, "history" | "diff" | "onCompare">) {
  const controller = useListController({
    rows: history?.data ?? [],
    loading: history?.loading ?? true,
    error: history?.error,
    onRetry: history?.onRetry ?? (() => {}),
    filtered: false,
    onClearFilters: () => {},
  });
  const columns: Column<PolicyVersion>[] = [
    {
      id: "version",
      header: "Version",
      width: "w-20",
      cell: (v) => <span className="font-mono">v{v.version}</span>,
    },
    {
      id: "summary",
      header: "Change",
      cell: (v) => (
        <span className="[overflow-wrap:anywhere]">
          {v.change_summary || "No summary"}
        </span>
      ),
    },
    {
      id: "by",
      header: "By",
      width: "w-48",
      cell: (v) => (
        <span className="[overflow-wrap:anywhere]">
          {v.changed_by ?? "System"}
        </span>
      ),
    },
    {
      id: "at",
      header: "When",
      width: "w-40",
      cell: (v) => formatDateTime(v.changed_at),
    },
    {
      id: "compare",
      header: <span className="sr-only">Compare</span>,
      label: "Compare",
      width: "w-36",
      align: "right",
      cell: (v) =>
        v.version > 1 ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => onCompare(v.version - 1, v.version)}
          >
            Compare with v{v.version - 1}
          </Button>
        ) : null,
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <DataTable
        label="Versions"
        controller={controller}
        columns={columns}
        getRowId={(v) => String(v.id)}
        empty={{
          title: "No earlier versions",
          description: "A version is recorded each time the policy is saved.",
        }}
      />
      {diff && (
        <Section title="Comparison" aria-live="polite">
          {diff.error ? (
            <ErrorState
              title="Could not compare the versions"
              error={diff.error}
            />
          ) : diff.loading || !diff.data ? (
            <LoadingState label="Comparing" rows={2} />
          ) : (
            <Card
              title={`v${diff.data.from_version} to v${diff.data.to_version}`}
            >
              <DiffView diff={diff.data} />
            </Card>
          )}
        </Section>
      )}
    </div>
  );
}

/** A policy: Overview, Configuration, Scope and effect, History; with Simulate, Duplicate, Turn off, Delete and Ask the assistant. */
export function PolicyDetailScreen({
  capabilities,
  policy,
  loading,
  error,
  onRetry,
  tab,
  effect,
  history,
  diff,
  onCompare,
  onSimulate,
  onAskAssistant,
  onToggleEnabled,
  onDuplicate,
  onDelete,
}: PolicyDetailScreenProps) {
  const { Link } = useUI();
  const { canEdit } = accessOf(capabilities);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const crumbs = [areaCrumb(capabilities, "policies", "/policies")];

  if (error) {
    return (
      <PageFrame crumbs={crumbs} title="Policy">
        <ErrorState
          title="Could not load the policy"
          error={error}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  }
  if (loading && !policy) {
    return (
      <PageFrame crumbs={crumbs} title="Policy">
        <LoadingState label="Loading the policy" variant="page" />
      </PageFrame>
    );
  }
  if (!policy) {
    return (
      <PageFrame crumbs={crumbs} title="Policy not found">
        <EmptyState
          icon={<SearchXIcon />}
          title="This policy does not exist"
          description="It may have been deleted, or the link belongs to another organization."
          actionHref="/policies"
          actionLabel="Back to policies"
        />
      </PageFrame>
    );
  }

  const blockLevel =
    BLOCK_LEVEL_OPTIONS.find((o) => o.value === policy.blockLevel)?.label ??
    policy.blockLevel;
  let body: React.ReactNode;
  if (tab === "overview") {
    body = (
      <Section title="Overview">
        <Card>
          <DefinitionList
            items={[
              { term: "Type", description: typeLabel(policy.policyType) },
              {
                term: "Applies to",
                description: `${scopeLabel(policy.scopeType)}${policy.scopeName ? `: ${policy.scopeName}` : ""}`,
              },
              {
                term: "Status",
                description: (
                  <PolicyStatus
                    enabled={policy.enabled}
                    enforcement={policy.enforcement}
                  />
                ),
              },
              {
                term: "On match",
                description:
                  policy.action === "block"
                    ? `${actionLabel(policy.action)}: ${blockLevel}`
                    : actionLabel(policy.action),
              },
              ...(policy.action === "steer" && policy.steerMessage
                ? [{ term: "Steer message", description: policy.steerMessage }]
                : []),
              {
                term: "Priority",
                description: (
                  <span className="font-mono">{policy.priority}</span>
                ),
              },
              {
                term: "Description",
                description: policy.description || "None",
              },
              {
                term: "Created",
                description: `${formatDateTime(policy.createdAt)}${policy.createdByUsername ? ` by ${policy.createdByUsername}` : ""}`,
              },
              {
                term: "Updated",
                description: formatDateTime(policy.updatedAt),
              },
            ]}
          />
        </Card>
      </Section>
    );
  } else if (tab === "configuration") {
    body = (
      <div className="flex flex-col gap-6">
        <Section
          title="Configuration"
          action={
            canEdit ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/policies/${encodeURIComponent(policy.id)}/edit`}>
                  Edit
                </Link>
              </Button>
            ) : undefined
          }
        >
          <CodeBlock label="Policy configuration" value={policy.config ?? {}} />
        </Section>
        {policy.escalation && Object.keys(policy.escalation).length > 0 && (
          <Section title="Escalation">
            <CodeBlock
              label="Escalation"
              value={policy.escalation}
              maxHeight="sm"
            />
          </Section>
        )}
      </div>
    );
  } else if (tab === "scope") {
    const sim = effect?.data;
    body = (
      <div className="flex flex-col gap-6">
        <Section title="Scope">
          <p className="text-sm">
            {policy.scopeType === "organization"
              ? "Every agent in the organization, unless a narrower policy of the same type overrides it."
              : `Only ${scopeLabel(policy.scopeType).toLowerCase()} ${policy.scopeName ?? ""}, over any broader policy of the same type.`}{" "}
            <Link
              href="/policies/hierarchy"
              className="underline underline-offset-2"
            >
              See the hierarchy
            </Link>
          </p>
        </Section>
        <Section
          title="Effect over the last 7 days"
          description="Recent events replayed against this policy as it is configured now."
          action={
            <Button size="sm" variant="outline" onClick={onSimulate}>
              Simulate a change
            </Button>
          }
        >
          {effect?.error ? (
            <ErrorState
              title="Could not simulate the policy"
              error={effect.error}
              onRetry={effect.onRetry}
            />
          ) : !effect || effect.loading || !sim ? (
            <LoadingState label="Simulating" rows={2} />
          ) : sim.totalEvents === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events in the window to replay.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile
                label="Events"
                value={sim.totalEvents.toLocaleString()}
              />
              <StatTile
                label="Would block"
                value={sim.wouldBlock.toLocaleString()}
                tone={sim.wouldBlock ? "error" : undefined}
              />
              <StatTile
                label="Would warn"
                value={sim.wouldWarn.toLocaleString()}
                tone={sim.wouldWarn ? "warn" : undefined}
              />
              <StatTile
                label="Outcome changed"
                value={`${sim.impactPercent}%`}
              />
            </div>
          )}
        </Section>
      </div>
    );
  } else {
    body = <History history={history} diff={diff} onCompare={onCompare} />;
  }

  return (
    <PageFrame
      crumbs={crumbs}
      title={<span className="[overflow-wrap:anywhere]">{policy.name}</span>}
      status={
        <PolicyStatus
          enabled={policy.enabled}
          enforcement={policy.enforcement}
        />
      }
      context={typeLabel(policy.policyType)}
      tabs={policyTabs(policy.id, tab)}
      tabsLabel="Policy"
      primaryAction={
        <Button
          size="sm"
          variant={canEdit ? "outline" : "default"}
          onClick={onSimulate}
        >
          Simulate
        </Button>
      }
      menu={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="More actions for this policy"
            >
              <MoreHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onAskAssistant}>
              Ask the assistant
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/policies/${encodeURIComponent(policy.id)}/edit`}
                  >
                    Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void onDuplicate()}>
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void onToggleEnabled()}>
                  {policy.enabled ? "Turn off" : "Turn on"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {body}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${policy.name}?`}
        description="Agents stop applying it at their next policy refresh. Its history stays in the audit log; the policy itself cannot be restored."
        confirmLabel="Delete policy"
        destructive
        onConfirm={onDelete}
      />
    </PageFrame>
  );
}
