import { renderHook, waitFor } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it } from "vitest";

import { useAIModels } from "@/graphql/models/hooks";
import { useUsageMetrics } from "@/graphql/usage/hooks";

import { fixedList } from "../../shared/table";
import { formatUsd } from "../../shared/figures";
import {
  FIXTURE_END,
  aiModelMocks,
  aiModels,
  emptyUsageMetrics,
  usageMetrics,
  usageMocks,
} from "../../storybook/fixtures/models";
import { GraphQLMocks, type GraphQLMock } from "../../storybook/graphql";
import { detectAnomalies, severityOf, tokenBaseline } from "./anomalies";
import { modelsTabs } from "./frame";
import { estimateCost, estimateTokens, providerOptions } from "./models";
import { toProviderRows } from "./providers";
import { isEmptyUsage, periodRange, toUsageOverview } from "./usage";

function wrapper(mocks: readonly GraphQLMock[]) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GraphQLMocks mocks={mocks}>{children}</GraphQLMocks>;
  };
}

describe("the area's operations answer the app's own hooks", () => {
  it("GetUsageMetrics", async () => {
    const { result } = renderHook(
      () => useUsageMetrics(periodRange("30", new Date(FIXTURE_END))),
      { wrapper: wrapper(usageMocks.full) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.metrics).toEqual(usageMetrics.usageMetrics);
  });

  it("AiModels", async () => {
    const { result } = renderHook(
      () => useAIModels({ availableOnly: true, search: "claude" }),
      { wrapper: wrapper(aiModelMocks.full) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.models).toEqual(aiModels.aiModels);
  });
});

describe("usage", () => {
  const overview = toUsageOverview(usageMetrics.usageMetrics)!;

  it("ranks the top agents by cost, five at most, skipping zero", () => {
    expect(overview.topAgents.map((a) => a.id)).toEqual([
      "support-bot",
      "triage-agent",
      "research-assistant",
      "billing-helper",
      "code-reviewer",
    ]);
  });

  it("weights latency by calls", () => {
    const m = {
      ...usageMetrics.usageMetrics!,
      byEndpoint: [
        { endpoint: "a", apiCalls: 3, avgLatencyMs: 100 },
        { endpoint: "b", apiCalls: 1, avgLatencyMs: 500 },
        { endpoint: "c", apiCalls: 9, avgLatencyMs: 0 },
      ],
    };
    expect(toUsageOverview(m)!.avgLatencyMs).toBe(200);
    expect(toUsageOverview(m)!.endpointsMeasured).toBe(2);
  });

  it("tells an empty period from a quiet one", () => {
    expect(isEmptyUsage(overview)).toBe(false);
    expect(isEmptyUsage(toUsageOverview(emptyUsageMetrics.usageMetrics)!)).toBe(
      true,
    );
  });

  it("asks for the period ending now", () => {
    expect(periodRange("7", new Date(FIXTURE_END))).toEqual({
      startDate: "2026-10-09T00:00:00.000Z",
      endDate: FIXTURE_END,
    });
  });
});

describe("anomalies", () => {
  const found = detectAnomalies(usageMetrics.usageMetrics, FIXTURE_END);

  it("finds the token and cost spike, the heavy agent and the slow endpoint", () => {
    const ids = found.map((a) => a.id).sort();
    expect(ids).toEqual(
      [
        "agent-support-bot",
        "cost-2026-10-09",
        "latency-research-assistant",
        "tokens-2026-10-09",
      ].sort(),
    );
  });

  it("marks on the baseline exactly the days it detected", () => {
    const marked = tokenBaseline(usageMetrics.usageMetrics).filter(
      (p) => p.marked,
    );
    expect(marked.map((p) => p.label)).toEqual(["Oct 9"]);
  });

  it("finds nothing in an empty period", () => {
    expect(
      detectAnomalies(emptyUsageMetrics.usageMetrics, FIXTURE_END),
    ).toEqual([]);
  });

  it("grades severity by deviation", () => {
    expect([2.1, 2.6, 3.2, 4.5].map(severityOf)).toEqual([
      "low",
      "medium",
      "high",
      "critical",
    ]);
  });
});

describe("models", () => {
  it("estimates at registry prices", () => {
    const sonnet = aiModels.aiModels[0];
    const tokens = estimateTokens("x".repeat(4000));
    expect(tokens).toBe(1000);
    expect(estimateCost(sonnet, tokens, 2)).toEqual({
      outputTokens: 2000,
      input: 0.003,
      output: 0.03,
      total: 0.033,
    });
  });

  it("lists each provider once, by name", () => {
    expect(providerOptions(aiModels.aiModels)).toEqual([
      { value: "anthropic", label: "Anthropic" },
      { value: "google", label: "Google" },
      { value: "openai", label: "OpenAI" },
    ]);
  });

  it("gives Route check to admins only", () => {
    expect(modelsTabs("models", ["view", "mutate"])).toBeUndefined();
    expect(
      modelsTabs("routes", ["view", "mutate", "admin"])?.[1],
    ).toMatchObject({ label: "Route check", active: true });
  });
});

describe("providers", () => {
  it("joins the catalog with the active ids and stored keys", () => {
    const rows = toProviderRows(
      ["anthropic", "ollama"],
      [
        {
          provider: "anthropic",
          keyPrefix: "sk-ant-a",
          isActive: true,
          enabledForAssistant: true,
          updatedAt: FIXTURE_END,
        },
      ],
    );
    expect(rows).toHaveLength(24);
    expect(rows.find((r) => r.id === "anthropic")).toMatchObject({
      active: true,
      storedKey: { keyPrefix: "sk-ant-a" },
    });
    expect(rows.find((r) => r.id === "ollama")).toMatchObject({
      active: true,
      storedKey: null,
      urlOnly: true,
    });
  });
});

describe("shared helpers", () => {
  it("keeps empty and empty-after-filtering apart", () => {
    expect(fixedList({ rows: [] }).state).toBe("empty");
    expect(
      fixedList({ rows: [], search: "x", onSearchChange: () => {} }).state,
    ).toBe("emptyFiltered");
    expect(fixedList({ rows: [], filtered: true }).state).toBe("emptyFiltered");
    expect(fixedList({ rows: [], loading: true }).state).toBe("loading");
    expect(fixedList({ rows: [1], loading: true })).toMatchObject({
      state: "ready",
      isStale: true,
    });
    expect(fixedList({ rows: [1], error: { message: "x" } }).state).toBe(
      "error",
    );
  });

  it("formats money as metering records it", () => {
    expect(formatUsd(412.88)).toBe("$412.88");
    expect(formatUsd(0.018)).toBe("$0.0180");
    expect(formatUsd(null)).toBe("Not reported");
  });
});
