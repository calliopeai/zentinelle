// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IncidentData } from "@/graphql/risks/types";
import messages from "@/messages/en.json";

import IncidentsPage from "./page";

const { incidents, nav } = vi.hoisted(() => {
  const incident = (id: string, title: string): IncidentData => ({
    id,
    title,
    description: "",
    incidentType: "policy_violation",
    severity: "high",
    status: "open",
    affectedUser: null,
    affectedUserCount: null,
    rootCause: null,
    impactAssessment: null,
    resolution: null,
    remediationActions: null,
    lessonsLearned: null,
    occurredAt: null,
    detectedAt: null,
    acknowledgedAt: null,
    resolvedAt: null,
    closedAt: null,
    tags: [],
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    incidentTypeDisplay: null,
    severityDisplay: null,
    statusDisplay: null,
    slaStatus: null,
    timeToAcknowledgeSeconds: null,
    timeToResolveSeconds: null,
    assignedToName: null,
    reportedByName: null,
    endpointName: null,
    deploymentName: null,
    relatedRiskName: null,
    triggeringPolicyName: null,
  });
  return {
    incidents: [
      incident("inc-1", "Secret posted to a chat"),
      incident("inc-2", "Model outside the allow list"),
    ],
    nav: { search: "" },
  };
});

vi.mock("@/graphql/risks/hooks", () => ({
  useIncidents: () => ({ incidents, loading: false, refetch: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}));

beforeEach(() => {
  nav.search = "";
  // The detail dialog loads the incident's comments when it opens.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ count: 0, results: [] })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPage() {
  render(
    <MockedProvider>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <IncidentsPage />
      </NextIntlClientProvider>
    </MockedProvider>,
  );
}

describe("the incidents list", () => {
  it("opens the incident named by ?incident=, as the notification bell links it", async () => {
    nav.search = "incident=inc-2";
    renderPage();

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Model outside the allow list",
      }),
    ).toBeTruthy();
  });

  it("drops the incident from the URL when its dialog closes", async () => {
    nav.search = "incident=inc-1";
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderPage();

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(replaceState).toHaveBeenCalledWith(null, "", "/incidents");
  });

  it("says so when the linked incident is not in the list", () => {
    nav.search = "incident=gone";
    renderPage();

    expect(screen.getByRole("status").textContent).toBe(
      "The linked incident was not found.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens nothing without ?incident=", () => {
    renderPage();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
