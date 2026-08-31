"use client";

import { useQuery } from "@apollo/client/react";

import { GET_INTERACTION_LOGS } from "./queries";
import type {
  InteractionLogListData,
  InteractionLogListVariables,
} from "./types";

export function useInteractionLogs(variables?: InteractionLogListVariables) {
  const { data, loading, error, refetch } = useQuery<
    InteractionLogListData,
    InteractionLogListVariables
  >(GET_INTERACTION_LOGS, {
    variables,
    notifyOnNetworkStatusChange: true,
  });

  return {
    data,
    interactions: data?.interactionLogs ?? [],
    loading,
    error,
    refetch,
  };
}
