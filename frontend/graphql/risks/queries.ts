import { gql } from "@apollo/client";

const RISK_FIELDS = `
  id
  name
  description
  category
  status
  likelihood
  impact
  mitigationPlan
  mitigationStatus
  residualLikelihood
  residualImpact
  lastReviewedAt
  nextReviewDate
  tags
  identifiedAt
  createdAt
  updatedAt
  categoryDisplay
  statusDisplay
  likelihoodDisplay
  impactDisplay
  riskScore
  riskLevel
  residualRiskScore
  ownerName
  incidentCount
`;

const INCIDENT_FIELDS = `
  id
  title
  description
  incidentType
  severity
  status
  affectedUser
  affectedUserCount
  rootCause
  impactAssessment
  resolution
  occurredAt
  detectedAt
  acknowledgedAt
  resolvedAt
  closedAt
  tags
  createdAt
  updatedAt
  incidentTypeDisplay
  severityDisplay
  statusDisplay
  slaStatus
  timeToAcknowledgeSeconds
  timeToResolveSeconds
  assignedToName
  reportedByName
  endpointName
  relatedRiskName
  triggeringPolicyName
`;

export const GET_RISKS = gql`
  query GetRisks(
    $search: String
    $category: String
    $status: String
    $riskLevel: String
  ) {
    risks(
      search: $search
      category: $category
      status: $status
      riskLevel: $riskLevel
    ) {
      ${RISK_FIELDS}
    }
  }
`;

export const GET_RISK = gql`
  query GetRisk($id: ID) {
    risk(id: $id) {
      ${RISK_FIELDS}
    }
  }
`;

export const GET_INCIDENTS = gql`
  query GetIncidents(
    $search: String
    $incidentType: String
    $severity: String
    $status: String
    $startDate: DateTime
    $endDate: DateTime
  ) {
    incidents(
      search: $search
      incidentType: $incidentType
      severity: $severity
      status: $status
      startDate: $startDate
      endDate: $endDate
    ) {
      ${INCIDENT_FIELDS}
    }
  }
`;

export const GET_RISK_STATS = gql`
  query GetRiskStats {
    riskStats {
      totalRisks
      openRisks
      criticalRisks
      highRisks
      risksByLevel {
        level
        count
      }
      risksByCategory {
        category
        count
      }
      totalIncidents
      openIncidents
      incidentsToday
      incidentsBySeverity {
        severity
        count
      }
      incidentsByStatus {
        status
        count
      }
      slaMetCount
      slaBreachedCount
    }
  }
`;
