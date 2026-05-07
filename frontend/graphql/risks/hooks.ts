"use client";

import { useQuery } from "@apollo/client/react";
import {
  GET_RISKS,
  GET_RISK,
  GET_INCIDENTS,
  GET_RISK_STATS,
} from "./queries";
import type {
  RiskListData,
  RiskDetailData,
  RiskListVariables,
  RiskDetailVariables,
  IncidentListData,
  IncidentListVariables,
  RiskStatsData,
} from "./types";

export function useRisks(variables?: RiskListVariables) {
  const { data, loading, error, refetch } = useQuery<
    RiskListData,
    RiskListVariables
  >(GET_RISKS, {
    variables,
  });

  return {
    data,
    risks: data?.risks ?? [],
    loading,
    error,
    refetch,
  };
}

export function useRisk(id: string) {
  const { data, loading, error, refetch } = useQuery<
    RiskDetailData,
    RiskDetailVariables
  >(GET_RISK, {
    variables: { id },
    skip: !id,
  });

  return {
    data,
    risk: data?.risk ?? null,
    loading,
    error,
    refetch,
  };
}

export function useIncidents(variables?: IncidentListVariables) {
  const { data, loading, error, refetch } = useQuery<
    IncidentListData,
    IncidentListVariables
  >(GET_INCIDENTS, {
    variables,
  });

  return {
    data,
    incidents: data?.incidents ?? [],
    loading,
    error,
    refetch,
  };
}

export function useRiskStats() {
  const { data, loading, error, refetch } =
    useQuery<RiskStatsData>(GET_RISK_STATS);

  return {
    data,
    stats: data?.riskStats ?? null,
    loading,
    error,
    refetch,
  };
}
