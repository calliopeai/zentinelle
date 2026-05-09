export interface AgentGroup {
  id: string;
  name: string;
  slug: string;
  description: string;
  tier: string;
  color: string;
  createdAt: string;
  agentCount: number | null;
}

export interface EndpointData {
  id: string;
  agentId: string;
  agentType: string;
  name: string;
  description: string;
  status: string;
  health: string;
  capabilities: string[];
  metadata: Record<string, unknown> | null;
  lastHeartbeat: string | null;
  apiKeyPrefix: string | null;
  createdAt: string;
  updatedAt: string;
  deploymentName: string | null;
  agentGroup: AgentGroup | null;
}

export interface EndpointListData {
  endpoints: EndpointData[];
}

export interface EndpointDetailData {
  endpoint: EndpointData | null;
}

export interface EndpointListVariables {
  search?: string | null;
  status?: string | null;
  agentType?: string | null;
}

export interface EndpointDetailVariables {
  id: string;
}

export interface CreateAgentEndpointInput {
  name: string;
  agentId?: string | null;
  agentType: string;
  capabilities?: string[] | null;
  metadata?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
}

export interface CreateAgentEndpointPayload {
  endpoint: EndpointData | null;
  apiKey: string | null;
  success: boolean | null;
  error: string | null;
}

export interface DeleteAgentEndpointPayload {
  success: boolean | null;
  error: string | null;
}

export interface SuspendAgentEndpointPayload {
  endpoint: EndpointData | null;
  success: boolean | null;
  error: string | null;
}

export interface ActivateAgentEndpointPayload {
  endpoint: EndpointData | null;
  success: boolean | null;
  error: string | null;
}

export interface UpdateAgentEndpointInput {
  id: string;
  name?: string | null;
  agentType?: string | null;
  capabilities?: string[] | null;
  metadata?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
}

export interface UpdateAgentEndpointPayload {
  endpoint: EndpointData | null;
  success: boolean | null;
  error: string | null;
}

export interface UpdateEndpointStatusPayload {
  endpoint: Pick<EndpointData, "id" | "status"> | null;
  success: boolean | null;
  error: string | null;
}
