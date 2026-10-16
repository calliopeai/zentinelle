/**
 * The Policies area's words and tones, once: the backend's enums
 * (backend/zentinelle/models/policy.py, actions.py, compliance.py,
 * policy_change.py) as people read them, and each state's StatusTone.
 */
import type { StatusTone } from "@calliopelabs/ui";

import type { SelectOption } from "../../shared/Select";

export const POLICY_TYPE_LABEL: Record<string, string> = {
  system_prompt: "System prompt",
  ai_guardrail: "AI guardrail",
  prompt_injection: "Prompt injection",
  model_restriction: "Model restriction",
  context_limit: "Context limit",
  output_filter: "Output filter",
  agent_capability: "Agent capability",
  agent_memory: "Agent memory",
  agent_delegation: "Agent delegation",
  human_oversight: "Human oversight",
  resource_quota: "Resource quota",
  budget_limit: "Budget limit",
  rate_limit: "Rate limit",
  behavioral_baseline: "Behavioral baseline",
  tool_permission: "Tool permission",
  network_policy: "Network policy",
  secret_access: "Secret access",
  data_access: "Data access",
  audit_policy: "Audit policy",
  session_policy: "Session policy",
  session_quota: "Session quota",
  data_retention: "Data retention",
  safety_settings: "Safety settings (Gemini)",
  multimodal_policy: "Multimodal content",
};

/** The views by type the IA names first (§4.1): Network, Budgets, Oversight. */
export const TYPE_VIEWS: readonly SelectOption[] = [
  { value: "", label: "All types" },
  { value: "network_policy", label: "Network" },
  { value: "budget_limit", label: "Budgets" },
  { value: "human_oversight", label: "Oversight" },
];

export function typeLabel(type: string): string {
  return POLICY_TYPE_LABEL[type] ?? type.replaceAll("_", " ");
}

/** Every type as a filter option: the quick views first, then the rest by name. */
export function typeOptions(): SelectOption[] {
  const quick = new Set(TYPE_VIEWS.map((v) => v.value));
  return [
    ...TYPE_VIEWS,
    ...Object.entries(POLICY_TYPE_LABEL)
      .filter(([value]) => !quick.has(value))
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

/** Scope tiers from broadest to narrowest: the order inheritance resolves in. */
export const SCOPE_ORDER = [
  "organization",
  "sub_organization",
  "deployment",
  "endpoint",
  "user",
] as const;

export const SCOPE_LABEL: Record<string, string> = {
  organization: "Organization",
  sub_organization: "Team or division",
  deployment: "Deployment",
  endpoint: "Agent",
  user: "User",
};

export function scopeLabel(scope: string): string {
  return SCOPE_LABEL[scope] ?? scope.replaceAll("_", " ");
}

export function scopeRank(scope: string): number {
  const index = (SCOPE_ORDER as readonly string[]).indexOf(scope);
  return index === -1 ? SCOPE_ORDER.length : index;
}

export const SCOPE_OPTIONS: readonly SelectOption[] = [
  { value: "", label: "All scopes" },
  ...SCOPE_ORDER.map((value) => ({ value, label: SCOPE_LABEL[value] })),
];

/** The mode is the ceiling on the action (#396). */
export const ENFORCEMENT_TONE: Record<string, StatusTone> = {
  enforce: "ok",
  audit: "info",
  disabled: "muted",
};

export const ENFORCEMENT_LABEL: Record<string, string> = {
  enforce: "Enforce",
  audit: "Audit only",
  disabled: "Disabled",
};

/** actions.py, the policy's response when it matches. */
export const ACTION_OPTIONS: readonly SelectOption[] = [
  { value: "log", label: "Log" },
  { value: "alert", label: "Alert" },
  { value: "warn", label: "Warn" },
  { value: "steer", label: "Steer" },
  { value: "redact", label: "Redact" },
  { value: "require_approval", label: "Require approval" },
  { value: "block", label: "Block" },
];

export const BLOCK_LEVEL_OPTIONS: readonly SelectOption[] = [
  { value: "tool_call", label: "Block the tool call" },
  { value: "turn", label: "Cancel the turn" },
  { value: "revoke_key", label: "Revoke the gateway key" },
];

export function actionLabel(action: string): string {
  return ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
}

export const SEVERITY_TONE: Record<string, StatusTone> = {
  info: "muted",
  low: "info",
  medium: "warn",
  high: "error",
  critical: "error",
};

export const SEVERITY_OPTIONS: readonly SelectOption[] = [
  { value: "", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Info" },
];

/** compliance.py ContentRule.RuleType. */
export const RULE_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: "secret_detection", label: "Secrets and credentials" },
  { value: "pii_detection", label: "PII" },
  { value: "phi_detection", label: "PHI" },
  { value: "profanity_filter", label: "Profanity" },
  { value: "custom_pattern", label: "Custom pattern (regex)" },
  { value: "keyword_block", label: "Keyword blocklist" },
  { value: "prompt_injection", label: "Prompt injection" },
  { value: "jailbreak_attempt", label: "Jailbreak attempt" },
  { value: "off_topic", label: "Off topic" },
  { value: "policy_violation", label: "Policy violation" },
  { value: "cost_threshold", label: "Cost threshold" },
  { value: "rate_anomaly", label: "Usage rate anomaly" },
  { value: "token_limit", label: "Token limit" },
];

export const RULE_ACTION_OPTIONS: readonly SelectOption[] = [
  { value: "block", label: "Block" },
  { value: "warn", label: "Warn" },
  { value: "log_only", label: "Log only" },
  { value: "redact", label: "Redact" },
  { value: "require_approval", label: "Require approval" },
];

export const SCAN_MODE_OPTIONS: readonly SelectOption[] = [
  { value: "realtime", label: "Real time (inline)" },
  { value: "async", label: "In the background" },
  { value: "both", label: "Both" },
];

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

export const CHANGE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  validated: "Validated",
  staged: "Staged",
  approved: "Approved",
  promoted: "Promoted",
  rolled_back: "Rolled back",
  rejected: "Rejected",
};

