/**
 * The REST payloads of this area, as the backend serializes them. There is
 * no shared type for them in graphql/: the pages that read them today
 * declare them inline. Sources:
 * - effective policy: `app/(app)/policies/effective/page.tsx`, REST `effective-policy?endpoint=`
 * - history and diff: `app/(app)/policies/history-dialog.tsx`, REST `policies/{id}/history/`, `diff/`
 * - change sets: `backend/zentinelle/api/views/policy_change.py` `_serialize`, REST `policy-changes`
 */
export interface EffectivePolicyEntry {
  id: string;
  name: string;
  type: string;
  scope: string;
  priority: number;
  enforcement: string;
  config: Record<string, unknown> | null;
}

export interface ResolvedConfig {
  system_prompt: string | null;
  ai_guardrails: Record<string, unknown>;
  tool_permissions: {
    allowed: string[];
    denied: string[];
    requires_approval: string[];
  };
  rate_limits: Record<string, unknown>;
  budget_limits: Record<string, unknown>;
  resource_quotas: Record<string, unknown>;
  secret_access: { allowed_bundles: string[]; denied_providers: string[] };
}

export interface EffectivePolicyResponse {
  policies: EffectivePolicyEntry[];
  resolved: ResolvedConfig;
}

export interface PolicyVersion {
  id: number;
  policy_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  changed_by: string | null;
  changed_at: string | null;
  change_summary: string | null;
}

export interface PolicyDiff {
  policy_id: string;
  from_version: number;
  to_version: number;
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, unknown>;
}

export interface PolicyChangeSet {
  id: string;
  tenant_id: string;
  status: string;
  title: string;
  description: string;
  changes: unknown[];
  base_versions: Record<string, unknown>;
  validation: Record<string, unknown>;
  applied_snapshots: unknown[];
  target_selectors: Record<string, unknown>;
  created_by: string;
  reviewed_by: string;
  approved_by: string;
  created_at: string | null;
  updated_at: string | null;
  staged_at: string | null;
  promoted_at: string | null;
  rolled_back_at: string | null;
}
