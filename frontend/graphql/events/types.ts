export interface EventData {
  id: string;
  eventType: string;
  eventCategory: string;
  status: string;
  payload: Record<string, unknown> | null;
  userIdentifier: string | null;
  occurredAt: string;
  processedAt: string | null;
  correlationId: string | null;
  endpointName: string | null;
}

export interface EventListData {
  events: EventData[];
}

export interface EventListVariables {
  eventType?: string | null;
  category?: string | null;
  endpointId?: string | null;
  userId?: string | null;
}

export interface AuditActor {
  id: string | null;
  email: string | null;
  name: string | null;
  type: string | null;
}

export interface AuditChange {
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
}

export interface AuditLogData {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  metadata: Record<string, unknown> | null;
  apiKeyPrefix: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
  actor: AuditActor | null;
  resource: string | null;
  status: string | null;
  details: Record<string, unknown> | null;
  changes: AuditChange[] | null;
}

export interface AuditLogListData {
  auditLogs: AuditLogData[];
}

export interface AuditLogListVariables {
  search?: string | null;
  actor?: string | null;
  action?: string | null;
  resource?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface AuditTimelinePoint {
  bucket: string | null;
  eventType: string | null;
  count: number | null;
}

export interface AuditEventCount {
  eventType: string | null;
  count: number | null;
}

export interface AuditTopAgent {
  agentId: string | null;
  eventCount: number | null;
}

export interface AuditAnalyticsData {
  auditAnalytics: {
    timeline: AuditTimelinePoint[] | null;
    byType: AuditEventCount[] | null;
    topAgents: AuditTopAgent[] | null;
  } | null;
}

export interface AuditAnalyticsVariables {
  days?: number;
}
