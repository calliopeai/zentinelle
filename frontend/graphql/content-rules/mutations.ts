import { gql } from "@apollo/client";

// `matches`, not matchedText/severity. Those two were in this document and are
// not in TestContentRulePayload, so every execution of it would have failed
// validation with "Cannot query field" — the mutation had no caller, so
// nothing ever ran it to find out.
export const TEST_CONTENT_RULE = gql`
  mutation TestContentRule($id: ID!, $content: String!) {
    testContentRule(id: $id, content: $content) {
      success
      matched
      matches
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
