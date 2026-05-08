import { useQuery, useMutation } from "@apollo/client/react";
import { GET_API_KEYS } from "./queries";
import {
  CREATE_PLATFORM_API_KEY,
  REVOKE_API_KEY,
  DELETE_API_KEY,
} from "./mutations";

export interface ApiKeyData {
  id: string;
  name: string;
  description?: string;
  keyPrefix: string;
  status: string;
  scopes: string[];
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  createdBy?: string;
}

export function useApiKeys(args?: { search?: string; status?: string }) {
  const { data, loading, error, refetch } = useQuery<{ apiKeys: ApiKeyData[] }>(
    GET_API_KEYS,
    { variables: args, fetchPolicy: "cache-and-network" },
  );
  return { keys: data?.apiKeys ?? [], loading, error, refetch };
}

export function useCreatePlatformApiKey() {
  return useMutation(CREATE_PLATFORM_API_KEY, {
    refetchQueries: [GET_API_KEYS],
  });
}

export function useRevokeApiKey() {
  return useMutation(REVOKE_API_KEY, {
    refetchQueries: [GET_API_KEYS],
  });
}

export function useDeleteApiKey() {
  return useMutation(DELETE_API_KEY, {
    refetchQueries: [GET_API_KEYS],
  });
}
