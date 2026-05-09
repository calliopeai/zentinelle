"use client";

import { useQuery } from "@apollo/client/react";
import { GET_AGENT_GROUPS } from "./queries";
import type {
  AgentGroupListData,
  AgentGroupListVariables,
} from "./types";

export function useAgentGroups(variables?: AgentGroupListVariables) {
  const { data, loading, error, refetch } = useQuery<
    AgentGroupListData,
    AgentGroupListVariables
  >(GET_AGENT_GROUPS, {
    variables,
  });

  return {
    data,
    groups: data?.agentGroups ?? [],
    loading,
    error,
    refetch,
  };
}
