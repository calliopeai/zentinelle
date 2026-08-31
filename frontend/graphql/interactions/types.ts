export interface InteractionLogData {
  id: string;
  interactionType: string | null;
  interactionTypeDisplay: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokens: number | null;
  estimatedCostUsd: string | number | null;
  latencyMs: number | null;
  userIdentifier: string | null;
  endpointName: string | null;
  hasViolations: boolean | null;
  violationCount: number | null;
  wasBlocked: boolean | null;
  occurredAt: string;
}

export interface InteractionLogListData {
  interactionLogs: InteractionLogData[];
}

export interface InteractionLogListVariables {
  endpointId?: string | null;
  userIdentifier?: string | null;
  aiProvider?: string | null;
  hasViolations?: boolean | null;
  startDate?: string | null;
  endDate?: string | null;
}
