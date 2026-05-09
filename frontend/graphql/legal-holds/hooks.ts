"use client";

import { useQuery, useMutation } from "@apollo/client/react";
import { GET_LEGAL_HOLDS, GET_LEGAL_HOLD_OPTIONS } from "./queries";
import {
  CREATE_LEGAL_HOLD,
  UPDATE_LEGAL_HOLD,
  RELEASE_LEGAL_HOLD,
  DELETE_LEGAL_HOLD,
} from "./mutations";
import type {
  CreateLegalHoldResult,
  DeleteLegalHoldResult,
  LegalHoldOptionsData,
  LegalHoldsQueryData,
  LegalHoldsQueryVariables,
  ReleaseLegalHoldResult,
  UpdateLegalHoldResult,
} from "./types";

export function useLegalHolds(variables?: LegalHoldsQueryVariables) {
  const { data, loading, error, refetch } = useQuery<
    LegalHoldsQueryData,
    LegalHoldsQueryVariables
  >(GET_LEGAL_HOLDS, {
    variables: variables ?? {},
    fetchPolicy: "cache-and-network",
  });

  return {
    holds: data?.legalHolds ?? [],
    loading,
    error,
    refetch,
  };
}

export function useLegalHoldOptions() {
  const { data, loading, error } = useQuery<LegalHoldOptionsData>(
    GET_LEGAL_HOLD_OPTIONS,
    { fetchPolicy: "cache-first" },
  );
  return {
    holdTypes: data?.legalHoldOptions?.holdTypes ?? [],
    statuses: data?.legalHoldOptions?.statuses ?? [],
    loading,
    error,
  };
}

export function useCreateLegalHold() {
  return useMutation<CreateLegalHoldResult>(CREATE_LEGAL_HOLD, {
    refetchQueries: [{ query: GET_LEGAL_HOLDS, variables: {} }],
    awaitRefetchQueries: false,
  });
}

export function useUpdateLegalHold() {
  return useMutation<UpdateLegalHoldResult>(UPDATE_LEGAL_HOLD, {
    refetchQueries: [{ query: GET_LEGAL_HOLDS, variables: {} }],
    awaitRefetchQueries: false,
  });
}

export function useReleaseLegalHold() {
  return useMutation<ReleaseLegalHoldResult>(RELEASE_LEGAL_HOLD, {
    refetchQueries: [{ query: GET_LEGAL_HOLDS, variables: {} }],
    awaitRefetchQueries: false,
  });
}

export function useDeleteLegalHold() {
  return useMutation<DeleteLegalHoldResult>(DELETE_LEGAL_HOLD, {
    refetchQueries: [{ query: GET_LEGAL_HOLDS, variables: {} }],
    awaitRefetchQueries: false,
  });
}
