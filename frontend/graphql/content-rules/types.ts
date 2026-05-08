export interface ContentRuleData {
  id: string;
  name: string;
  description: string;
  ruleType: string;
  ruleTypeDisplay: string | null;
  config: Record<string, unknown> | null;
  severity: string;
  severityDisplay: string | null;
  enforcement: string;
  enforcementDisplay: string | null;
  scanMode: string;
  scanInput: boolean;
  scanOutput: boolean;
  scanContext: boolean;
  scopeType: string;
  scopeName: string | null;
  priority: number;
  enabled: boolean;
  notifyUser: boolean;
  notifyAdmins: boolean;
  webhookUrl: string;
  createdAt: string;
  updatedAt: string;
  violationCount: number | null;
}

export interface ContentRuleListData {
  contentRules: ContentRuleData[];
}

export interface ContentRuleListVariables {
  search?: string | null;
  ruleType?: string | null;
  severity?: string | null;
  enforcement?: string | null;
  enabled?: boolean | null;
}

export interface ContentRuleDetailData {
  contentRule: ContentRuleData | null;
}

export interface ToggleContentRuleEnabledPayload {
  success: boolean | null;
  ruleId: string | null;
}

export interface DeleteContentRulePayload {
  success: boolean | null;
  errors: string[];
}

export interface CreateContentRuleInput {
  name: string;
  description?: string | null;
  ruleType: string;
  severity?: string | null;
  enforcement?: string | null;
  scanMode?: string | null;
  scanInput?: boolean | null;
  scanOutput?: boolean | null;
  scanContext?: boolean | null;
  scopeType?: string | null;
  priority?: number | null;
  enabled?: boolean | null;
  notifyUser?: boolean | null;
  notifyAdmins?: boolean | null;
  webhookUrl?: string | null;
  config?: Record<string, unknown> | null;
}

export interface CreateContentRulePayload {
  success: boolean | null;
  ruleId: string | null;
  errors: string[];
}

export interface UpdateContentRuleInput {
  id: string;
  name?: string | null;
  description?: string | null;
  ruleType?: string | null;
  severity?: string | null;
  enforcement?: string | null;
  scanMode?: string | null;
  scanInput?: boolean | null;
  scanOutput?: boolean | null;
  scanContext?: boolean | null;
  scopeType?: string | null;
  priority?: number | null;
  enabled?: boolean | null;
  notifyUser?: boolean | null;
  notifyAdmins?: boolean | null;
  webhookUrl?: string | null;
  config?: Record<string, unknown> | null;
}

export interface UpdateContentRulePayload {
  success: boolean | null;
  ruleId: string | null;
  errors: string[];
}
