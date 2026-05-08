export interface ComplianceAlertData {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  description: string;
  userIdentifier: string | null;
  violationCount: number | null;
  firstViolationAt: string | null;
  lastViolationAt: string | null;
  status: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  alertTypeDisplay: string | null;
  severityDisplay: string | null;
  statusDisplay: string | null;
  endpointName: string | null;
  acknowledgedByUsername: string | null;
  resolvedByUsername: string | null;
}

export interface ComplianceAlertsData {
  complianceAlerts: ComplianceAlertData[];
}

export interface ComplianceAlertsVariables {
  status?: string | null;
  severity?: string | null;
  alertType?: string | null;
}

export interface AcknowledgeComplianceAlertResult {
  acknowledgeComplianceAlert: {
    success: boolean | null;
    alertId: string | null;
  };
}

export interface ResolveComplianceAlertResult {
  resolveComplianceAlert: {
    success: boolean | null;
    alertId: string | null;
  };
}

export interface DismissComplianceAlertResult {
  dismissComplianceAlert: {
    success: boolean | null;
    alertId: string | null;
  };
}