/** The reviewed state machine (PolicyChangeSet.transition), and who may take each step. */
export const CHANGE_TRANSITIONS: Record<
  string,
  readonly {
    to: string;
    label: string;
    admin: boolean;
    destructive?: boolean;
  }[]
> = {
  draft: [
    { to: "validated", label: "Validate", admin: false },
    { to: "rejected", label: "Reject", admin: false, destructive: true },
  ],
  validated: [
    { to: "staged", label: "Stage", admin: false },
    { to: "rejected", label: "Reject", admin: false, destructive: true },
  ],
  staged: [
    { to: "approved", label: "Approve", admin: true },
    { to: "rejected", label: "Reject", admin: false, destructive: true },
  ],
  approved: [
    { to: "promoted", label: "Promote", admin: true },
    { to: "rejected", label: "Reject", admin: false, destructive: true },
  ],
  promoted: [
    { to: "rolled_back", label: "Roll back", admin: true, destructive: true },
  ],
  rolled_back: [],
  rejected: [],
};

export const CHANGE_STATUS_OPTIONS: readonly SelectOption[] = [
  { value: "", label: "All statuses" },
  ...Object.entries(CHANGE_STATUS_LABEL).map(([value, label]) => ({
    value,
    label,
  })),
];

/** system_prompt.py SystemPrompt.PromptType. */
export const PROMPT_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: "system", label: "System prompt" },
  { value: "persona", label: "Persona or role" },
  { value: "task", label: "Task template" },
  { value: "chain", label: "Prompt chain" },
  { value: "few_shot", label: "Few-shot examples" },
  { value: "safety", label: "Safety and guardrails" },
  { value: "format", label: "Output format" },
];

export const PROMPT_STATUS_TONE: Record<string, StatusTone> = {
  draft: "muted",
  active: "ok",
  archived: "muted",
};

/** Dates as the console shows them: day and time, in the reader's locale. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
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

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
