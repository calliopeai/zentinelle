"use client";

import { useQuery } from "@apollo/client/react";
import { GET_AI_MODELS } from "./queries";

export interface AIModelData {
  id: string;
  modelId: string;
  name: string;
  description: string | null;
  modelType: string | null;
  riskLevel: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  isAvailable: boolean;
  deprecated: boolean;
  providerSlug: string | null;
  providerName: string | null;
  capabilities: string[] | null;
}

interface AIModelsData {
  aiModels: AIModelData[];
}

interface AIModelsVariables {
  search?: string | null;
  providerSlug?: string | null;
  modelType?: string | null;
  availableOnly?: boolean | null;
}

export function useAIModels(variables?: AIModelsVariables) {
  const { data, loading, error, refetch } = useQuery<
    AIModelsData,
    AIModelsVariables
  >(GET_AI_MODELS, {
    variables,
  });

  return {
    models: data?.aiModels ?? [],
    loading,
    error,
    refetch,
  };
}
