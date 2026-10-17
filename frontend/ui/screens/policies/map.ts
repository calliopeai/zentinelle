/**
 * Pure mappings from what the operations return to what the screens draw.
 * The route calls these; the stories and map.test.ts call them on fixtures.
 */
import type { PolicyData } from "@/graphql/policies/types";

import { SCOPE_ORDER, scopeRank, typeLabel } from "./labels";

/* ── Hierarchy ─────────────────────────────────────────────────── */

export interface HierarchyPolicy {
  policy: PolicyData;
  /** A broader tier holds an enabled policy of the same type, which this one overrides for its targets. */
  overrides: string | null;
}

export interface HierarchyTier {
  scope: string;
  policies: HierarchyPolicy[];
}

/** Policies by scope tier, broadest first; within a tier, by priority then name. */
export function hierarchyOf(policies: readonly PolicyData[]): HierarchyTier[] {
  const sorted = [...policies].sort(
    (a, b) =>
      scopeRank(a.scopeType) - scopeRank(b.scopeType) ||
      b.priority - a.priority ||
      a.name.localeCompare(b.name),
  );
  const broaderByType = new Map<string, string>();
  const tiers = new Map<string, HierarchyPolicy[]>();
  for (const policy of sorted) {
    const overridden = broaderByType.get(policy.policyType);
    const entry: HierarchyPolicy = {
      policy,
      overrides:
        overridden && overridden !== policy.scopeType ? overridden : null,
    };
    const list = tiers.get(policy.scopeType) ?? [];
    list.push(entry);
    tiers.set(policy.scopeType, list);
    if (policy.enabled && !broaderByType.has(policy.policyType)) {
      broaderByType.set(policy.policyType, policy.scopeType);
    }
  }
  const order = [
    ...SCOPE_ORDER,
    ...[...tiers.keys()].filter(
      (k) => !(SCOPE_ORDER as readonly string[]).includes(k),
    ),
  ];
  return order
    .filter((scope) => tiers.has(scope))
    .map((scope) => ({ scope, policies: tiers.get(scope)! }));
}

/* ── Analyze coverage ──────────────────────────────────────────── */

/** The fields `PolicyAnalyzer` selects (graphql/policies/simulate.ts). */
export interface AnalyzerPolicy {
  id: string;
  name: string;
  policyType: string;
  scopeType: string;
  enforcement: string;
  enabled: boolean;
  priority: number;
  config: unknown;
}

export interface AnalyzerEndpoint {
  id: string;
  agentId: string;
  name: string;
  agentType: string;
  status: string;
}

export interface PolicyAnalyzerData {
  policies: AnalyzerPolicy[];
  endpoints: AnalyzerEndpoint[];
}

export interface PolicyIssue {
  id: string;
  name: string;
  issues: string[];
}

export interface PolicyConflict {
  type: string;
  scope: string;
  priority: number;
  names: string[];
}

export interface PolicyAnalysis {
  total: number;
  enforced: number;
  auditOnly: number;
  disabled: number;
  agents: number;
  coveredTypes: string[];
  /** Types with no enabled policy, by label. */
  missingTypes: string[];
  issues: PolicyIssue[];
  conflicts: PolicyConflict[];
}

function isEmptyConfig(config: unknown): boolean {
  if (config == null) return true;
  if (typeof config === "string") {
    try {
      return isEmptyConfig(JSON.parse(config));
    } catch {
      return false;
    }
  }
  return typeof config === "object" && Object.keys(config).length === 0;
}

/**
 * Coverage, issues and conflicts over `PolicyAnalyzer`. Counts only: no
 * invented score. A conflict is two enabled policies of one type, scope
 * tier and priority, which the resolver cannot order.
 */
