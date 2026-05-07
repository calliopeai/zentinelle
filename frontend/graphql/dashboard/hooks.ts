"use client";

import { useQuery } from "@apollo/client/react";
import { DASHBOARD_STATS } from "./queries";
import type { DashboardStatsData } from "./types";

export function useDashboardStats() {
  const { data, loading, error, refetch } =
    useQuery<DashboardStatsData>(DASHBOARD_STATS);

  return {
    data,
    stats: data?.dashboardStats ?? null,
    loading,
    error,
    refetch,
  };
}
