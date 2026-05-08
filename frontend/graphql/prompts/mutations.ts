import { gql } from "@apollo/client";

export const CREATE_SYSTEM_PROMPT = gql`
  mutation CreateSystemPrompt($input: CreateSystemPromptInput!) {
    createSystemPrompt(input: $input) {
      prompt {
        id
        name
        slug
        description
        promptType
        visibility
        createdAt
      }
      errors
    }
  }
`;
