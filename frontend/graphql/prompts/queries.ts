import { gql } from "@apollo/client";

const SYSTEM_PROMPT_FIELDS = `
  id
  name
  slug
  description
  promptType
  promptTypeDisplay
  category {
    id
    name
    slug
    description
  }
  compatibleProviders
  templateVariables
  version
  status
  statusDisplay
  visibility
  visibilityDisplay
  isFeatured
  isVerified
  usageCount
  favoriteCount
  avgRating
  tags {
    id
    name
    slug
  }
  createdAt
  updatedAt
  createdByUsername
`;

export const GET_SYSTEM_PROMPTS = gql`
  query GetSystemPrompts(
    $search: String
    $categorySlug: String
    $systemPromptType: String
    $featuredOnly: Boolean
  ) {
    systemPrompts(
      search: $search
      categorySlug: $categorySlug
      systemPromptType: $systemPromptType
      featuredOnly: $featuredOnly
    ) {
      ${SYSTEM_PROMPT_FIELDS}
    }
  }
`;

export const GET_SYSTEM_PROMPT = gql`
  query GetSystemPrompt($id: UUID, $slug: String) {
    systemPrompt(id: $id, slug: $slug) {
      ${SYSTEM_PROMPT_FIELDS}
      promptText
      compatibleModels
      recommendedTemperature
      recommendedMaxTokens
      exampleInput
      exampleOutput
      useCases
    }
  }
`;
