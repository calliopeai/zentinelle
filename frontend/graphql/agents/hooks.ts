"use client";

import { useQuery } from "@apollo/client/react";
import { GET_ENDPOINTS, GET_ENDPOINT } from "./queries";
import type {
  EndpointListData,
  EndpointDetailData,
  EndpointListVariables,
  EndpointDetailVariables,
} from "./types";

export function useEndpoints(variables?: EndpointListVariables) {
  const { data, loading, error, refetch } = useQuery<
    EndpointListData,
    EndpointListVariables
  >(GET_ENDPOINTS, {
    variables,
  });

  return {
    data,
    endpoints: data?.endpoints ?? [],
    loading,
    error,
    refetch,
  };
}

export function useEndpoint(id: string) {
  const { data, loading, error, refetch } = useQuery<
    EndpointDetailData,
    EndpointDetailVariables
  >(GET_ENDPOINT, {
    variables: { id },
    skip: !id,
  });

  return {
    data,
    endpoint: data?.endpoint ?? null,
    loading,
    error,
    refetch,
  };
}
