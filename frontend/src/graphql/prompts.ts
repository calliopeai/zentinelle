import { gql } from '@apollo/client';

// =============================================================================
// Queries
// =============================================================================

export const GET_PROMPT_CATEGORIES = gql`
  query GetPromptCategories($activeOnly: Boolean) {
    promptCategories(activeOnly: $activeOnly) {
      id
      name
      slug
      description
      icon
      color
      sortOrder
      promptCount
    }
  }
`;

export const GET_PROMPT_TAGS = gql`
  query GetPromptTags($tagType: String, $activeOnly: Boolean) {
    promptTags(tagType: $tagType, activeOnly: $activeOnly) {
      id
      name
      slug
      tagType
      tagTypeDisplay
      description
      color
    }
  }
`;

export const GET_SYSTEM_PROMPTS = gql`
  query GetSystemPrompts(
    $first: Int
    $after: String
    $search: String
    $categorySlug: String
    $systemPromptType: String
    $provider: String
    $tagSlugs: [String]
    $featuredOnly: Boolean
    $verifiedOnly: Boolean
    $favoritesOnly: Boolean
  ) {
    systemPrompts(
      first: $first
      after: $after
      search: $search
      categorySlug: $categorySlug
      systemPromptType: $systemPromptType
      provider: $provider
      tagSlugs: $tagSlugs
      featuredOnly: $featuredOnly
      verifiedOnly: $verifiedOnly
      favoritesOnly: $favoritesOnly
    ) {
      edges {
        node {
          id
          name
          slug
          description
          promptText
          promptType
          promptTypeDisplay
          category {
            id
            name
            slug
            icon
            color
          }
          tags {
            edges {
              node {
                id
                name
                slug
                tagType
                color
              }
            }
          }
          compatibleProviders
          compatibleModels
          recommendedTemperature
          recommendedMaxTokens
          templateVariables
          variableDefaults
          exampleInput
          exampleOutput
          useCases
          version
          status
          statusDisplay
          visibility
          visibilityDisplay
          isFeatured
          isVerified
          usageCount
          favoriteCount
          forkCount
          avgRating
          isFavorited
          userRating
          createdByUsername
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

export const GET_SYSTEM_PROMPT = gql`
  query GetSystemPrompt($id: UUID, $slug: String) {
    systemPrompt(id: $id, slug: $slug) {
      id
      name
      slug
      description
      promptText
      promptType
      promptTypeDisplay
      category {
        id
        name
        slug
        icon
        color
      }
      tags {
        edges {
          node {
            id
            name
            slug
            tagType
            tagTypeDisplay
            color
          }
        }
      }
      compatibleProviders
      compatibleModels
      recommendedTemperature
      recommendedMaxTokens
      templateVariables
      variableDefaults
      variableDescriptions
      exampleInput
      exampleOutput
      exampleConversation
      useCases
      bestPractices
      limitations
      version
      parentPrompt {
        id
        name
        slug
      }
      changeLog
      status
      statusDisplay
      visibility
      visibilityDisplay
      isFeatured
      isVerified
      usageCount
      favoriteCount
      forkCount
      avgRating
      isFavorited
      userRating
      createdByUsername
      createdAt
      updatedAt
    }
  }
`;

export const GET_FEATURED_PROMPTS = gql`
  query GetFeaturedPrompts($limit: Int) {
    featuredPrompts(limit: $limit) {
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
        icon
        color
      }
      compatibleProviders
      favoriteCount
      usageCount
      isFeatured
      isVerified
    }
  }
`;

export const GET_POPULAR_PROMPTS = gql`
  query GetPopularPrompts($limit: Int) {
    popularPrompts(limit: $limit) {
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
        icon
        color
      }
      compatibleProviders
      favoriteCount
      usageCount
      avgRating
    }
  }
