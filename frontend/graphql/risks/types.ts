export interface RiskData {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  likelihood: number;
  impact: number;
  mitigationPlan: string | null;
  mitigationStatus: string | null;
  residualLikelihood: number | null;
  residualImpact: number | null;
  lastReviewedAt: string | null;
  nextReviewDate: string | null;
  tags: string[];
  externalReferences: Record<string, unknown> | null;
  identifiedAt: string;
  createdAt: string;
  updatedAt: string;
  categoryDisplay: string | null;
  statusDisplay: string | null;
  likelihoodDisplay: string | null;
  impactDisplay: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  residualRiskScore: number | null;
  ownerName: string | null;
  lastReviewedByName: string | null;
  incidentCount: number | null;
}

export interface RiskListData {
  risks: RiskData[];
}

export interface RiskDetailData {
  risk: RiskData | null;
}

export interface RiskListVariables {
  search?: string | null;
  category?: string | null;
  status?: string | null;
  riskLevel?: string | null;
}

export interface RiskDetailVariables {
  id: string;
}

export interface IncidentData {
  id: string;
  title: string;
  description: string;
  incidentType: string;
  severity: string;
  status: string;
  affectedUser: string | null;
  affectedUserCount: number | null;
  rootCause: string | null;
  impactAssessment: string | null;
  resolution: string | null;
  remediationActions: string | null;
  lessonsLearned: string | null;
  occurredAt: string | null;
  detectedAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  incidentTypeDisplay: string | null;
  severityDisplay: string | null;
  statusDisplay: string | null;
  slaStatus: string | null;
  timeToAcknowledgeSeconds: number | null;
  timeToResolveSeconds: number | null;
  assignedToName: string | null;
  reportedByName: string | null;
  endpointName: string | null;
  deploymentName: string | null;
  relatedRiskName: string | null;
  triggeringPolicyName: string | null;
}

export interface IncidentListData {
  incidents: IncidentData[];
}

export interface IncidentListVariables {
  search?: string | null;
  incidentType?: string | null;
  severity?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface RiskByLevel {
  level: string | null;
  count: number;
}

export interface RiskByCategory {
  category: string | null;
  count: number;
}

export interface IncidentBySeverity {
  severity: string | null;
  count: number;
}

export interface IncidentByStatus {
  status: string | null;
  count: number;
}

export interface RiskStatsData {
  riskStats: {
    totalRisks: number;
    openRisks: number;
    criticalRisks: number;
    highRisks: number;
    risksByLevel: RiskByLevel[];
    risksByCategory: RiskByCategory[];
    totalIncidents: number;
    openIncidents: number;
    incidentsToday: number;
    incidentsBySeverity: IncidentBySeverity[];
    incidentsByStatus: IncidentByStatus[];
    slaMetCount: number;
    slaBreachedCount: number;
  } | null;
}

export interface CreateRiskInput {
  name: string;
  description: string;
  category?: string | null;
  status?: string | null;
  likelihood?: number | null;
  impact?: number | null;
  mitigationPlan?: string | null;
  mitigationStatus?: string | null;
  residualLikelihood?: number | null;
  residualImpact?: number | null;
  nextReviewDate?: string | null;
  tags?: string[] | null;
}

export interface CreateRiskPayload {
  success: boolean | null;
  riskId: string | null;
  errors: string[];
}

export interface UpdateRiskInput {
  id: string;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  status?: string | null;
  likelihood?: number | null;
  impact?: number | null;
  mitigationPlan?: string | null;
  mitigationStatus?: string | null;
  residualLikelihood?: number | null;
  residualImpact?: number | null;
  nextReviewDate?: string | null;
  tags?: string[] | null;
}

export interface UpdateRiskPayload {
  success: boolean | null;
  riskId: string | null;
  errors: string[];
}

export interface CreateIncidentInput {
  title: string;
  description: string;
  incidentType?: string | null;
  severity?: string | null;
  endpointId?: string | null;
  deploymentId?: string | null;
  relatedRiskId?: string | null;
  affectedUser?: string | null;
  affectedUserCount?: number | null;
}

export interface CreateIncidentPayload {
  success: boolean | null;
  incidentId: string | null;
  errors: string[];
}
