"use client";

import { useQuery } from "@apollo/client/react";
import { GET_USAGE_METRICS } from "./queries";
import type { UsageMetricsData, UsageMetricsVariables } from "./types";

export function useUsageMetrics(variables?: UsageMetricsVariables) {
  const { data, loading, error, refetch } = useQuery<
    UsageMetricsData,
    UsageMetricsVariables
  >(GET_USAGE_METRICS, {
    variables,
  });

  return {
    data,
    metrics: data?.usageMetrics ?? null,
    loading,
    error,
    refetch,
  };
}
