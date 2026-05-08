"use client";

import { useQuery, useMutation } from "@apollo/client/react";
import { GET_COMPLIANCE_ALERTS } from "./queries";
import {
  ACKNOWLEDGE_COMPLIANCE_ALERT,
  RESOLVE_COMPLIANCE_ALERT,
  DISMISS_COMPLIANCE_ALERT,
} from "./mutations";
import type {
  ComplianceAlertsData,
  ComplianceAlertsVariables,
  AcknowledgeComplianceAlertResult,
  ResolveComplianceAlertResult,
  DismissComplianceAlertResult,
} from "./types";

export function useComplianceAlerts(variables?: ComplianceAlertsVariables) {
  const { data, loading, error, refetch } = useQuery<
    ComplianceAlertsData,
    ComplianceAlertsVariables
  >(GET_COMPLIANCE_ALERTS, {
    variables,
    fetchPolicy: "cache-and-network",
  });

  return {
    data,
    alerts: data?.complianceAlerts ?? [],
    loading,
    error,
    refetch,
  };
}

export function useAcknowledgeComplianceAlert() {
  return useMutation<AcknowledgeComplianceAlertResult, { id: string }>(
    ACKNOWLEDGE_COMPLIANCE_ALERT,
  );
}

export function useResolveComplianceAlert() {
  return useMutation<
    ResolveComplianceAlertResult,
    { id: string; notes?: string | null }
  >(RESOLVE_COMPLIANCE_ALERT);
}

export function useDismissComplianceAlert() {
  return useMutation<DismissComplianceAlertResult, { id: string }>(
    DISMISS_COMPLIANCE_ALERT,
  );
}
