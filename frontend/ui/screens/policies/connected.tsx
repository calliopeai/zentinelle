/**
 * The Policies area wired to the operations the app already sends: each
 * container reads through the app's own hooks and documents, maps the result
 * with ./map, and renders the pure screen. The routes under app/ will render
 * these. Writes stay with the route (the `on…` props), until the shared
 * mutation helper lands: a container never sends a mutation of its own.
 */
import { skipToken, useLazyQuery, useQuery } from "@apollo/client/react";
import * as React from "react";

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
import { POLICY_TYPE_LABEL, typeLabel } from "./labels";
import { analyzePolicies, type PolicyAnalyzerData } from "./map";
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

const ALL_TYPES = Object.keys(POLICY_TYPE_LABEL);

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

export type Panel = "simulate" | "analyze" | null;

export interface PoliciesConnectedProps {
  capabilities: readonly string[];
  /** `?panel=`, held by the route so the panel can be linked to. */
  panel: Panel;
  onPanelChange: (panel: Panel) => void;
  initialType?: string;
  onToggleEnabled: (policy: PolicyData) => Promise<unknown> | void;
  onDuplicate: (policy: PolicyData) => Promise<unknown> | void;
  onDelete: (policy: PolicyData) => Promise<unknown>;
}

/** `/policies`: `GetPolicies` with server search and filters; Simulate on `SimulatePolicy`, Analyze on `PolicyAnalyzer` (fetched only while open). */
export function PoliciesConnected({
  capabilities,
  panel,
  onPanelChange,
  initialType = "",
  ...writes
}: PoliciesConnectedProps) {
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
    .filter((t) => t.value)
    .map((t) => ({ value: t.value!, label: typeLabel(t.value!) }));
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
        {...writes}
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

export interface PolicyDetailConnectedProps extends Pick<
  PolicyDetailScreenProps,
  | "history"
  | "diff"
  | "onCompare"
  | "onAskAssistant"
  | "onToggleEnabled"
  | "onDuplicate"
  | "onDelete"
> {
  capabilities: readonly string[];
  id: string;
  tab: PolicyTab;
}

/** `/policies/{id}`: `GetPolicy`; Scope and effect runs `SimulatePolicy` on the policy as configured, when that tab opens. History is REST, passed in. */
export function PolicyDetailConnected({
  capabilities,
  id,
  tab,
  ...rest
}: PolicyDetailConnectedProps) {
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
        {...rest}
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
  onDraftFromDocument: (
    text: string,
  ) => Promise<Partial<CreatePolicyInput> | null>;
  onSubmit: (input: CreatePolicyInput) => Promise<unknown>;
}

/** `/policies/create` and `/policies/{id}/edit`: `GetPolicyOptions`, `GetEndpoints` for agent scope, and `GetPolicy` when editing. */
export function PolicyEditorConnected({
  capabilities,
  id,
  ...rest
}: PolicyEditorConnectedProps) {
  const options = usePolicyOptions();
  const { endpoints } = useEndpoints();
  const existing = usePolicy(id ?? "");
  if (id && existing.loading && !existing.policy) {
    return (
      <PolicyEditorScreen
        capabilities={capabilities}
        options={null}
        optionsLoading
        optionsError={null}
        onRetry={() => {}}
        cancelHref="/policies"
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
      {...rest}
    />
  );
}

export interface ContentRulesConnectedProps {
  capabilities: readonly string[];
  onTest: (rule: ContentRuleData) => void;
  onToggleEnabled: (rule: ContentRuleData) => Promise<unknown> | void;
  onDuplicate: (rule: ContentRuleData) => Promise<unknown> | void;
  onDelete: (rule: ContentRuleData) => Promise<unknown>;
  onSubmit: (
    input: CreateContentRuleInput,
    rule: ContentRuleData | null,
  ) => Promise<unknown>;
}

/** `/content-rules`: `GetContentRules` with server search and filters, and the rule drawer. */
export function ContentRulesConnected({
  capabilities,
  onSubmit,
  ...writes
}: ContentRulesConnectedProps) {
  const [search, setSearch] = React.useState("");
  const [ruleType, setRuleType] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [open, setOpen] = React.useState<{
    rule: ContentRuleData | null;
  } | null>(null);
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
        {...writes}
      />
      <ContentRuleDrawer
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        rule={open?.rule ?? null}
        canEdit={capabilities.includes("mutate")}
        onSubmit={(input) => onSubmit(input, open?.rule ?? null)}
      />
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
  onFork: (prompt: SystemPromptData) => Promise<unknown> | void;
  onDelete: (prompt: SystemPromptData) => Promise<unknown>;
}

/** `/system-prompts`: `GetSystemPrompts` with server search and filters. */
export function PromptLibraryConnected({
  capabilities,
  ...writes
}: PromptLibraryConnectedProps) {
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
      {...writes}
    />
  );
}

export interface PromptEditorConnectedProps {
  capabilities: readonly string[];
  mode: PromptEditorMode;
  /** Edit mode. */
  id?: string;
  onPickTemplate: (id: string) => Promise<SystemPromptData | null>;
  onSave: (draft: PromptDraft) => Promise<unknown>;
  onAnalyze: (
    promptText: string,
    promptType: string,
  ) => Promise<AnalyzeSystemPromptResult>;
}

/** `/system-prompts/new` and `/system-prompts/{id}`: `GetSystemPrompt` when editing, featured `GetSystemPrompts` as templates. */
export function PromptEditorConnected({
  capabilities,
  mode,
  id,
  ...rest
}: PromptEditorConnectedProps) {
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
      {...rest}
    />
  );
}
