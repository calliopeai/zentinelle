import { gql } from "@apollo/client";

const CONTENT_RULE_FIELDS = `
  id
  name
  description
  ruleType
  ruleTypeDisplay
  config
  severity
  severityDisplay
  enforcement
  enforcementDisplay
  scanMode
  scanInput
  scanOutput
  scanContext
  scopeType
  scopeName
  priority
  enabled
  notifyUser
  notifyAdmins
  webhookUrl
  createdAt
  updatedAt
  violationCount
`;

export const GET_CONTENT_RULES = gql`
  query GetContentRules(
    $search: String
    $ruleType: String
    $severity: String
    $enforcement: String
    $enabled: Boolean
  ) {
    contentRules(
      search: $search
      ruleType: $ruleType
      severity: $severity
      enforcement: $enforcement
      enabled: $enabled
    ) {
      ${CONTENT_RULE_FIELDS}
    }
  }
`;

export const GET_CONTENT_RULE = gql`
  query GetContentRule($id: ID) {
    contentRule(id: $id) {
      ${CONTENT_RULE_FIELDS}
    }
  }
`;
