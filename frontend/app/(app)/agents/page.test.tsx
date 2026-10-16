// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CapabilityProvider } from "@/components/PermissionGuard";
import type { EndpointData } from "@/graphql/agents/types";
import { ConfirmProvider } from "@/hooks/use-confirm";
import messages from "@/messages/en.json";

import AgentsPage from "./page";

const { agents } = vi.hoisted(() => {
  const agent = (agentId: string, name: string): EndpointData => ({
    id: `id-${agentId}`,
    agentId,
    agentType: "claude_code",
    name,
    description: "",
    status: "active",
    health: "healthy",
    capabilities: [],
    metadata: null,
    lastHeartbeat: null,
    apiKeyPrefix: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    deploymentName: null,
    agentGroup: null,
  });
  return {
    agents: [
      agent("billing-assistant", "Billing assistant"),
      agent("code_reviewer_2", "Code reviewer"),
    ],
  };
});

vi.mock("@/graphql/agents/hooks", () => ({
  useEndpoints: () => ({ endpoints: agents, loading: false, refetch: vi.fn() }),
}));
vi.mock("@/graphql/agent-groups/hooks", () => ({
  useAgentGroups: () => ({ groups: [], loading: false, refetch: vi.fn() }),
}));

beforeEach(() => {
  // The type chart sizes itself with a ResizeObserver, which jsdom lacks.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  render(
    <MockedProvider>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <CapabilityProvider
          user={{
            id: "1",
            username: "viewer",
            email: "",
            is_staff: false,
            is_superuser: false,
            capabilities: ["view"],
          }}
        >
          <ConfirmProvider>
            <AgentsPage />
          </ConfirmProvider>
        </CapabilityProvider>
      </NextIntlClientProvider>
    </MockedProvider>,
  );
}

describe("the agents list", () => {
  it("links every agent row to that agent's page", () => {
    renderPage();

    for (const agent of agents) {
      const link = screen.getByRole("link", { name: agent.name });
      expect(link.getAttribute("href")).toBe(`/agents/${agent.agentId}`);
      expect(link.closest("tr")?.textContent).toContain(agent.agentId);
    }
  });
});
