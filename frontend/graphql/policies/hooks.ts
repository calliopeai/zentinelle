"use client";

import { useQuery } from "@apollo/client/react";
import { GET_POLICIES, GET_POLICY, GET_POLICY_OPTIONS } from "./queries";
import type {
  PolicyListData,
  PolicyDetailData,
  PolicyOptionsData,
  PolicyListVariables,
  PolicyDetailVariables,
} from "./types";

export function usePolicies(variables?: PolicyListVariables) {
  const { data, loading, error, refetch } = useQuery<
    PolicyListData,
    PolicyListVariables
  >(GET_POLICIES, {
    variables,
  });

  return {
    data,
    policies: data?.policies ?? [],
    loading,
    error,
    refetch,
  };
}

export function usePolicy(id: string) {
  const { data, loading, error, refetch } = useQuery<
    PolicyDetailData,
    PolicyDetailVariables
  >(GET_POLICY, {
    variables: { id },
    skip: !id,
  });

  return {
    data,
    policy: data?.policy ?? null,
    loading,
    error,
    refetch,
  };
}

export function usePolicyOptions() {
  const { data, loading, error } =
    useQuery<PolicyOptionsData>(GET_POLICY_OPTIONS);

  return {
    data,
    options: data?.policyOptions ?? null,
    loading,
    error,
  };
}
