import { gql } from "@apollo/client";

export const GET_AI_MODELS = gql`
  query AiModels(
    $search: String
    $providerSlug: String
    $modelType: String
    $availableOnly: Boolean
  ) {
    aiModels(
      search: $search
      providerSlug: $providerSlug
      modelType: $modelType
      availableOnly: $availableOnly
    ) {
      id
      modelId
      name
      description
      modelType
      riskLevel
      contextWindow
      maxOutputTokens
      inputPricePerMillion
      outputPricePerMillion
      isAvailable
      deprecated
      providerSlug
      providerName
      capabilities
    }
  }
`;
