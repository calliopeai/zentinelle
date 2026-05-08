"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { GET_MY_ORGANIZATION } from "./queries";
import { UPDATE_ORGANIZATION_SETTINGS } from "./mutations";
import type {
  MyOrganizationData,
  UpdateOrganizationSettingsData,
  UpdateOrganizationSettingsVariables,
} from "./types";

export function useMyOrganization() {
  const { data, loading, error, refetch } =
    useQuery<MyOrganizationData>(GET_MY_ORGANIZATION);

  return {
    data,
    organization: data?.myOrganization ?? null,
    loading,
    error,
    refetch,
  };
}

export function useUpdateOrganizationSettings() {
  return useMutation<
    UpdateOrganizationSettingsData,
    UpdateOrganizationSettingsVariables
  >(UPDATE_ORGANIZATION_SETTINGS, {
    refetchQueries: [{ query: GET_MY_ORGANIZATION }],
  });
}
