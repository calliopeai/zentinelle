import { renderHook, waitFor } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it } from "vitest";

import { useApiKeys } from "@/graphql/api-keys/hooks";
import {
  useLegalHoldOptions,
  useLegalHolds,
} from "@/graphql/legal-holds/hooks";
import { useMyOrganization } from "@/graphql/settings/hooks";

import {
  apiKeyMocks,
  apiKeys,
  legalHoldMocks,
  legalHoldOptions,
  legalHolds,
  organization,
  organizationMocks,
} from "../../storybook/fixtures/settings";
import { GraphQLMocks, type GraphQLMock } from "../../storybook/graphql";

/** The Settings fixtures answer the app's own hooks, so the stories show what the routes will read. */
function wrapper(mocks: readonly GraphQLMock[]) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GraphQLMocks mocks={mocks}>{children}</GraphQLMocks>;
  };
}

describe("Settings fixtures through the app's hooks", () => {
  it("answers GetMyOrganization", async () => {
    const { result } = renderHook(() => useMyOrganization(), {
      wrapper: wrapper(organizationMocks.full),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organization).toEqual(organization.myOrganization);
  });

  it("answers ApiKeys whatever the search", async () => {
    const { result } = renderHook(() => useApiKeys({ search: "ci" }), {
      wrapper: wrapper(apiKeyMocks.full),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeUndefined();
    expect(result.current.keys).toEqual(apiKeys.apiKeys);
  });

  it("answers LegalHolds and LegalHoldOptions", async () => {
    const { result } = renderHook(
      () => ({
        holds: useLegalHolds({ status: "active" }),
        options: useLegalHoldOptions(),
      }),
      {
        wrapper: wrapper(legalHoldMocks.full),
      },
    );
    await waitFor(() =>
      expect(
        result.current.holds.loading || result.current.options.loading,
      ).toBe(false),
    );
    expect(result.current.holds.holds).toEqual(legalHolds.legalHolds);
    expect(result.current.options.holdTypes).toEqual(
      legalHoldOptions.legalHoldOptions?.holdTypes,
    );
  });

  it("fails as the server fails", async () => {
    const { result } = renderHook(() => useApiKeys(), {
      wrapper: wrapper(apiKeyMocks.error),
    });
    await waitFor(() => expect(result.current.error).toBeDefined());
  });
});
