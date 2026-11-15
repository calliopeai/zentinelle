"use client";

/**
 * The Policies area wired to the operations the app already sends: each
 * container reads through the app's own hooks and documents, maps the result
 * with ./map, and renders the pure screen; the routes under app/ render
 * these. Writes go through ./writes unless a story passes its own `on…`
 * props. Navigation after a write is the route's (`onNavigate`).
 */
import { skipToken, useLazyQuery, useQuery } from "@apollo/client/react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { useEndpoints } from "@/graphql/agents/hooks";
import { useContentRules } from "@/graphql/content-rules/hooks";
import type {
  ContentRuleData,
  CreateContentRuleInput,
} from "@/graphql/content-rules/types";
import {
  useContentScans,
  useContentViolations,
} from "@/graphql/content-scanner/hooks";
import {
  usePolicies,
  usePolicy,
  usePolicyOptions,
} from "@/graphql/policies/hooks";
import {
  GET_POLICY_ANALYZER,
  SIMULATE_POLICY,
  type SimulatePolicyResult,
} from "@/graphql/policies/simulate";
import type { CreatePolicyInput, PolicyData } from "@/graphql/policies/types";
import { useSystemPrompt, useSystemPrompts } from "@/graphql/prompts/hooks";
import { GET_SYSTEM_PROMPTS } from "@/graphql/prompts/queries";
import type {
  AnalyzeSystemPromptResult,
  SystemPromptData,
  SystemPromptListData,
  SystemPromptListVariables,
} from "@/graphql/prompts/types";

import { useDebounced } from "../../shared/use-debounced";
import { AnalyzePanel } from "./AnalyzePanel";
import { ContentRuleDrawer } from "./content-rules/ContentRuleDrawer";
import { ContentRulesScreen } from "./content-rules/ContentRulesScreen";
import {
  DetectionsScreen,
  type DetectionWindow,
} from "./content-rules/DetectionsScreen";
import type { PolicyTab } from "./frame";
import { POLICY_TYPES, usePolicyLabels } from "./labels";
import { analyzePolicies, hierarchyOf, type PolicyAnalyzerData } from "./map";
import { EffectivePolicyScreen } from "./EffectivePolicyScreen";
import { PolicyChangesScreen } from "./PolicyChangesScreen";
import { PolicyCopilotScreen } from "./PolicyCopilotScreen";
import { PolicyHierarchyScreen } from "./PolicyHierarchyScreen";
import type {
  EffectivePolicyResponse,
  PolicyChangeSet,
  PolicyDiff,
  PolicyVersion,
} from "./rest-types";
import { TestRuleDialog } from "./content-rules/TestRuleDialog";
import {
  draftToPolicyInput,
  policiesRest,
  useContentRuleWrites,
  usePolicyWrites,
  usePromptWrites,
  type CopilotPreview,
  type PoliciesRestClient,
} from "./writes";
import { PoliciesScreen } from "./PoliciesScreen";
import {
  PolicyDetailScreen,
  type PolicyDetailScreenProps,
} from "./PolicyDetailScreen";
import { PolicyEditorScreen, type PolicySource } from "./PolicyEditorScreen";
import {
  PromptEditorScreen,
  type PromptDraft,
  type PromptEditorMode,
} from "./prompts/PromptEditorScreen";
import { PromptLibraryScreen } from "./prompts/PromptLibraryScreen";
import {
  SimulatePanel,
  type SimulateInput,
  type Simulation,
} from "./SimulatePanel";

const ALL_TYPES: readonly string[] = POLICY_TYPES;

function useSimulation() {
  const [run, { data, loading, error }] = useLazyQuery<
    SimulatePolicyResult,
    SimulateInput
  >(SIMULATE_POLICY);
  return {
    run: (input: SimulateInput) => void run({ variables: input }),
    result: data?.simulatePolicy ?? null,
    running: loading,
    error: error ?? null,
  };
}

