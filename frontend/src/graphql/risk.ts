import { gql } from '@apollo/client';

// =============================================================================
// Risks
// =============================================================================

export const GET_RISKS = gql`
  query GetRisks(
    $search: String
    $category: String
    $status: String
    $riskLevel: String
    $first: Int
    $after: String
  ) {
    risks(
      search: $search
      category: $category
      status: $status
      riskLevel: $riskLevel
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          name
          description
          category
          categoryDisplay
          status
          statusDisplay
          likelihood
          likelihoodDisplay
          impact
          impactDisplay
          riskScore
          riskLevel
          mitigationPlan
          mitigationStatus
          residualLikelihood
          residualImpact
          residualRiskScore
          ownerName
          lastReviewedAt
          lastReviewedByName
          nextReviewDate
          incidentCount
          tags
          identifiedAt
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_RISK = gql`
  query GetRisk($id: ID!) {
    risk(id: $id) {
      id
      name
      description
      category
      categoryDisplay
      status
      statusDisplay
      likelihood
      likelihoodDisplay
      impact
      impactDisplay
      riskScore
      riskLevel
      mitigationPlan
      mitigationStatus
      residualLikelihood
      residualImpact
      residualRiskScore
      ownerName
      lastReviewedAt
      lastReviewedByName
      nextReviewDate
      incidentCount
      tags
      externalReferences
      identifiedAt
      createdAt
      updatedAt
    }
  }
`;

// =============================================================================
// Incidents
// =============================================================================

export const GET_INCIDENTS = gql`
  query GetIncidents(
    $search: String
    $incidentType: String
    $severity: String
    $status: String
    $startDate: DateTime
    $endDate: DateTime
    $first: Int
    $after: String
  ) {
    incidents(
      search: $search
      incidentType: $incidentType
      severity: $severity
      status: $status
      startDate: $startDate
      endDate: $endDate
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          title
          description
          incidentType
          incidentTypeDisplay
          severity
          severityDisplay
          status
          statusDisplay
          slaStatus
          timeToAcknowledgeSeconds
          timeToResolveSeconds
          assignedToName
          reportedByName
          endpointName
          deploymentName
          relatedRiskName
          triggeringPolicyName
          affectedUser
          affectedUserCount
          occurredAt
          detectedAt
          acknowledgedAt
          resolvedAt
          closedAt
          tags
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_INCIDENT = gql`
  query GetIncident($id: ID!) {
    incident(id: $id) {
      id
      title
      description
      incidentType
      incidentTypeDisplay
      severity
      severityDisplay
      status
      statusDisplay
      slaStatus
      timeToAcknowledgeSeconds
      timeToResolveSeconds
      assignedToName
      reportedByName
      endpointName
      deploymentName
      relatedRiskName
      triggeringPolicyName
      affectedUser
      affectedUserCount
      rootCause
      impactAssessment
      resolution
      remediationActions
      lessonsLearned
      occurredAt
      detectedAt
      acknowledgedAt
      resolvedAt
      closedAt
      tags
      evidence
      timelineEvents
      createdAt
      updatedAt
    }
  }
`;

// =============================================================================
// Risk Stats
// =============================================================================

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

// =============================================================================
// Options (for dropdowns)
// =============================================================================

export const GET_RISK_OPTIONS = gql`
  query GetRiskOptions {
    riskOptions {
      categories {
        value
        label
      }
      statuses {
        value
        label
      }
      likelihoods {
        value
        label
      }
      impacts {
        value
        label
      }
    }
  }
`;

export const GET_INCIDENT_OPTIONS = gql`
  query GetIncidentOptions {
    incidentOptions {
      incidentTypes {
        value
        label
      }
      severities {
        value
        label
      }
      statuses {
        value
        label
      }
    }
  }
`;

// =============================================================================
// Risk Mutations
// =============================================================================

export const CREATE_RISK = gql`
  mutation CreateRisk($input: CreateRiskInput!) {
    createRisk(input: $input) {
      success
      riskId
      errors
    }
  }
`;

export const UPDATE_RISK = gql`
  mutation UpdateRisk($input: UpdateRiskInput!) {
    updateRisk(input: $input) {
      success
      riskId
      errors
    }
  }
`;

export const DELETE_RISK = gql`
  mutation DeleteRisk($id: ID!) {
    deleteRisk(id: $id) {
      success
      errors
    }
  }
`;

export const REVIEW_RISK = gql`
  mutation ReviewRisk($id: ID!, $notes: String) {
    reviewRisk(id: $id, notes: $notes) {
      success
      riskId
    }
  }
`;

// =============================================================================
// Incident Mutations
// =============================================================================

export const CREATE_INCIDENT = gql`
  mutation CreateIncident($input: CreateIncidentInput!) {
    createIncident(input: $input) {
      success
      incidentId
      errors
    }
  }
`;

export const UPDATE_INCIDENT = gql`
  mutation UpdateIncident($input: UpdateIncidentInput!) {
    updateIncident(input: $input) {
      success
      incidentId
      errors
    }
  }
`;

export const ACKNOWLEDGE_INCIDENT = gql`
  mutation AcknowledgeIncident($id: ID!) {
    acknowledgeIncident(id: $id) {
      success
      incidentId
    }
  }
`;

export const RESOLVE_INCIDENT = gql`
  mutation ResolveIncident($id: ID!, $resolution: String!, $rootCause: String) {
    resolveIncident(id: $id, resolution: $resolution, rootCause: $rootCause) {
      success
      incidentId
    }
  }
`;

export const CLOSE_INCIDENT = gql`
  mutation CloseIncident($id: ID!, $lessonsLearned: String) {
    closeIncident(id: $id, lessonsLearned: $lessonsLearned) {
      success
      incidentId
    }
  }
`;

export const ASSIGN_INCIDENT = gql`
  mutation AssignIncident($id: ID!, $assigneeId: ID!) {
    assignIncident(id: $id, assigneeId: $assigneeId) {
      success
      incidentId
    }
  }
`;
