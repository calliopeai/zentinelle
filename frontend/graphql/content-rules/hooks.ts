"use client";

import { useQuery } from "@apollo/client/react";
import { GET_CONTENT_RULES, GET_CONTENT_RULE } from "./queries";
import type {
  ContentRuleListData,
  ContentRuleListVariables,
  ContentRuleDetailData,
} from "./types";

export function useContentRules(variables?: ContentRuleListVariables) {
  const { data, loading, error, refetch } = useQuery<
    ContentRuleListData,
    ContentRuleListVariables
  >(GET_CONTENT_RULES, {
    variables,
  });

  return {
    data,
    contentRules: data?.contentRules ?? [],
    loading,
    error,
    refetch,
  };
}

export function useContentRule(id: string) {
  const { data, loading, error, refetch } = useQuery<ContentRuleDetailData>(
    GET_CONTENT_RULE,
    {
      variables: { id },
      skip: !id,
    }
  );

  return {
    data,
    contentRule: data?.contentRule ?? null,
    loading,
    error,
    refetch,
  };
}
