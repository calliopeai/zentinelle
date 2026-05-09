export interface AgentGroupData {
  id: string;
  name: string;
  slug: string;
  description: string;
  tier: string;
  color: string;
  createdAt: string;
  agentCount: number | null;
}

export interface AgentGroupListData {
  agentGroups: AgentGroupData[];
}

export interface AgentGroupListVariables {
  search?: string | null;
  tier?: string | null;
}

export interface CreateAgentGroupVariables {
  name: string;
  description?: string | null;
  tier?: string | null;
  color?: string | null;
}

export interface CreateAgentGroupPayload {
  group: AgentGroupData | null;
  errors: string[];
}

export interface UpdateAgentGroupVariables {
  id: string;
  name?: string | null;
  description?: string | null;
  tier?: string | null;
  color?: string | null;
}

export interface UpdateAgentGroupPayload {
  group: AgentGroupData | null;
  errors: string[];
}

export interface DeleteAgentGroupVariables {
  id: string;
}

export interface DeleteAgentGroupPayload {
  success: boolean | null;
  errors: string[];
}

export interface AssignAgentToGroupVariables {
  agentId: string;
  groupId: string;
}

export interface AssignAgentToGroupPayload {
  success: boolean | null;
  errors: string[];
}
