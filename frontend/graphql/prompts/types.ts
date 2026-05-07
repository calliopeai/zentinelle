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
