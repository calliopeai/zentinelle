"use client";

import { useQuery } from "@apollo/client/react";
import { GET_EVENTS, GET_AUDIT_LOGS, GET_AUDIT_ANALYTICS } from "./queries";
import type {
  EventListData,
  EventListVariables,
  AuditLogListData,
  AuditLogListVariables,
  AuditAnalyticsData,
  AuditAnalyticsVariables,
} from "./types";

export function useEvents(variables?: EventListVariables) {
  const { data, loading, error, refetch } = useQuery<
    EventListData,
    EventListVariables
  >(GET_EVENTS, {
    variables,
  });

  return {
    data,
    events: data?.events ?? [],
    loading,
    error,
    refetch,
  };
}

export function useAuditLogs(variables?: AuditLogListVariables) {
  const { data, loading, error, refetch } = useQuery<
    AuditLogListData,
    AuditLogListVariables
  >(GET_AUDIT_LOGS, {
    variables,
  });

  return {
    data,
    auditLogs: data?.auditLogs ?? [],
    loading,
    error,
    refetch,
  };
}

export function useAuditAnalytics(variables?: AuditAnalyticsVariables) {
  const { data, loading, error, refetch } = useQuery<
    AuditAnalyticsData,
    AuditAnalyticsVariables
  >(GET_AUDIT_ANALYTICS, {
    variables,
  });

  return {
    data,
    analytics: data?.auditAnalytics ?? null,
    loading,
    error,
    refetch,
  };
}
