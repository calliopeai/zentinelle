import { gql } from "@apollo/client";

export const TEST_CONTENT_RULE = gql`
  mutation TestContentRule($id: ID!, $content: String!) {
    testContentRule(id: $id, content: $content) {
      success
      matched
      matchedText
      severity
      errors
    }
  }
`;

export const CREATE_CONTENT_RULE = gql`
  mutation CreateContentRule($input: CreateContentRuleInput!) {
    createContentRule(input: $input) {
      success
      ruleId
      errors
    }
  }
`;

export const UPDATE_CONTENT_RULE = gql`
  mutation UpdateContentRule($input: UpdateContentRuleInput!) {
    updateContentRule(input: $input) {
      success
      ruleId
      errors
    }
  }
`;

export const TOGGLE_CONTENT_RULE_ENABLED = gql`
  mutation ToggleContentRuleEnabled($id: ID!, $enabled: Boolean!) {
    toggleContentRuleEnabled(id: $id, enabled: $enabled) {
      success
      ruleId
    }
  }
`;

export const DELETE_CONTENT_RULE = gql`
  mutation DeleteContentRule($id: ID!) {
    deleteContentRule(id: $id) {
      success
      errors
    }
  }
`;

export const DUPLICATE_CONTENT_RULE = gql`
  mutation DuplicateContentRule($id: ID!, $newName: String) {
    duplicateContentRule(id: $id, newName: $newName) {
      success
      ruleId
      errors
    }
  }
`;
