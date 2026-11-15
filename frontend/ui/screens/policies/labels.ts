/**
 * The Policies area's words and tones, once: the backend's enums
 * (backend/zentinelle/models/policy.py, actions.py, compliance.py,
 * policy_change.py), each state's StatusTone, and `usePolicyLabels()` for
 * how people read them, from the `policies.labels` messages.
 */
import type { SelectOption, StatusTone } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { ANY } from "../../shared/select-any";

/** Policy.PolicyType; named by `policies.labels.types`. */
export const POLICY_TYPES = [
  "system_prompt",
  "ai_guardrail",
  "prompt_injection",
  "model_restriction",
  "context_limit",
  "output_filter",
  "agent_capability",
  "agent_memory",
  "agent_delegation",
  "human_oversight",
  "resource_quota",
  "budget_limit",
  "rate_limit",
  "behavioral_baseline",
  "tool_permission",
  "network_policy",
  "secret_access",
  "data_access",
  "audit_policy",
  "session_policy",
  "session_quota",
  "data_retention",
  "safety_settings",
  "multimodal_policy",
] as const;

/** The views by type the IA names first (§4.1): Network, Budgets, Oversight. */
export const TYPE_VIEWS = [
  "",
  "network_policy",
  "budget_limit",
  "human_oversight",
] as const;

/** Scope tiers from broadest to narrowest: the order inheritance resolves in. */
export const SCOPE_ORDER = [
  "organization",
  "sub_organization",
  "deployment",
  "endpoint",
  "user",
] as const;

export function scopeRank(scope: string): number {
  const index = (SCOPE_ORDER as readonly string[]).indexOf(scope);
  return index === -1 ? SCOPE_ORDER.length : index;
}

/** The mode is the ceiling on the action (#396). */
export const ENFORCEMENT_TONE: Record<string, StatusTone> = {
  enforce: "ok",
  audit: "info",
  disabled: "muted",
};

/** actions.py, the policy's response when it matches. */
export const ACTIONS = [
  "log",
  "alert",
  "warn",
  "steer",
  "redact",
  "require_approval",
  "block",
] as const;

export const BLOCK_LEVELS = ["tool_call", "turn", "revoke_key"] as const;

export const SEVERITY_TONE: Record<string, StatusTone> = {
  info: "muted",
  low: "info",
  medium: "warn",
  high: "error",
  critical: "error",
};

export const SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

/** compliance.py ContentRule.RuleType. */
export const RULE_TYPES = [
  "secret_detection",
  "pii_detection",
  "phi_detection",
  "profanity_filter",
  "custom_pattern",
  "keyword_block",
  "prompt_injection",
  "jailbreak_attempt",
  "off_topic",
  "policy_violation",
  "cost_threshold",
  "rate_anomaly",
  "token_limit",
] as const;

export const RULE_ACTIONS = [
  "block",
  "warn",
  "log_only",
  "redact",
  "require_approval",
] as const;

export const SCAN_MODES = ["realtime", "async", "both"] as const;

/** policy_change.py PolicyChangeSet.Status. */
export const CHANGE_STATUS_TONE: Record<string, StatusTone> = {
  draft: "muted",
  validated: "info",
  staged: "info",
  approved: "warn",
  promoted: "ok",
  rolled_back: "muted",
  rejected: "error",
};

/**
 * The reviewed state machine (PolicyChangeSet.transition), and who may take
 * each step; each step is named by `policies.labels.transitions`.
 */
export const CHANGE_TRANSITIONS: Record<
  string,
  readonly { to: string; admin: boolean; destructive?: boolean }[]
> = {
  draft: [
    { to: "validated", admin: false },
    { to: "rejected", admin: false, destructive: true },
  ],
  validated: [
    { to: "staged", admin: false },
    { to: "rejected", admin: false, destructive: true },
  ],
  staged: [
    { to: "approved", admin: true },
    { to: "rejected", admin: false, destructive: true },
  ],
  approved: [
    { to: "promoted", admin: true },
    { to: "rejected", admin: false, destructive: true },
  ],
  promoted: [{ to: "rolled_back", admin: true, destructive: true }],
  rolled_back: [],
  rejected: [],
};

