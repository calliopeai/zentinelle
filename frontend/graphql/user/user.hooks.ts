"use client";

import { useQuery } from "@apollo/client/react";
import { GET_ME } from "./user.queries";
import type { MeQueryData, CurrentUser } from "./user.types";

export function useMe() {
  const { data, loading, error, refetch } = useQuery<MeQueryData>(GET_ME);

  const user: CurrentUser | null = data?.me ?? null;

  return { data, user, loading, error, refetch };
}
