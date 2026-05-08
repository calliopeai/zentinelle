export interface ContentViolationData {
  id: string;
  ruleType: string;
  ruleTypeDisplay: string | null;
  severity: string;
  severityDisplay: string | null;
  enforcement: string;
  matchedPattern: string | null;
  matchedText: string | null;
  matchStart: number | null;
  matchEnd: number | null;
  confidence: number | null;
  category: string | null;
  wasBlocked: boolean;
  wasRedacted: boolean;
  userNotified: boolean;
  adminNotified: boolean;
  createdAt: string;
  ruleName: string | null;
}

export interface ContentScanData {
  id: string;
  contentType: string;
  contentTypeDisplay: string | null;
  statusDisplay: string | null;
  hasViolations: boolean;
  violationCount: number;
  maxSeverity: string | null;
  actionTaken: string | null;
  wasBlocked: boolean;
  wasRedacted: boolean;
  userIdentifier: string | null;
  endpointName: string | null;
  createdAt: string;
}

export interface ContentScansData {
  contentScans: ContentScanData[];
}

export interface ContentViolationsData {
  contentViolations: ContentViolationData[];
}

export interface ContentScansVariables {
  userIdentifier?: string | null;
  endpointId?: string | null;
  hasViolations?: boolean | null;
  contentType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ContentViolationsVariables {
  ruleType?: string | null;
  severity?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}