/** system_prompt.py SystemPrompt.PromptType. */
export const PROMPT_TYPES = [
  "system",
  "persona",
  "task",
  "chain",
  "few_shot",
  "safety",
  "format",
] as const;

export const PROMPT_STATUS_TONE: Record<string, StatusTone> = {
  draft: "muted",
  active: "ok",
  archived: "muted",
};

const words = (value: string) => value.replaceAll("_", " ");

/** Dates as the console shows them: day and time, in the reader's locale; `never` when absent. */
function dateTime(value: string | null | undefined, never: string): string {
  if (!value) return never;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function date(value: string | null | undefined, never: string): string {
  if (!value) return never;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The area's value names, options and tab rows in the reader's language. */
export function usePolicyLabels() {
  const t = useTranslations("policies.labels");
  const named = (group: string, value: string) =>
    t.has(`${group}.${value}`) ? t(`${group}.${value}`) : words(value);
  const options = (group: string, values: readonly string[]): SelectOption[] =>
    values.map((value) => ({ value, label: t(`${group}.${value}`) }));
  const typeLabel = (type: string) => named("types", type);
  const quick = new Set<string>(TYPE_VIEWS);
  return {
    typeLabel,
    scopeLabel: (scope: string) => named("scopes", scope),
    actionLabel: (action: string) => named("actions", action),
    enforcementLabel: (mode: string) => named("enforcement", mode),
    blockLevelLabel: (level: string) => named("blockLevels", level),
    changeStatusLabel: (status: string) => named("changeStatuses", status),
    transitionLabel: (to: string) => named("transitions", to),
    promptTypeLabel: (type: string) => named("promptTypes", type),
    ruleTypeLabel: (type: string) => named("ruleTypes", type),
    /** Every type as a filter option: the quick views first, then the rest by name. */
    typeOptions: (): SelectOption[] => [
      ...TYPE_VIEWS.map((value) => ({
        value: value || ANY,
        label: t(`typeViews.${value || "all"}`),
      })),
      ...POLICY_TYPES.filter((value) => !quick.has(value))
        .map((value) => ({ value, label: typeLabel(value) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    SCOPE_OPTIONS: [
      { value: ANY, label: t("allScopes") },
      ...options("scopes", SCOPE_ORDER),
    ],
    ACTION_OPTIONS: options("actions", ACTIONS),
    BLOCK_LEVEL_OPTIONS: options("blockLevels", BLOCK_LEVELS),
    SEVERITY_OPTIONS: [
      { value: ANY, label: t("allSeverities") },
      ...options("severities", SEVERITIES),
    ],
    RULE_TYPE_OPTIONS: options("ruleTypes", RULE_TYPES),
    RULE_ACTION_OPTIONS: options("ruleActions", RULE_ACTIONS),
    SCAN_MODE_OPTIONS: options("scanModes", SCAN_MODES),
    CHANGE_STATUS_OPTIONS: [
      { value: ANY, label: t("allStatuses") },
      ...options("changeStatuses", Object.keys(CHANGE_STATUS_TONE)),
    ],
    PROMPT_TYPE_OPTIONS: options("promptTypes", PROMPT_TYPES),
    formatDateTime: (value: string | null | undefined) =>
      dateTime(value, t("never")),
    formatDate: (value: string | null | undefined) => date(value, t("never")),
    tabs: {
      workspace: (key: string) => t(`tabs.workspace.${key}`),
      rules: (key: string) => t(`tabs.rules.${key}`),
      policy: (key: string) => t(`tabs.policy.${key}`),
    },
  };
}

export type PolicyLabels = ReturnType<typeof usePolicyLabels>;