export function analyzePolicies(
  data: PolicyAnalyzerData,
  allTypes: readonly string[],
): PolicyAnalysis {
  const { policies } = data;
  const live = policies.filter(
    (p) => p.enabled && p.enforcement !== "disabled",
  );
  const covered = new Set(live.map((p) => p.policyType));
  const issues: PolicyIssue[] = [];
  for (const p of policies) {
    const list: string[] = [];
    if (isEmptyConfig(p.config))
      list.push("The configuration is empty, so the policy checks nothing.");
    if (!p.enabled) list.push("The policy is turned off.");
    else if (p.enforcement === "disabled")
      list.push("Enforcement is disabled, so the policy has no effect.");
    if (list.length) issues.push({ id: p.id, name: p.name, issues: list });
  }
  const groups = new Map<string, AnalyzerPolicy[]>();
  for (const p of live) {
    const key = `${p.policyType}|${p.scopeType}|${p.priority}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const conflicts: PolicyConflict[] = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      type: group[0].policyType,
      scope: group[0].scopeType,
      priority: group[0].priority,
      names: group.map((p) => p.name).sort(),
    }));
  return {
    total: policies.length,
    enforced: live.filter((p) => p.enforcement === "enforce").length,
    auditOnly: live.filter((p) => p.enforcement === "audit").length,
    disabled: policies.length - live.length,
    agents: data.endpoints.length,
    coveredTypes: [...covered].sort(),
    missingTypes: allTypes
      .filter((t) => !covered.has(t))
      .map(typeLabel)
      .sort(),
    issues,
    conflicts,
  };
}

/* ── Policy configuration fields ───────────────────────────────── */

/** Words the backend's snake_case keys hold that read as acronyms. */
const ACRONYMS = new Set(["usd", "pii", "url", "id", "api", "ip"]);

export type ConfigFieldKind = "list" | "bool" | "int" | "float" | "str";

export interface ConfigField {
  key: string;
  label: string;
  kind: ConfigFieldKind;
}

/** `configSchema` from `GetPolicyOptions`: each key and its Python type name. */
export function configFieldsOf(
  schema: Record<string, unknown> | null | undefined,
): ConfigField[] {
  if (!schema) return [];
  return Object.entries(schema).map(([key, kind]) => {
    const k = String(kind);
    return {
      key,
      label: key
        .split("_")
        .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word))
        .join(" ")
        .replace(/^./, (c) => c.toUpperCase()),
      kind: (["list", "bool", "int", "float"].includes(k)
        ? k
        : "str") as ConfigFieldKind,
    };
  });
}

/** A field's value as its control edits it: lists one item per line. */
export function toFieldText(value: unknown, kind: ConfigFieldKind): string {
  if (value == null) return "";
  if (kind === "list")
    return Array.isArray(value) ? value.join("\n") : String(value);
  return String(value);
}

/** The control's text back to the value the backend stores; undefined drops the key. */
export function fromFieldText(
  text: string,
  kind: ConfigFieldKind,
): { value?: unknown; error?: string } {
  const trimmed = text.trim();
  if (kind === "list") {
    const items = trimmed
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return { value: items.length ? items : undefined };
  }
  if (!trimmed) return {};
  if (kind === "int") {
    return /^-?\d+$/.test(trimmed)
      ? { value: Number(trimmed) }
      : { error: "Enter a whole number." };
  }
  if (kind === "float") {
    const n = Number(trimmed);
    return Number.isFinite(n) ? { value: n } : { error: "Enter a number." };
  }
  return { value: trimmed };
}

/* ── Prompts ───────────────────────────────────────────────────── */

/** The `{{variable}}` placeholders a prompt fills at run time, in order of first use. */
export function promptVariables(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g))
    seen.add(match[1]);
  return [...seen];
}

export interface GuidedAnswers {
  role: string;
  audience: string;
  task: string;
  constraints: string;
  format: string;
}

/** The guided editor's answers as a system prompt draft, one paragraph per answer given. */
export function composeGuidedPrompt(answers: GuidedAnswers): string {
  const parts: string[] = [];
  if (answers.role.trim())
    parts.push(`You are ${answers.role.trim().replace(/\.$/, "")}.`);
  if (answers.audience.trim())
    parts.push(`You help ${answers.audience.trim().replace(/\.$/, "")}.`);
  if (answers.task.trim()) parts.push(`Your task: ${answers.task.trim()}`);
  if (answers.constraints.trim()) {
    const lines = answers.constraints
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    parts.push(["Rules:", ...lines.map((l) => `- ${l}`)].join("\n"));
  }
  if (answers.format.trim())
    parts.push(`Answer format: ${answers.format.trim()}`);
  return parts.join("\n\n");
}
