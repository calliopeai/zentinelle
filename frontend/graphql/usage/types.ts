export interface UsageSummary {
  totalApiCalls: number | null;
  totalTokens: number | null;
  totalCost: number | null;
  activeAgents: number | null;
  storageUsedMb: number | null;
}

export interface UsageTimeSeriesPoint {
  date: string | null;
  apiCalls: number | null;
  tokens: number | null;
  cost: number | null;
}

export interface UsageByAgent {
  agentId: string | null;
  agentName: string | null;
  apiCalls: number | null;
  tokens: number | null;
  cost: number | null;
}

export interface UsageByEndpoint {
  endpoint: string | null;
  apiCalls: number | null;
  avgLatencyMs: number | null;
}

export interface UsageMetricsData {
  usageMetrics: {
    summary: UsageSummary | null;
    timeSeries: UsageTimeSeriesPoint[] | null;
    byAgent: UsageByAgent[] | null;
    byEndpoint: UsageByEndpoint[] | null;
  } | null;
}

export interface UsageMetricsVariables {
  startDate?: string | null;
  endDate?: string | null;
}
