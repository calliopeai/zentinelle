"use client";

import { useQuery } from "@apollo/client/react";
import { GET_COMPLIANCE_OVERVIEW } from "./queries";
import type { ComplianceOverviewData } from "./types";

export function useComplianceOverview() {
  const { data, loading, error, refetch } =
    useQuery<ComplianceOverviewData>(GET_COMPLIANCE_OVERVIEW);

  return {
    data,
    overview: data?.complianceOverview ?? null,
    loading,
    error,
    refetch,
  };
}