`;

export const GET_MY_PROMPTS = gql`
  query GetMyPrompts($first: Int, $after: String) {
    myPrompts(first: $first, after: $after) {
      edges {
        node {
          id
          name
          slug
          description
          promptType
          promptTypeDisplay
          status
          statusDisplay
          visibility
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

export const GET_MY_FAVORITES = gql`
  query GetMyFavorites($first: Int, $after: String) {
    myFavorites(first: $first, after: $after) {
      edges {
        node {
          id
          name
          slug
          description
          promptType
          promptTypeDisplay
          category {
            name
            color
          }
          favoriteCount
          usageCount
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// =============================================================================
// Filter Options
// =============================================================================

export const PROMPT_TYPE_OPTIONS = [
  { value: 'system', label: 'System Prompt' },
  { value: 'persona', label: 'Persona/Role' },
  { value: 'task', label: 'Task Template' },
  { value: 'chain', label: 'Prompt Chain' },
  { value: 'few_shot', label: 'Few-Shot Examples' },
  { value: 'safety', label: 'Safety/Guardrails' },
  { value: 'format', label: 'Output Format' },
];

export const PROMPT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export const PROMPT_VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'organization', label: 'Organization' },
  { value: 'public', label: 'Public Library' },
];

export const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', color: 'green' },
  { value: 'anthropic', label: 'Anthropic', color: 'orange' },
  { value: 'google', label: 'Google', color: 'blue' },
  { value: 'mistral', label: 'Mistral', color: 'purple' },
  { value: 'cohere', label: 'Cohere', color: 'cyan' },
  { value: 'meta', label: 'Meta', color: 'blue' },
];

// =============================================================================
// Mutations
// =============================================================================

export const CREATE_SYSTEM_PROMPT = gql`
  mutation CreateSystemPrompt($organizationId: UUID, $input: CreateSystemPromptInput!) {
    createSystemPrompt(organizationId: $organizationId, input: $input) {
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

export const UPDATE_SYSTEM_PROMPT = gql`
  mutation UpdateSystemPrompt($id: UUID!, $input: UpdateSystemPromptInput!) {
    updateSystemPrompt(id: $id, input: $input) {
      success
      errors
      prompt {
        id
        name
        slug
        status
      }
    }
  }
`;

export const DELETE_SYSTEM_PROMPT = gql`
  mutation DeleteSystemPrompt($id: UUID!) {
    deleteSystemPrompt(id: $id) {
      success
      errors
    }
  }
`;

export const FORK_SYSTEM_PROMPT = gql`
  mutation ForkSystemPrompt($id: UUID!, $organizationId: UUID) {
    forkSystemPrompt(id: $id, organizationId: $organizationId) {
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

export const TOGGLE_PROMPT_FAVORITE = gql`
  mutation TogglePromptFavorite($promptId: UUID!) {
    togglePromptFavorite(promptId: $promptId) {
      success
      isFavorited
    }
  }
`;

export const RATE_SYSTEM_PROMPT = gql`
  mutation RateSystemPrompt($promptId: UUID!, $rating: Int!, $review: String) {
    rateSystemPrompt(promptId: $promptId, rating: $rating, review: $review) {
      success
      errors
      ratingObj {
        id
        rating
        review
      }
    }
  }
`;

// =============================================================================
// AI Testing & Analysis Mutations
// =============================================================================

/**
 * Test a prompt with AI (one-shot only)
 *
 * LIMITS:
 * - 20 tests per hour
 * - Prompt: 8000 chars max
 * - Test input: 500 chars max
 * - Response: ~512 tokens
 */
export const TEST_SYSTEM_PROMPT = gql`
  mutation TestSystemPrompt($systemPrompt: String!, $userMessage: String!) {
    testSystemPrompt(systemPrompt: $systemPrompt, userMessage: $userMessage) {
      success
      response
      modelUsed
      inputTokens
      outputTokens
      error
    }
  }
`;

/**
 * Analyze a prompt and get improvement suggestions
 *
 * LIMITS:
 * - 10 analyses per hour
 * - Prompt: 8000 chars max
 */
export const ANALYZE_SYSTEM_PROMPT = gql`
  mutation AnalyzeSystemPrompt(
    $promptText: String!
    $promptType: String
    $targetProviders: [String]
  ) {
    analyzeSystemPrompt(
      promptText: $promptText
      promptType: $promptType
      targetProviders: $targetProviders
    ) {
      success
      overallScore
      strengths
      improvements {
        category
        originalText
        suggestedText
        explanation
        severity
      }
      tokenEfficiency
      error
    }
  }
`;

// Testing limits for UI display
export const PROMPT_TESTING_LIMITS = {
  maxPromptLength: 8000,
  maxTestInputLength: 500,
  maxResponseTokens: 512,
  testsPerHour: 20,
  analysesPerHour: 10,
};

// Legacy exports for backwards compatibility (used by PromptReconciler)
export const DUPLICATE_SYSTEM_PROMPT = FORK_SYSTEM_PROMPT;
export const ACTIVATE_PROMPT_VERSION = gql`
  mutation ActivatePromptVersion($id: UUID!) {
    updateSystemPrompt(id: $id, input: { status: "active" }) {
      success
      errors
    }
  }
`;

export const GET_PROMPT_ASSIGNMENTS = gql`
  query GetPromptAssignments($promptId: UUID) {
    systemPrompt(id: $promptId) {
      id
      name
      usageCount
    }
  }
`;
