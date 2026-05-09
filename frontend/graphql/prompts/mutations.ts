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

export const DELETE_SYSTEM_PROMPT = gql`
  mutation DeleteSystemPrompt($id: ID!) {
    deleteSystemPrompt(id: $id) {
      success
      errors
    }
  }
`;

export const UPDATE_SYSTEM_PROMPT = gql`
  mutation UpdateSystemPrompt($id: ID!, $input: UpdateSystemPromptInput!) {
    updateSystemPrompt(id: $id, input: $input) {
      success
      promptId
      errors
    }
  }
`;

export const TEST_SYSTEM_PROMPT = gql`
  mutation TestSystemPrompt($systemPrompt: String!, $userMessage: String!) {
    testSystemPrompt(systemPrompt: $systemPrompt, userMessage: $userMessage) {
      success
      response
      errors
    }
  }
`;

export const RATE_SYSTEM_PROMPT = gql`
  mutation RateSystemPrompt($id: ID!, $rating: Int!, $comment: String) {
    rateSystemPrompt(id: $id, rating: $rating, comment: $comment) {
      success
      errors
    }
  }
`;

export const TOGGLE_PROMPT_FAVORITE = gql`
  mutation TogglePromptFavorite($id: ID!) {
    togglePromptFavorite(id: $id) {
      success
      isFavorite
      errors
    }
  }
`;

export const FORK_SYSTEM_PROMPT = gql`
  mutation ForkSystemPrompt($id: ID!) {
    forkSystemPrompt(id: $id) {
      success
      errors
      prompt {
        id
        name
        slug
      }
    }
  }
`;

export const ANALYZE_SYSTEM_PROMPT = gql`
  mutation AnalyzeSystemPrompt(
    $promptText: String!
    $promptType: String
    $targetProviders: [String!]
  ) {
    analyzeSystemPrompt(
      promptText: $promptText
      promptType: $promptType
      targetProviders: $targetProviders
    ) {
      success
      overallScore
      strengths
      tokenEfficiency
      error
      improvements {
        category
        originalText
        suggestedText
        explanation
        severity
      }
    }
  }
`;
