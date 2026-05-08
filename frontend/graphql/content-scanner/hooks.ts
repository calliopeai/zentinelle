"use client";

import { useQuery } from "@apollo/client/react";
import { GET_CONTENT_SCANS, GET_CONTENT_VIOLATIONS } from "./queries";
import type {
  ContentScansData,
  ContentScansVariables,
  ContentViolationsData,
  ContentViolationsVariables,
} from "./types";

export function useContentScans(variables?: ContentScansVariables) {
  const { data, loading, error, refetch } = useQuery<
    ContentScansData,
    ContentScansVariables
  >(GET_CONTENT_SCANS, {
    variables,
    pollInterval: 30000,
  });

  return {
    data,
    scans: data?.contentScans ?? [],
    loading,
    error,
    refetch,
  };
}

export function useContentViolations(variables?: ContentViolationsVariables) {
  const { data, loading, error, refetch } = useQuery<
    ContentViolationsData,
    ContentViolationsVariables
  >(GET_CONTENT_VIOLATIONS, {
    variables,
    pollInterval: 30000,
  });

  return {
    data,
    violations: data?.contentViolations ?? [],
    loading,
    error,
    refetch,
  };
}
