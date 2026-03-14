import { gql } from '@apollo/client';

export const GET_AI_MODELS = gql`
  query GetAIModels(
    $first: Int
    $after: String
    $search: String
    $providerSlug: String
    $modelType: String
    $riskLevel: String
    $availableOnly: Boolean
  ) {
    aiModels(
      first: $first
      after: $after
      search: $search
      providerSlug: $providerSlug
      modelType: $modelType
      riskLevel: $riskLevel
      availableOnly: $availableOnly
    ) {
      edges {
        node {
          id
          modelId
          name
          description
          modelType
          modelTypeDisplay
          riskLevel
          riskLevelDisplay
          capabilities
          contextWindow
          maxOutputTokens
          inputPricePerMillion
          outputPricePerMillion
          isAvailable
          deprecated
          deprecationDate
          providerSlug
          providerName
          fullModelId
          replacementModelName
          documentationUrl
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_MODEL_APPROVALS = gql`
  query GetModelApprovals(
    $status: String
    $providerSlug: String
  ) {
    modelApprovals(
      status: $status
      providerSlug: $providerSlug
    ) {
      edges {
        node {
          id
          modelId
          modelName
          modelProvider
          modelRiskLevel
          status
          statusDisplay
          isUsable
          maxDailyRequests
          maxMonthlyCost
          requiresJustification
          requiresApproval
          reviewNotes
          reviewedAt
          reviewedByUsername
          requestedByUsername
          createdAt
        }
      }
    }
  }
`;

// Options for filters
export const MODEL_TYPE_OPTIONS = [
  { value: 'llm', label: 'Large Language Model' },
  { value: 'multimodal', label: 'Multimodal' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'embedding', label: 'Embedding' },
  { value: 'code', label: 'Code Generation' },
  { value: 'image_gen', label: 'Image Generation' },
  { value: 'speech_to_text', label: 'Speech to Text' },
  { value: 'text_to_speech', label: 'Text to Speech' },
];

export const RISK_LEVEL_OPTIONS = [
  { value: 'minimal', label: 'Minimal Risk', color: 'green' },
  { value: 'limited', label: 'Limited Risk', color: 'yellow' },
  { value: 'high', label: 'High Risk', color: 'orange' },
  { value: 'unacceptable', label: 'Unacceptable Risk', color: 'red' },
  { value: 'unknown', label: 'Not Classified', color: 'gray' },
];

export const APPROVAL_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending Review', color: 'yellow' },
  { value: 'approved', label: 'Approved', color: 'green' },
  { value: 'restricted', label: 'Restricted Use', color: 'orange' },
  { value: 'denied', label: 'Denied', color: 'red' },
];

export const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google AI' },
  { value: 'mistral', label: 'Mistral AI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'groq', label: 'Groq' },
];
