/**
 * The Settings area's data, as its screens take it. GraphQL shapes come from
 * the app's own types (graphql/settings, graphql/api-keys,
 * graphql/legal-holds); REST shapes mirror the admin views under
 * /api/zentinelle/v1/settings (backend/zentinelle/api/views). The routes map
 * what they fetch into these; the screens never fetch.
 */
import { areaSwitcher, type Crumb, type StatusTone } from "@calliopelabs/ui";

import type { ApiKeyData } from "@/graphql/api-keys/hooks";
import type { LegalHoldData } from "@/graphql/legal-holds/types";
import type {
  OrganizationData,
  UpdateOrganizationSettingsInput,
} from "@/graphql/settings/types";

import { ZENTINELLE_NAV } from "../../product";

/** The breadcrumb of a Settings function: the area switcher, from the nav model. */
export function settingsCrumbs(fn: string): Crumb[] {
  return [areaSwitcher(ZENTINELLE_NAV, "settings", fn)];
}

/** What a query hands a screen: its data, or why there is none. */
export interface Loadable<T> {
  data: T | null;
  loading?: boolean;
  error?: { message: string } | null;
  retry?: () => void;
}

/** A save the screen awaits: it throws with the server's reason when `success` is false. */
export type Save<T> = (value: T) => Promise<void>;

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "None";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// General: organization, enforcement, notifications (GetMyOrganization).

export type Organization = OrganizationData;
export type OrganizationUpdate = UpdateOrganizationSettingsInput;

export const ENFORCEMENT_MODES = [
  { value: "monitor", label: "Monitor (record only)" },
  { value: "warn", label: "Warn (record and notify)" },
  { value: "block", label: "Block (enforce)" },
] as const;

// General > Runtime, and Assistant: REST settings/runtime (admin, staged).

export interface RuntimeSettings {
  assistant_model: string;
  assistant_provider: string;
  assistant_allowed_topics: string[];
  policy_copilot_enabled: boolean;
  content_capture_mode: "metadata" | "redacted" | "full" | (string & {});
  taxonomy_extensions: string[];
  control_approval_required: boolean;
  discovery_refresh_seconds: number;
  model_visibility:
    "enabled_only" | "all_registered" | "approved_only" | (string & {});
  default_rate_limit_per_minute: number;
  default_budget_cents: number;
}

export type RuntimeKey = keyof RuntimeSettings;

/** The keys the Assistant screen owns; General > Runtime owns the rest. */
export const ASSISTANT_KEYS = [
  "assistant_provider",
  "assistant_model",
  "assistant_allowed_topics",
  "policy_copilot_enabled",
] as const satisfies readonly RuntimeKey[];

export type RuntimeChangeStatus =
  "draft" | "staged" | "approved" | "applied" | "rejected" | "rolled_back";

export interface RuntimeChange {
  id: string;
  status: RuntimeChangeStatus;
  settings: Partial<RuntimeSettings>;
  base_revision: number;
  created_by: string;
  approved_by: string;
  applied_revision: number | null;
  created_at: string;
  updated_at: string;
}

export interface RuntimeRevision {
  revision: number;
  actor_id?: string | null;
  actor_name?: string | null;
  created_at: string;
}

export interface RuntimeProvenance {
  source: "tenant" | "default" | (string & {});
  changed_at: string | null;
  changed_by: { id?: string | null; name?: string | null } | null;
}

/** GET settings/runtime. */
export interface RuntimeSnapshot {
  settings: RuntimeSettings;
  revision: number;
  revisions: RuntimeRevision[];
  pending: RuntimeChange[];
  effective: Partial<Record<RuntimeKey, RuntimeProvenance>>;
}

/** The moves a staged change takes next (RuntimeSettingsChange.transition). */
export const NEXT_TRANSITIONS: Record<
  RuntimeChangeStatus,
  readonly ("approved" | "applied" | "rejected")[]
> = {
  draft: ["rejected"],
  staged: ["approved", "rejected"],
  approved: ["applied", "rejected"],
  applied: [],
  rejected: [],
  rolled_back: [],
};

export const CHANGE_TONE: Record<RuntimeChangeStatus, StatusTone> = {
  draft: "muted",
  staged: "info",
  approved: "warn",
  applied: "ok",
  rejected: "error",
  rolled_back: "muted",
};

export interface RuntimeActions {
  /** POST settings/runtime/changes: stages the values for approval. */
  onStage: Save<Partial<RuntimeSettings>>;
  /** POST settings/runtime/changes/{id}/transition. */
  onTransition: (
    change: RuntimeChange,
    status: "approved" | "applied" | "rejected",
  ) => Promise<void>;
  /** POST settings/runtime/rollback, with the revision on screen as the base. */
  onRollback: (revision: number, expectedRevision: number) => Promise<void>;
}

// API keys (ApiKeys, admin).

export type ApiKey = ApiKeyData;

/** Must match APIKey.SCOPES on the backend; anything else is refused. */
export const API_KEY_SCOPES = [
  {
    value: "read",
    label: "Read",
    description: "Read policies, events and usage.",
  },
  {
    value: "write",
    label: "Write",
    description: "Read, and change policies and rules.",
  },
  {
    value: "admin",
    label: "Full access",
    description: "Everything, including settings and keys.",
  },
] as const;

