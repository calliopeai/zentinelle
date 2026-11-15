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
import { useTranslations } from "next-intl";

import type { PolicyData } from "@/graphql/policies/types";

import { Card } from "./components/Card";
import { CodeBlock } from "../../shared/CodeBlock";
import { DefinitionList } from "./components/DefinitionList";
import { useListController } from "../../shared/list-controller";
import { StatTile } from "./components/StatTile";
import { accessOf } from "./access";
import { areaCrumb, policyTabs, type PolicyTab } from "./frame";
import { usePolicyLabels } from "./labels";
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
  const t = useTranslations("policies.policyDetailScreen");
  const rows = [
    ...Object.entries(diff.added).map(([k, v]) => ({ k, kind: t("added"), v })),
    ...Object.entries(diff.removed).map(([k, v]) => ({
      k,
      kind: t("removed"),
      v,
    })),
    ...Object.entries(diff.changed).map(([k, v]) => ({
      k,
      kind: t("changed"),
      v,
    })),
  ];
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        {t("theTwoVersionsAreThe")}
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
  const t = useTranslations("policies.policyDetailScreen");
  const { formatDateTime } = usePolicyLabels();
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
      header: t("version"),
      width: "w-20",
      cell: (v) => <span className="font-mono">v{v.version}</span>,
    },
    {
      id: "summary",
      header: t("change"),
      cell: (v) => (
        <span className="[overflow-wrap:anywhere]">
          {v.change_summary || t("noSummary")}
        </span>
      ),
    },
    {
      id: "by",
      header: t("by"),
      width: "w-48",
      cell: (v) => (
        <span className="[overflow-wrap:anywhere]">
          {v.changed_by ?? t("system")}
        </span>
      ),
    },
    {
      id: "at",
      header: t("when"),
      width: "w-40",
      cell: (v) => formatDateTime(v.changed_at),
    },
    {
      id: "compare",
      header: <span className="sr-only">{t("compare")}</span>,
      label: t("compare"),
      width: "w-36",
      align: "right",
      cell: (v) =>
        v.version > 1 ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => onCompare(v.version - 1, v.version)}
          >
            {t("compareWith", { version: v.version - 1 })}
          </Button>
        ) : null,
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <DataTable
        label={t("versions")}
        controller={controller}
        columns={columns}
        getRowId={(v) => String(v.id)}
        empty={{
          title: t("noEarlierVersions"),
          description: t("aVersionIsRecordedEach"),
        }}
      />
      {diff && (
        <Section title={t("comparison")} aria-live="polite">
          {diff.error ? (
            <ErrorState
              title={t("couldNotCompareTheVersions")}
              error={diff.error}
            />
          ) : diff.loading || !diff.data ? (
            <LoadingState label={t("comparing")} rows={2} />
          ) : (
            <Card
              title={t("versionPair", {
                from: diff.data.from_version,
                to: diff.data.to_version,
              })}
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
  const t = useTranslations("policies.policyDetailScreen");
  const {
    actionLabel,
    blockLevelLabel,
    formatDateTime,
    scopeLabel,
    typeLabel,
    tabs,
  } = usePolicyLabels();
  const { Link } = useUI();
  const { canEdit } = accessOf(capabilities);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const crumbs = [areaCrumb(capabilities, "policies", "/policies")];

  if (error) {
    return (
      <PageFrame crumbs={crumbs} title={t("policy")}>
        <ErrorState
          title={t("couldNotLoadThePolicy")}
          error={error}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  }
  if (loading && !policy) {
    return (
      <PageFrame crumbs={crumbs} title={t("policy")}>
        <LoadingState label={t("loadingThePolicy")} variant="page" />
      </PageFrame>
    );
  }
  if (!policy) {
    return (
      <PageFrame crumbs={crumbs} title={t("policyNotFound")}>
        <EmptyState
          icon={<SearchXIcon />}
          title={t("thisPolicyDoesNotExist")}
          description={t("itMayHaveBeenDeleted")}
          actionHref="/policies"
          actionLabel={t("backToPolicies")}
        />
      </PageFrame>
    );
  }

  const blockLevel = blockLevelLabel(policy.blockLevel);
  let body: React.ReactNode;
  if (tab === "overview") {
    body = (
      <Section title={t("overview")}>
        <Card>
          <DefinitionList
            items={[
              { term: t("type"), description: typeLabel(policy.policyType) },
              {
                term: t("appliesTo"),
                description: `${scopeLabel(policy.scopeType)}${policy.scopeName ? `: ${policy.scopeName}` : ""}`,
              },
              {
                term: t("status"),
                description: (
                  <PolicyStatus
                    enabled={policy.enabled}
                    enforcement={policy.enforcement}
                  />
                ),
              },
              {
                term: t("onMatch"),
                description:
                  policy.action === "block"
                    ? `${actionLabel(policy.action)}: ${blockLevel}`
                    : actionLabel(policy.action),
              },
              ...(policy.action === "steer" && policy.steerMessage
                ? [
                    {
                      term: t("steerMessage"),
                      description: policy.steerMessage,
                    },
                  ]
                : []),
              {
                term: t("priority"),
                description: (
                  <span className="font-mono">{policy.priority}</span>
                ),
              },
              {
                term: t("description"),
                description: policy.description || t("none"),
              },
              {
                term: t("created"),
                description: policy.createdByUsername
                  ? t("createdBy", {
                      time: formatDateTime(policy.createdAt),
                      name: policy.createdByUsername,
                    })
                  : formatDateTime(policy.createdAt),
              },
              {
                term: t("updated"),
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
          title={t("configuration")}
          action={
            canEdit ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/policies/${encodeURIComponent(policy.id)}/edit`}>
                  {t("edit")}
                </Link>
              </Button>
            ) : undefined
          }
        >
          <CodeBlock
            label={t("policyConfiguration")}
            value={policy.config ?? {}}
          />
        </Section>
        {policy.escalation && Object.keys(policy.escalation).length > 0 && (
          <Section title={t("escalation")}>
            <CodeBlock
              label={t("escalation")}
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
        <Section title={t("scope")}>
          <p className="text-sm">
            {policy.scopeType === "organization"
              ? t("everyAgentInTheOrganization")
              : t("onlyScope", {
                  scope: scopeLabel(policy.scopeType).toLowerCase(),
                  name: policy.scopeName ?? "",
                })}{" "}
            <Link
              href="/policies/hierarchy"
              className="underline underline-offset-2"
            >
              {t("seeTheHierarchy")}
            </Link>
          </p>
        </Section>
        <Section
          title={t("effectOverTheLast7")}
          description={t("recentEventsReplayedAgainstThis")}
          action={
            <Button size="sm" variant="outline" onClick={onSimulate}>
              {t("simulateAChange")}
            </Button>
          }
        >
          {effect?.error ? (
            <ErrorState
              title={t("couldNotSimulateThePolicy")}
              error={effect.error}
              onRetry={effect.onRetry}
            />
          ) : !effect || effect.loading || !sim ? (
            <LoadingState label={t("simulating")} rows={2} />
          ) : sim.totalEvents === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noEventsInTheWindow")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile
                label={t("events")}
                value={sim.totalEvents.toLocaleString()}
              />
              <StatTile
                label={t("wouldBlock")}
                value={sim.wouldBlock.toLocaleString()}
                tone={sim.wouldBlock ? "error" : undefined}
              />
              <StatTile
                label={t("wouldWarn")}
                value={sim.wouldWarn.toLocaleString()}
                tone={sim.wouldWarn ? "warn" : undefined}
              />
              <StatTile
                label={t("outcomeChanged")}
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
      tabs={policyTabs(policy.id, tab, tabs.policy)}
      tabsLabel={t("policy")}
      primaryAction={
        <Button
          size="sm"
          variant={canEdit ? "outline" : "default"}
          onClick={onSimulate}
        >
          {t("simulate")}
        </Button>
      }
      menu={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("moreActionsForThisPolicy")}
            >
              <MoreHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onAskAssistant}>
              {t("askTheAssistant")}
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/policies/${encodeURIComponent(policy.id)}/edit`}
                  >
                    {t("edit")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void onDuplicate()}>
                  {t("duplicate")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void onToggleEnabled()}>
                  {policy.enabled ? t("turnOff") : t("turnOn")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  {t("delete")}
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
        description={t("agentsStopApplyingItAt")}
        confirmLabel={t("deletePolicy")}
        destructive
        onConfirm={onDelete}
      />
    </PageFrame>
  );
}
