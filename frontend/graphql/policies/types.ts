export interface PolicyData {
  id: string;
  name: string;
  description: string;
  policyType: string;
  scopeType: string;
  config: Record<string, unknown> | null;
  priority: number;
  enforcement: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  scopeName: string | null;
  createdByUsername: string | null;
}

export interface PolicyListData {
  policies: PolicyData[];
}

export interface PolicyDetailData {
  policy: PolicyData | null;
}

export interface PolicyListVariables {
  search?: string | null;
  policyType?: string | null;
  scopeType?: string | null;
}

export interface PolicyDetailVariables {
  id: string;
}

export interface PolicyTypeOption {
  value: string | null;
  label: string | null;
  description: string | null;
  category: string | null;
  configSchema: Record<string, unknown> | null;
}

export interface ScopeTypeOption {
  value: string | null;
  label: string | null;
}

export interface EnforcementOption {
  value: string | null;
  label: string | null;
  description: string | null;
}

export interface PolicyOptions {
  policyTypes: PolicyTypeOption[];
  scopeTypes: ScopeTypeOption[];
  enforcementLevels: EnforcementOption[];
}

export interface PolicyOptionsData {
  policyOptions: PolicyOptions | null;
}

export interface CreatePolicyInput {
  name: string;
  description?: string | null;
  policyType: string;
  scopeType?: string | null;
  scopeEndpointId?: string | null;
  scopeUserId?: string | null;
  config?: Record<string, unknown> | null;
  priority?: number | null;
  enforcement?: string | null;
  enabled?: boolean | null;
}

export interface CreatePolicyPayload {
  policy: PolicyData | null;
  success: boolean | null;
  error: string | null;
}

export interface UpdatePolicyInput {
  id: string;
  name?: string | null;
  description?: string | null;
  config?: Record<string, unknown> | null;
  priority?: number | null;
  enforcement?: string | null;
  enabled?: boolean | null;
}

export interface UpdatePolicyPayload {
  policy: PolicyData | null;
  success: boolean | null;
  error: string | null;
}

export interface DeletePolicyPayload {
  success: boolean | null;
  error: string | null;
}

export interface TogglePolicyEnabledPayload {
  policy: PolicyData | null;
  success: boolean | null;
  error: string | null;
}
