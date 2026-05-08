import { gql } from "@apollo/client";

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
  mutation UpdateRisk($id: ID!, $input: UpdateRiskInput!) {
    updateRisk(id: $id, input: $input) {
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

export const ACKNOWLEDGE_INCIDENT = gql`
  mutation AcknowledgeIncident($id: ID!) {
    acknowledgeIncident(id: $id) {
      success
      errors
    }
  }
`;

export const RESOLVE_INCIDENT = gql`
  mutation ResolveIncident($id: ID!, $resolution: String!, $rootCause: String) {
    resolveIncident(id: $id, resolution: $resolution, rootCause: $rootCause) {
      success
      errors
    }
  }
`;

export const CLOSE_INCIDENT = gql`
  mutation CloseIncident($id: ID!, $lessonsLearned: String) {
    closeIncident(id: $id, lessonsLearned: $lessonsLearned) {
      success
      errors
    }
  }
`;

export const CREATE_INCIDENT = gql`
  mutation CreateIncident($input: CreateIncidentInput!) {
    createIncident(input: $input) {
      success
      incidentId
      errors
    }
  }
`;