/** A REST read keyed by what it reads, with retry; `null` key skips it. */
function useRest<T>(load: () => Promise<T>, key: string | null) {
  const [result, setResult] = React.useState<{
    key: string;
    value?: T;
    error?: Error;
  } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    if (key === null) return;
    let live = true;
    load().then(
      (value) => live && setResult({ key, value }),
      (error: unknown) =>
        live &&
        setResult({
          key,
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    );
    return () => {
      live = false;
    };
    // `load` is rebuilt every render; `key` names what it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const current = key !== null && result?.key === key ? result : null;
  return {
    loading: key !== null && !current,
    value: current?.value,
    error: current?.error ?? null,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}

/** The error, worded by `fallback` when the server said nothing. */
function worded(error: Error | null, fallback: string) {
  return error && !error.message ? new Error(fallback) : error;
}

/** Runs a row action, and says so in a toast when it fails. */
function reported<A extends unknown[]>(
  act: (...args: A) => Promise<unknown>,
  fallback: string,
) {
  return async (...args: A) => {
    try {
      await act(...args);
    } catch (failure) {
      toast.error(
        failure instanceof Error && failure.message
          ? failure.message
          : fallback,
      );
    }
  };
}

export type Panel = "simulate" | "analyze" | null;

export interface PoliciesConnectedProps {
  capabilities: readonly string[];
  /** `?panel=`, held by the route so the panel can be linked to. */
  panel: Panel;
  onPanelChange: (panel: Panel) => void;
  /** `?type=`: a view by type, such as `network_policy`. */
  initialType?: string;
  onToggleEnabled?: (policy: PolicyData) => Promise<unknown> | void;
  onDuplicate?: (policy: PolicyData) => Promise<unknown> | void;
  onDelete?: (policy: PolicyData) => Promise<unknown>;
}

/** `/policies`: `GetPolicies` with server search and filters; Simulate on `SimulatePolicy`, Analyze on `PolicyAnalyzer` (fetched only while open). */
export function PoliciesConnected({
  capabilities,
  panel,
  onPanelChange,
  initialType = "",
  onToggleEnabled,
  onDuplicate,
  onDelete,
}: PoliciesConnectedProps) {
  const tw = useTranslations("policies.writes");
  const { typeLabel } = usePolicyLabels();
  const writes = usePolicyWrites();
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState(initialType);
  const [scope, setScope] = React.useState("");
  const query = useDebounced(search);
  const { policies, loading, error, refetch } = usePolicies({
    search: query || null,
    policyType: type || null,
    scopeType: scope || null,
  });
  const options = usePolicyOptions();
  const analyzer = useQuery<PolicyAnalyzerData>(
    GET_POLICY_ANALYZER,
    panel === "analyze" ? {} : skipToken,
  );
  const simulation = useSimulation();
  const types = (options.options?.policyTypes ?? [])
    .filter((o) => o.value)
    .map((o) => ({ value: o.value!, label: typeLabel(o.value!) }));
  return (
    <>
      <PoliciesScreen
        capabilities={capabilities}
        policies={policies}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
        search={search}
        onSearchChange={setSearch}
        type={type}
        onTypeChange={setType}
        scope={scope}
        onScopeChange={setScope}
        onSimulate={() => onPanelChange("simulate")}
        onAnalyze={() => onPanelChange("analyze")}
        onToggleEnabled={
          onToggleEnabled ?? reported(writes.toggle, tw("notToggled"))
        }
        onDuplicate={
          onDuplicate ?? reported(writes.duplicate, tw("notDuplicated"))
        }
        onDelete={onDelete ?? writes.remove}
      />
      <SimulatePanel
        key={types.length}
        open={panel === "simulate"}
        onOpenChange={(open) => !open && onPanelChange(null)}
        types={types}
        onRun={simulation.run}
        result={simulation.result}
        running={simulation.running}
        error={simulation.error}
      />
      <AnalyzePanel
        open={panel === "analyze"}
        onOpenChange={(open) => !open && onPanelChange(null)}
        analysis={
          analyzer.data ? analyzePolicies(analyzer.data, ALL_TYPES) : null
        }
        loading={analyzer.loading}
        error={analyzer.error}
        onRetry={() => void analyzer.refetch()}
      />
    </>
  );
}

export interface PolicyDetailConnectedProps extends Partial<
  Pick<
    PolicyDetailScreenProps,
    | "history"
    | "diff"
    | "onCompare"
    | "onAskAssistant"
    | "onToggleEnabled"
    | "onDuplicate"
    | "onDelete"
  >
> {
  capabilities: readonly string[];
  id: string;
  tab: PolicyTab;
  /** Where the route goes after a write: the list after Delete, the copy after Duplicate. */
  onNavigate?: (href: string) => void;
  client?: PoliciesRestClient;
}

/** `/policies/{id}`: `GetPolicy`; Scope and effect runs `SimulatePolicy` on the policy as configured, when that tab opens; History is REST, read when that tab opens. */
export function PolicyDetailConnected({
  capabilities,
  id,
  tab,
  onNavigate,
  client = policiesRest,
  ...overrides
}: PolicyDetailConnectedProps) {
  const tw = useTranslations("policies.writes");
  const { typeLabel } = usePolicyLabels();
  const writes = usePolicyWrites();
  const { policy, loading, error, refetch } = usePolicy(id);
  const [simulateOpen, setSimulateOpen] = React.useState(false);
  const effect = useQuery<SimulatePolicyResult, SimulateInput>(
    SIMULATE_POLICY,
    tab === "scope" && policy
      ? {
          variables: {
            policyType: policy.policyType,
            config: policy.config ?? {},
            enforcement: policy.enforcement,
            lookbackDays: 7,
          },
        }
      : skipToken,
  );
  const simulation = useSimulation();
  const history = useRest<PolicyVersion[]>(
    () => client.history(id),
    tab === "history" && !overrides.history ? id : null,
  );
  const [pair, setPair] = React.useState<[number, number] | null>(null);
  const diff = useRest<PolicyDiff>(
    () => client.diff(id, pair![0], pair![1]),
    pair && !overrides.diff ? `${id}:${pair[0]}:${pair[1]}` : null,
  );
  return (
    <>
      <PolicyDetailScreen
        capabilities={capabilities}
        policy={policy}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
        tab={tab}
        effect={{
          data: (effect.data?.simulatePolicy as Simulation | undefined) ?? null,
          loading: effect.loading,
          error: effect.error,
          onRetry: () => void effect.refetch(),
        }}
        onSimulate={() => setSimulateOpen(true)}
        history={
          overrides.history ?? {
            data: history.value ?? [],
            loading: history.loading,
            error: worded(history.error, tw("historyFailed")),
            onRetry: history.retry,
          }
        }
        diff={
          overrides.diff ??
          (pair
            ? {
                data: diff.value ?? null,
                loading: diff.loading,
                error: worded(diff.error, tw("diffFailed")),
              }
            : undefined)
        }
        onCompare={overrides.onCompare ?? ((from, to) => setPair([from, to]))}
        onAskAssistant={
          overrides.onAskAssistant ??
          (() =>
            onNavigate?.(`/policies/copilot?policy=${encodeURIComponent(id)}`))
        }
        onToggleEnabled={
          overrides.onToggleEnabled ??
          reported(() => writes.toggle({ id }), tw("notToggled"))
        }
        onDuplicate={
          overrides.onDuplicate ??
          reported(async () => {
            const copy = await writes.duplicate({ id });
            if (copy) onNavigate?.(`/policies/${encodeURIComponent(copy.id)}`);
          }, tw("notDuplicated"))
        }
        onDelete={
          overrides.onDelete ??
          (async () => {
            await writes.remove({ id });
            onNavigate?.("/policies");
          })
        }
      />
      {policy && (
        <SimulatePanel
          open={simulateOpen}
          onOpenChange={setSimulateOpen}
          types={[
            { value: policy.policyType, label: typeLabel(policy.policyType) },
          ]}
          initial={{
            policyType: policy.policyType,
            config: policy.config ?? {},
            enforcement: policy.enforcement,
          }}
          onRun={simulation.run}
          result={simulation.result}
          running={simulation.running}
          error={simulation.error}
        />
      )}
    </>
  );
}

export interface PolicyEditorConnectedProps {
  capabilities: readonly string[];
  /** Absent for New policy. */
  id?: string;
  source: PolicySource;
  onSourceChange: (source: PolicySource) => void;
  onDraftFromDocument?: (
    text: string,
  ) => Promise<Partial<CreatePolicyInput> | null>;
  onSubmit?: (input: CreatePolicyInput) => Promise<unknown>;
  /** The saved policy's page, after a save. */
  onNavigate?: (href: string) => void;
  client?: PoliciesRestClient;
}

/** `/policies/create` and `/policies/{id}/edit`: `GetPolicyOptions`, `GetEndpoints` for agent scope, and `GetPolicy` when editing; a document is drafted by the policy copilot. */
export function PolicyEditorConnected({
  capabilities,
  id,
  onDraftFromDocument,
  onSubmit,
  onNavigate,
  client = policiesRest,
  ...rest
}: PolicyEditorConnectedProps) {
  const writes = usePolicyWrites();
  const options = usePolicyOptions();
  const { endpoints } = useEndpoints();
  const existing = usePolicy(id ?? "");
  const draft =
    onDraftFromDocument ??
    (async (text: string) =>
      draftToPolicyInput(await client.copilotDraft(text)));
  const submit =
    onSubmit ??
    (async (input: CreatePolicyInput) => {
      const saved = await writes.save(input, id);
      const target = saved?.id ?? id;
      if (target) onNavigate?.(`/policies/${encodeURIComponent(target)}`);
    });
  if (id && existing.loading && !existing.policy) {
    return (
      <PolicyEditorScreen
        capabilities={capabilities}
        options={null}
        optionsLoading
        optionsError={null}
        onRetry={() => {}}
        cancelHref="/policies"
        onDraftFromDocument={draft}
        onSubmit={submit}
        {...rest}
      />
    );
  }
  return (
    <PolicyEditorScreen
      key={existing.policy?.id ?? "new"}
      capabilities={capabilities}
      options={options.options}
      optionsLoading={options.loading}
      optionsError={options.error ?? existing.error}
      onRetry={() => void existing.refetch()}
      policy={id ? existing.policy : undefined}
      agents={endpoints.map((e) => ({ id: e.id, name: e.name }))}
      cancelHref={id ? `/policies/${encodeURIComponent(id)}` : "/policies"}
      onDraftFromDocument={draft}
      onSubmit={submit}
      {...rest}
    />
  );
}

/** `/policies/hierarchy`: `GetPolicies` by type, as the tiers inheritance resolves through. */
export function PolicyHierarchyConnected({
  capabilities,
}: {
  capabilities: readonly string[];
}) {
  const [type, setType] = React.useState("");
  const { policies, loading, error, refetch } = usePolicies({
    policyType: type || null,
  });
  return (
    <PolicyHierarchyScreen
      capabilities={capabilities}
      tiers={hierarchyOf(policies)}
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
      type={type}
      onTypeChange={setType}
    />
  );
}

export interface EffectivePolicyConnectedProps {
  capabilities: readonly string[];
  /** `?endpoint=` (an endpoint id) or `?agent=` (an agent's slug, as the agent page links). */
  initialAgent?: string;
  client?: PoliciesRestClient;
}

/** `/policies/effective`: `GetEndpoints` for the picker, REST `effective-policy` for the chosen agent. */
export function EffectivePolicyConnected({
  capabilities,
  initialAgent = "",
  client = policiesRest,
}: EffectivePolicyConnectedProps) {
  const tw = useTranslations("policies.writes");
  const { endpoints, loading: agentsLoading } = useEndpoints();
  const [chosen, setChosen] = React.useState<string | null>(null);
  const fromLink =
    endpoints.find((e) => e.id === initialAgent || e.agentId === initialAgent)
      ?.id ?? "";
  const agentId = chosen ?? fromLink;
  const effective = useRest<EffectivePolicyResponse>(
    () => client.effective(agentId),
    agentId || null,
  );
  return (
    <EffectivePolicyScreen
      capabilities={capabilities}
      agents={endpoints.map((e) => ({ id: e.id, name: e.name }))}
      agentsLoading={agentsLoading}
      agentId={agentId}
      onAgentChange={setChosen}
      effective={effective.value ?? null}
      loading={effective.loading}
      error={worded(effective.error, tw("effectiveFailed"))}
      onRetry={effective.retry}
    />
  );
}

export interface PolicyChangesConnectedProps {
  capabilities: readonly string[];
  /** `?change=`: the change set open in the drawer. */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  client?: PoliciesRestClient;
}

/** `/policies/changes`: REST `policy-changes` by status, and each change set's reviewed transitions. */
export function PolicyChangesConnected({
  capabilities,
  openId,
  onOpenChange,
  client = policiesRest,
}: PolicyChangesConnectedProps) {
  const tw = useTranslations("policies.writes");
  const [status, setStatus] = React.useState("");
  const changes = useRest<PolicyChangeSet[]>(
    () => client.changes(status),
    `changes:${status}`,
  );
  return (
    <PolicyChangesScreen
      capabilities={capabilities}
      changes={changes.value ?? []}
      loading={changes.loading}
      error={worded(changes.error, tw("changesFailed"))}
      onRetry={changes.retry}
      status={status}
      onStatusChange={setStatus}
      openId={openId}
      onOpenChange={onOpenChange}
      onTransition={async (change, to) => {
        try {
          await client.transition(change.id, to);
        } catch (failure) {
          throw worded(
            failure instanceof Error ? failure : new Error(),
            tw("transitionFailed"),
          );
        }
        changes.retry();
      }}
    />
  );
}

export interface PolicyCopilotConnectedProps {
  capabilities: readonly string[];
  /** `?policy=`: the live policy to compare against, as a policy page links it. */
  initialPolicyId?: string;
  client?: PoliciesRestClient;
}

/** `/policies/copilot`: REST `policy-copilot/status`, `draft`, `diff` and `stage`, then `policy-changes/{id}/transition`. */
export function PolicyCopilotConnected({
  capabilities,
  initialPolicyId = "",
  client = policiesRest,
}: PolicyCopilotConnectedProps) {
  const t = useTranslations("policies.copilot");
  const status = useRest(() => client.copilotStatus(), "status");
  const { policies } = usePolicies();
  const [request, setRequest] = React.useState("");
  const [policyId, setPolicyId] = React.useState(initialPolicyId);
  const [preview, setPreview] = React.useState<CopilotPreview | null>(null);
  const [staged, setStaged] = React.useState<{
    id: string;
    status: string;
  } | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "stage" | null>(null);
  const [error, setError] = React.useState<Error | null>(null);

  async function step(
    kind: "preview" | "stage" | null,
    fallback: string,
    act: () => Promise<void>,
  ) {
    setBusy(kind);
    setError(null);
    try {
      await act();
    } catch (failure) {
      setError(
        worded(failure instanceof Error ? failure : new Error(), fallback),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <PolicyCopilotScreen
      capabilities={capabilities}
      status={
        status.error
          ? "error"
          : status.loading || !status.value
            ? "loading"
            : status.value.enabled
              ? "enabled"
              : "disabled"
      }
      statusReason={status.value?.reason}
      onRetryStatus={status.retry}
      request={request}
      onRequestChange={setRequest}
      policyId={policyId}
      onPolicyIdChange={(id) => {
        setPolicyId(id);
        setPreview(null);
        setStaged(null);
      }}
      policies={policies.map((p) => ({ id: p.id, name: p.name }))}
      onPreview={() =>
        void step("preview", t("errors.draft"), async () => {
          setStaged(null);
          const draft = await client.copilotDraft(request.trim());
          setPreview(await client.copilotDiff(policyId, draft));
        })
      }
      previewing={busy === "preview"}
      preview={preview}
      error={status.error ?? error}
      onStage={() =>
        void step("stage", t("errors.stage"), async () => {
          if (!preview) return;
          const result = await client.copilotStage(policyId, preview.after);
          setStaged({ id: result.change_id, status: result.status });
        })
      }
      staging={busy === "stage"}
      staged={staged}
      onTransition={(to) =>
        void step(null, t("errors.transition"), async () => {
          if (!staged) return;
          const result = await client.transition(staged.id, to);
          setStaged({ id: staged.id, status: result.status || to });
        })
      }
    />
  );
}

export interface ContentRulesConnectedProps {
  capabilities: readonly string[];
  onTest?: (rule: ContentRuleData) => void;
  onToggleEnabled?: (rule: ContentRuleData) => Promise<unknown> | void;
  onDuplicate?: (rule: ContentRuleData) => Promise<unknown> | void;
  onDelete?: (rule: ContentRuleData) => Promise<unknown>;
  onSubmit?: (
    input: CreateContentRuleInput,
    rule: ContentRuleData | null,
  ) => Promise<unknown>;
}

/** `/content-rules`: `GetContentRules` with server search and filters, the rule drawer, and the rule test. */
export function ContentRulesConnected({
  capabilities,
  onSubmit,
  onTest,
  onToggleEnabled,
  onDuplicate,
  onDelete,
}: ContentRulesConnectedProps) {
  const tw = useTranslations("policies.writes");
  const writes = useContentRuleWrites();
  const [search, setSearch] = React.useState("");
  const [ruleType, setRuleType] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [open, setOpen] = React.useState<{
    rule: ContentRuleData | null;
  } | null>(null);
  const [testing, setTesting] = React.useState<ContentRuleData | null>(null);
  const query = useDebounced(search);
  const {
    contentRules: rules,
    loading,
    error,
    refetch,
  } = useContentRules({
    search: query || null,
    ruleType: ruleType || null,
    severity: severity || null,
  });
  return (
    <>
      <ContentRulesScreen
        capabilities={capabilities}
        rules={rules}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
        search={search}
        onSearchChange={setSearch}
        ruleType={ruleType}
        onRuleTypeChange={setRuleType}
        severity={severity}
        onSeverityChange={setSeverity}
        onOpenRule={(rule) => setOpen({ rule })}
        onTest={onTest ?? setTesting}
        onToggleEnabled={
          onToggleEnabled ?? reported(writes.toggle, tw("ruleNotToggled"))
        }
        onDuplicate={
          onDuplicate ?? reported(writes.duplicate, tw("ruleNotDuplicated"))
        }
        onDelete={onDelete ?? writes.remove}
      />
      <ContentRuleDrawer
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        rule={open?.rule ?? null}
        canEdit={capabilities.includes("mutate")}
        onSubmit={(input) =>
          (onSubmit ?? writes.save)(input, open?.rule ?? null)
        }
      />
      {testing && (
        <TestRuleDialog
          open
          onOpenChange={(o) => !o && setTesting(null)}
          ruleName={testing.name}
          onTest={(content) => writes.test(testing, content)}
        />
      )}
    </>
  );
}

/** The window's start, fixed when it is chosen so the query variables hold still between renders. */
function since(days: DetectionWindow): string {
  return new Date(Date.now() - Number(days) * 86_400_000).toISOString();
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";

/** `/content-rules/detections`: `GetContentViolations` and `GetContentScans` over the chosen window. */
export function DetectionsConnected({
  capabilities,
}: {
  capabilities: readonly string[];
}) {
  const [window, setWindowState] = React.useState<DetectionWindow>("7");
  const [startDate, setStartDate] = React.useState(() => since("7"));
  const setWindow = (next: DetectionWindow) => {
    setWindowState(next);
    setStartDate(since(next));
  };
  const [severity, setSeverity] = React.useState("");
  const [ruleType, setRuleType] = React.useState("");
  const v = useContentViolations({
    startDate,
    severity: severity || null,
    ruleType: ruleType || null,
  });
  const s = useContentScans({ startDate });
  const params = new URLSearchParams({ start: startDate });
  if (severity) params.set("severity", severity);
  if (ruleType) params.set("rule_type", ruleType);
  return (
    <DetectionsScreen
      capabilities={capabilities}
      violations={v.violations}
      scans={s.scans}
      loading={v.loading || s.loading}
      error={v.error ?? s.error}
      onRetry={() => {
        void v.refetch();
        void s.refetch();
      }}
      window={window}
      onWindowChange={setWindow}
      severity={severity}
      onSeverityChange={setSeverity}
      ruleType={ruleType}
      onRuleTypeChange={setRuleType}
      exportHref={`${API_URL}/export/violations.csv?${params}`}
    />
  );
}

export interface PromptLibraryConnectedProps {
  capabilities: readonly string[];
  onFork?: (prompt: SystemPromptData) => Promise<unknown> | void;
  onDelete?: (prompt: SystemPromptData) => Promise<unknown>;
  /** The copy's page, after a fork. */
  onNavigate?: (href: string) => void;
}

/** `/system-prompts`: `GetSystemPrompts` with server search and filters. */
export function PromptLibraryConnected({
  capabilities,
  onFork,
  onDelete,
  onNavigate,
}: PromptLibraryConnectedProps) {
  const tw = useTranslations("policies.writes");
  const writes = usePromptWrites();
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState("");
  const [featuredOnly, setFeaturedOnly] = React.useState(false);
  const query = useDebounced(search);
  const { prompts, loading, error, refetch } = useSystemPrompts({
    search: query || null,
    systemPromptType: type || null,
    featuredOnly: featuredOnly || null,
  });
  return (
    <PromptLibraryScreen
      capabilities={capabilities}
      prompts={prompts}
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
      search={search}
      onSearchChange={setSearch}
      type={type}
      onTypeChange={setType}
      featuredOnly={featuredOnly}
      onFeaturedOnlyChange={setFeaturedOnly}
      onFork={
        onFork ??
        reported(async (prompt: SystemPromptData) => {
          const copy = await writes.fork(prompt);
          if (copy)
            onNavigate?.(`/system-prompts/${encodeURIComponent(copy.id)}`);
        }, tw("promptNotForked"))
      }
      onDelete={onDelete ?? writes.remove}
    />
  );
}

export interface PromptEditorConnectedProps {
  capabilities: readonly string[];
  mode: PromptEditorMode;
  /** Edit mode. */
  id?: string;
  onPickTemplate?: (id: string) => Promise<SystemPromptData | null>;
  onSave?: (draft: PromptDraft) => Promise<unknown>;
  onAnalyze?: (
    promptText: string,
    promptType: string,
  ) => Promise<AnalyzeSystemPromptResult>;
  /** The prompt's page, after a new one is saved. */
  onNavigate?: (href: string) => void;
}

/** `/system-prompts/new` and `/system-prompts/{id}`: `GetSystemPrompt` when editing, featured `GetSystemPrompts` as templates. */
export function PromptEditorConnected({
  capabilities,
  mode,
  id,
  onPickTemplate,
  onSave,
  onAnalyze,
  onNavigate,
}: PromptEditorConnectedProps) {
  const writes = usePromptWrites();
  const detail = useSystemPrompt({ id: id ?? null });
  // Templates are fetched only in template mode: the hook has no skip.
  const templates = useQuery<SystemPromptListData, SystemPromptListVariables>(
    GET_SYSTEM_PROMPTS,
    mode === "template" ? { variables: { featuredOnly: true } } : skipToken,
  );
  return (
    <PromptEditorScreen
      key={detail.prompt?.id ?? "new"}
      capabilities={capabilities}
      mode={mode}
      prompt={detail.prompt}
      loading={detail.loading}
      error={detail.error}
      onRetry={() => void detail.refetch()}
      templates={
        (templates.data?.systemPrompts as SystemPromptData[] | undefined) ?? []
      }
      templatesLoading={templates.loading}
      cancelHref="/system-prompts"
      onPickTemplate={onPickTemplate ?? writes.template}
      onSave={
        onSave ??
        (async (draft) => {
          const saved = await writes.save(draft, id);
          if (!id) onNavigate?.(`/system-prompts/${encodeURIComponent(saved)}`);
        })
      }
      onAnalyze={onAnalyze ?? writes.analyze}
    />
  );
}
