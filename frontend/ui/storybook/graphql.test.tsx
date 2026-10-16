import { renderHook, waitFor } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it } from "vitest";

import { useEndpoints } from "@/graphql/agents/hooks";
import { useDashboardStats } from "@/graphql/dashboard/hooks";

import { agentsMocks, endpoints } from "./fixtures/agents";
import { dashboardMocks, dashboardStats } from "./fixtures/dashboard";
import { GraphQLMocks, type GraphQLMock } from "./graphql";

/** The story mocks answer the app's own hooks, so a screen story and its route read the same data. */
function wrapper(mocks: readonly GraphQLMock[]) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GraphQLMocks mocks={mocks}>{children}</GraphQLMocks>;
  };
}

describe("story GraphQL mocks", () => {
  it("answers DashboardStats with the fixture", async () => {
    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: wrapper(dashboardMocks.full),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeUndefined();
    expect(result.current.stats).toEqual(dashboardStats.dashboardStats);
  });

  it("answers GetEndpoints whatever its variables", async () => {
    const { result } = renderHook(() => useEndpoints({ status: "active" }), {
      wrapper: wrapper(agentsMocks.full),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.endpoints).toEqual(endpoints.endpoints);
  });

  it("holds the loading state", async () => {
    const { result } = renderHook(() => useEndpoints(), {
      wrapper: wrapper(agentsMocks.loading),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.loading).toBe(true);
  });

  it("fails as the server fails", async () => {
    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: wrapper(dashboardMocks.error),
    });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toMatch(/went wrong/);
  });
});
