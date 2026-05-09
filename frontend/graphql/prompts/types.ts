export interface PromptTag {
  id: string;
  name: string;
  slug: string;
}

export interface PromptCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface SystemPromptData {
  id: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  promptText: string | null;
  promptType: string | null;
  promptTypeDisplay: string | null;
  category: PromptCategory | null;
  compatibleProviders: string[] | null;
  compatibleModels: string[] | null;
  templateVariables: string[] | null;
  recommendedTemperature: number | null;
  recommendedMaxTokens: number | null;
  exampleInput: string | null;
  exampleOutput: string | null;
  useCases: string[] | null;
  version: number | null;
  status: string | null;
  statusDisplay: string | null;
  visibility: string | null;
  visibilityDisplay: string | null;
  isFeatured: boolean | null;
  isVerified: boolean | null;
  usageCount: number | null;
  favoriteCount: number | null;
  avgRating: number | null;
  tags: PromptTag[] | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdByUsername: string | null;
}

export interface SystemPromptListData {
  systemPrompts: SystemPromptData[];
}

export interface SystemPromptListVariables {
  search?: string | null;
  categorySlug?: string | null;
  systemPromptType?: string | null;
  featuredOnly?: boolean | null;
}

export interface SystemPromptDetailData {
  systemPrompt: SystemPromptData | null;
}

export interface SystemPromptDetailVariables {
  id?: string | null;
  slug?: string | null;
}

export interface CreateSystemPromptInput {
  name: string;
  promptText: string;
  description?: string | null;
  promptType?: string | null;
  visibility?: string | null;
  categoryId?: string | null;
  tagIds?: string[] | null;
  compatibleProviders?: string[] | null;
  compatibleModels?: string[] | null;
  recommendedTemperature?: number | null;
  recommendedMaxTokens?: number | null;
  exampleInput?: string | null;
  exampleOutput?: string | null;
  useCases?: string[] | null;
  bestPractices?: string | null;
}

export interface CreateSystemPromptPayload {
  prompt: SystemPromptData | null;
  errors: string[];
}

export interface DeleteSystemPromptPayload {
  success: boolean | null;
  errors: string[];
}

export interface DeleteSystemPromptData {
  deleteSystemPrompt: DeleteSystemPromptPayload;
}

export interface DeleteSystemPromptVariables {
  id: string;
}

export interface ForkSystemPromptResult {
  success: boolean;
  errors: string[];
  prompt: {
    id: string;
    name: string | null;
    slug: string | null;
  } | null;
}

export interface ForkSystemPromptData {
  forkSystemPrompt: ForkSystemPromptResult;
}

export interface ForkSystemPromptVariables {
  id: string;
}

export interface PromptImprovementSuggestion {
  category: string | null;
  originalText: string | null;
  suggestedText: string | null;
  explanation: string | null;
  severity: string | null;
}

export interface AnalyzeSystemPromptResult {
  success: boolean;
  overallScore: number;
  strengths: string[];
  improvements: PromptImprovementSuggestion[];
  tokenEfficiency: string;
  error: string | null;
}

export interface AnalyzeSystemPromptData {
  analyzeSystemPrompt: AnalyzeSystemPromptResult;
}

export interface AnalyzeSystemPromptVariables {
  promptText: string;
  promptType?: string | null;
  targetProviders?: string[] | null;
}
