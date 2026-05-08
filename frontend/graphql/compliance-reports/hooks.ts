"use client";

import { useQuery, useMutation } from "@apollo/client/react";
import { GET_COMPLIANCE_REPORTS } from "./queries";
import { GENERATE_COMPLIANCE_REPORT } from "./mutations";
import type {
  ComplianceReportsData,
  ComplianceReportsVariables,
  GenerateComplianceReportData,
  GenerateComplianceReportVariables,
} from "./types";

export function useComplianceReports(variables?: ComplianceReportsVariables) {
  const { data, loading, error, refetch } = useQuery<
    ComplianceReportsData,
    ComplianceReportsVariables
  >(GET_COMPLIANCE_REPORTS, {
    variables,
  });

  return {
    data,
    reports: data?.complianceReports ?? [],
    loading,
    error,
    refetch,
  };
}

export function useGenerateComplianceReport() {
  const [mutate, { data, loading, error }] = useMutation<
    GenerateComplianceReportData,
    GenerateComplianceReportVariables
  >(GENERATE_COMPLIANCE_REPORT);

  return {
    generateReport: mutate,
    data,
    loading,
    error,
  };
}
