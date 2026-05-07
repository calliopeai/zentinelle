"use client";

import { useQuery } from "@apollo/client/react";
import { GET_SYSTEM_PROMPTS, GET_SYSTEM_PROMPT } from "./queries";
import type {
  SystemPromptListData,
  SystemPromptListVariables,
  SystemPromptDetailData,
  SystemPromptDetailVariables,
} from "./types";

export function useSystemPrompts(variables?: SystemPromptListVariables) {
  const { data, loading, error, refetch } = useQuery<
    SystemPromptListData,
    SystemPromptListVariables
  >(GET_SYSTEM_PROMPTS, {
    variables,
  });

  return {
    data,
    prompts: data?.systemPrompts ?? [],
    loading,
    error,
    refetch,
  };
}

export function useSystemPrompt(variables: SystemPromptDetailVariables) {
  const { data, loading, error, refetch } = useQuery<
    SystemPromptDetailData,
    SystemPromptDetailVariables
  >(GET_SYSTEM_PROMPT, {
    variables,
    skip: !variables.id && !variables.slug,
  });

  return {
    data,
    prompt: data?.systemPrompt ?? null,
    loading,
    error,
    refetch,
  };
}