export const API_KEY_TONE: Record<string, StatusTone> = {
  active: "ok",
  revoked: "error",
  expired: "muted",
};

export interface CreatedApiKey {
  apiKey: string;
  keyPrefix: string;
  name: string;
}

// Integrations: REST settings/astrolift (admin).

export interface AstroliftCluster {
  id: string;
  cluster_id: string;
  provider: string;
  region: string;
  status: "pending" | "active" | "stale" | "revoked";
  health: string;
  last_seen_at: string | null;
  gateway_version: string;
  tenant_ids: string[];
  revoked_at: string | null;
}

export interface AstroliftInstall {
  id: string;
  name: string;
  base_url: string;
  status: "connected" | "disconnected";
  tenant_ids: string[];
  connected_at: string;
  last_used_at: string | null;
  clusters: AstroliftCluster[];
}

export interface EnrollmentCode {
  code: string;
  expires_at: string;
}

export const ASTROLIFT_TONE: Record<string, StatusTone> = {
  connected: "ok",
  active: "ok",
  pending: "info",
  stale: "warn",
  revoked: "error",
  disconnected: "error",
};

export const HEALTH_TONE: Record<string, StatusTone> = {
  healthy: "ok",
  degraded: "warn",
  unhealthy: "error",
};

// Data retention: RetentionData (the query inline in app/(app)/retention) and LegalHolds.

/** The fields RetentionData selects of retentionPolicies. */
export interface RetentionPolicy {
  id: string;
  name: string;
  description: string | null;
  entityType: string;
  retentionDays: number;
  minimumRetentionDays: number | null;
  expirationAction: string;
  expirationActionDisplay: string | null;
  entityTypeDisplay: string | null;
  complianceRequirement: string | null;
  complianceRequirementDisplay: string | null;
  enabled: boolean;
  priority: number;
}

export interface RetentionPolicyInput {
  name: string;
  description: string;
  entityType: string;
  retentionDays: number;
  minimumRetentionDays: number | null;
  expirationAction: string;
  complianceRequirement: string;
  priority: number;
  enabled: boolean;
}

export const RETENTION_ENTITY_TYPES = [
  { value: "all", label: "All data" },
  { value: "events", label: "Telemetry events" },
  { value: "interactions", label: "AI interactions" },
  { value: "scans", label: "Content scans" },
  { value: "audit_logs", label: "Audit logs" },
  { value: "sessions", label: "User sessions" },
  { value: "secrets", label: "Secret access logs" },
  { value: "usage_data", label: "Usage and billing data" },
] as const;

export const EXPIRATION_ACTIONS = [
  { value: "delete", label: "Delete permanently" },
  { value: "anonymize", label: "Anonymize" },
  { value: "archive", label: "Archive to cold storage" },
  { value: "flag", label: "Flag for review" },
] as const;

export const COMPLIANCE_REQUIREMENTS = [
  { value: "none", label: "No specific requirement" },
  { value: "gdpr", label: "GDPR (right to erasure)" },
  { value: "ccpa", label: "CCPA (data deletion)" },
  { value: "hipaa", label: "HIPAA (6 year minimum)" },
  { value: "sox", label: "SOX (7 year minimum)" },
  { value: "pci_dss", label: "PCI DSS (1 year)" },
  { value: "soc2", label: "SOC 2" },
  { value: "custom", label: "Custom" },
] as const;

export type LegalHold = LegalHoldData;

export const HOLD_TONE: Record<string, StatusTone> = {
  active: "warn",
  released: "muted",
  expired: "muted",
};

export interface LegalHoldInput {
  name: string;
  description: string;
  referenceNumber: string;
  holdType: string;
  appliesToAll: boolean;
  /** When the hold does not cover all data: the kinds it covers. */
  entityTypes: string[];
  custodianEmail: string;
  effectiveDate: string;
  expirationDate: string;
}

export function labelOf(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
  display?: string | null,
): string {
  return (
    display ?? options.find((o) => o.value === value)?.label ?? value ?? "None"
  );
}

/** Where a runtime value comes from, in a line under its field. */
export function provenanceHint(
  p: RuntimeProvenance | undefined,
): string | undefined {
  if (!p) return undefined;
  if (p.source === "default") return "The default; never changed here.";
  const who = p.changed_by?.name || p.changed_by?.id;
  const when = p.changed_at ? formatDate(p.changed_at) : null;
  return ["Set for this organization", who && `by ${who}`, when && `on ${when}`]
    .filter(Boolean)
    .join(" ")
    .concat(".");
}

/** The keys of `next` that differ from `base`, as a staged change carries them. */
export function changedKeys<T extends object>(base: T, next: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (JSON.stringify(base[key]) !== JSON.stringify(next[key]))
      out[key] = next[key];
  }
  return out;
}

export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** The scope of a hold, in a few words. */
export function holdScope(
  hold: Pick<LegalHold, "appliesToAll" | "entityTypes" | "userIdentifiers">,
): string {
  if (hold.appliesToAll) return "All data";
  const parts = hold.entityTypes.map((t) => labelOf(RETENTION_ENTITY_TYPES, t));
  if (hold.userIdentifiers.length)
    parts.push(
      `${hold.userIdentifiers.length} user${hold.userIdentifiers.length === 1 ? "" : "s"}`,
    );
  return parts.join(", ") || "Nothing selected";
}
