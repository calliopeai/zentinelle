/**
 * GraphQL in stories: the app's real operations (the documents under
 * frontend/graphql, the same objects the hooks send), answered by Apollo's
 * MockLink. A story lists its mocks in `parameters.graphql.mocks`; the
 * preview wraps it in <GraphQLMocks>. Nothing reaches a network.
 *
 * Mocks are built only from imported documents, never from a new gql
 * literal, so graphql/operations.test.ts keeps validating exactly what the
 * app sends.
 */
import { InMemoryCache, type DocumentNode } from "@apollo/client";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { GraphQLError } from "graphql";
import type * as React from "react";

export type GraphQLMock = MockLink.MockedResponse;

export interface GraphQLParameters {
  mocks?: readonly GraphQLMock[];
}

type Variables = Record<string, unknown>;

interface MockOptions<TVariables> {
  /** Exact variables, or a matcher. Absent: answers the operation whatever its variables. */
  variables?: TVariables | ((variables: TVariables) => boolean);
  /** Milliseconds before the answer. */
  delay?: number;
}

function request<TVariables>(
  query: DocumentNode,
  variables: MockOptions<TVariables>["variables"],
) {
  return {
    query,
    variables: (variables ?? (() => true)) as Variables,
  };
}

/** The operation answers with `data`, as many times as it is sent. */
export function mockQuery<TData, TVariables extends Variables = Variables>(
  query: DocumentNode,
  data: TData,
  options: MockOptions<TVariables> = {},
): GraphQLMock {
  return {
    request: request(query, options.variables),
    result: { data: data as Record<string, unknown> },
    delay: options.delay,
    maxUsageCount: Number.POSITIVE_INFINITY,
  };
}

/** The operation never answers: the loading state, held. */
export function mockLoading(query: DocumentNode): GraphQLMock {
  return {
    request: request(query, undefined),
    result: { data: {} },
    delay: Number.POSITIVE_INFINITY,
    maxUsageCount: Number.POSITIVE_INFINITY,
  };
}

/** The operation fails as the backend fails: a GraphQL error with a message. */
export function mockError(
  query: DocumentNode,
  message = "Something went wrong on the server.",
): GraphQLMock {
  return {
    request: request(query, undefined),
    result: { errors: [new GraphQLError(message)] },
    maxUsageCount: Number.POSITIVE_INFINITY,
  };
}

/** An Apollo client that answers from `mocks`, for a story or a test. */
export function GraphQLMocks({
  mocks = [],
  children,
}: GraphQLParameters & { children: React.ReactNode }) {
  return (
    <MockedProvider mocks={mocks} cache={new InMemoryCache()}>
      {children}
    </MockedProvider>
  );
}
