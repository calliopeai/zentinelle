export interface ComplianceReportData {
  id: string;
  name: string | null;
  framework: string | null;
  generatedAt: string | null;
  period: string | null;
  status: string | null;
  downloadUrl: string | null;
}

export interface ComplianceReportsData {
  complianceReports: ComplianceReportData[];
}

export interface ComplianceReportsVariables {
  first?: number | null;
  after?: string | null;
}

export interface GenerateComplianceReportPayload {
  success: boolean | null;
  reportUrl: string | null;
  assessmentId: string | null;
  errors: string[];
}

export interface GenerateComplianceReportData {
  generateComplianceReport: GenerateComplianceReportPayload;
}

export interface GenerateComplianceReportVariables {
  framework?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}
