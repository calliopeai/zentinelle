"use client";

import * as React from "react";

import { useEndpoints } from "@/graphql/agents/hooks";
import { useContentViolations } from "@/graphql/content-scanner/hooks";
import { useEvents } from "@/graphql/events/hooks";
import { useInteractionLogs } from "@/graphql/interactions/hooks";
import { useUsageMetrics } from "@/graphql/usage/hooks";
import { authenticatedFetch } from "@/lib/auth/fetch";

import { useArrayTable } from "../../shared/array-table";
import { AgentActivityTab } from "./AgentActivityTab";
import { AgentComplianceTab } from "./AgentComplianceTab";
import {
  AgentControlsTab,
  type AgentControlData,
  type ControlAction,
} from "./AgentControlsTab";
import { AgentDetailScreen, type AgentTab } from "./AgentDetailScreen";
import { AgentInteractionsTab } from "./AgentInteractionsTab";
import {
  AgentPoliciesTab,
  type EffectivePolicyRow,
  type ToolPermissions,
} from "./AgentPoliciesTab";
import { AgentUsageTab } from "./AgentUsageTab";
import { toAgentSummary } from "./format";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "/api/zentinelle/v1";

/** The two REST reads the agent page makes, injectable so stories and tests answer them. */
export interface AgentRestClient {
  /** GET /agents/{agent_id}/control. `denied` for 401 and 403. */
  control: (
    agentId: string,
  ) => Promise<{ denied: true } | { denied: false; data: AgentControlData }>;
  /** POST /agents/{agent_id}/control. */
  act: (agentId: string, action: ControlAction) => Promise<void>;
  /** GET /effective-policy?endpoint={endpoint id}. */
  effective: (
    endpointId: string,
  ) => Promise<{ policies: EffectivePolicyRow[]; tools: ToolPermissions }>;
}

async function messageOf(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string; detail?: string };
    return body.error || body.detail || fallback;
  } catch {
    return fallback;
  }
}

export const restClient: AgentRestClient = {
  async control(agentId) {
    const response = await authenticatedFetch(
      `${API_URL}/agents/${encodeURIComponent(agentId)}/control`,
    );
    if (response.status === 401 || response.status === 403)
      return { denied: true };
    if (!response.ok)
      throw new Error(
        await messageOf(response, "Controls could not be loaded."),
      );
    return { denied: false, data: (await response.json()) as AgentControlData };
  },
  async act(agentId, action) {
    const response = await authenticatedFetch(
      `${API_URL}/agents/${encodeURIComponent(agentId)}/control`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    if (!response.ok)
      throw new Error(
        await messageOf(response, "The control action was not applied."),
      );
  },
  async effective(endpointId) {
    const response = await authenticatedFetch(
      `${API_URL}/effective-policy?endpoint=${encodeURIComponent(endpointId)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok)
      throw new Error(
        await messageOf(response, "Policies could not be loaded."),
      );
    const body = (await response.json()) as {
      policies: EffectivePolicyRow[];
      resolved: { tool_permissions: ToolPermissions };
    };
    return { policies: body.policies, tools: body.resolved.tool_permissions };
  },
};

const NO_FILTER = { isFiltered: false, clearFilters: () => {} };

function useRest<T>(load: () => Promise<T>, key: string) {
  const [result, setResult] = React.useState<{
    key: string;
    value?: T;
    error?: Error;
  } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    load().then(
      (value) => live && setResult({ key, value }),
      (error: unknown) =>
        live &&
        setResult({
          key,
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    );
    return () => {
      live = false;
    };
    // `load` is rebuilt every render; `key` names what it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const current = result?.key === key ? result : null;
  return {
    loading: !current,
    value: current?.value,
    error: current?.error ?? null,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}

function ActivityPanel({ endpointId }: { endpointId: string }) {
  const { events, loading, error, refetch } = useEvents(
    { endpointId },
    { pollInterval: 10000 },
  );
  const table = useArrayTable({
    rows: events,
    loading,
    error,
    retry: () => void refetch(),
    ...NO_FILTER,
  });
  return <AgentActivityTab table={table} />;
}

function InteractionsPanel({ endpointId }: { endpointId: string }) {
  const { interactions, loading, error, refetch } = useInteractionLogs({
    endpointId,
  });
  const table = useArrayTable({
    rows: interactions,
    loading,
    error,
    retry: () => void refetch(),
    ...NO_FILTER,
  });
  return <AgentInteractionsTab table={table} />;
}

function UsagePanel({
  endpointId,
  agentId,
}: {
  endpointId: string;
  agentId: string;
}) {
  const { data, loading, error, refetch } = useUsageMetrics({ endpointId });
  return (
    <AgentUsageTab
      summary={data?.usageMetrics?.summary ?? null}
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
      window="Last 30 days"
      usageHref={`/usage?agent=${encodeURIComponent(agentId)}`}
    />
  );
}

function CompliancePanel({
  endpointId,
  agentId,
}: {
  endpointId: string;
  agentId: string;
}) {
  const { violations, loading, error, refetch } = useContentViolations({
    endpointId,
  });
  const table = useArrayTable({
    rows: violations,
    loading,
    error,
    retry: () => void refetch(),
    ...NO_FILTER,
  });
  return (
    <AgentComplianceTab
      table={table}
      detectionsHref={`/content-rules/detections?agent=${encodeURIComponent(agentId)}`}
    />
  );
}

function ControlsPanel({
  agentId,
  agentName,
  client,
}: {
  agentId: string;
  agentName: string;
  client: AgentRestClient;
}) {
  const control = useRest(() => client.control(agentId), agentId);
  const value = control.value;
  return (
    <AgentControlsTab
      agentName={agentName}
      state={
        control.error
          ? "error"
          : control.loading
            ? "loading"
            : value?.denied
              ? "denied"
              : "ready"
      }
      data={value && !value.denied ? value.data : null}
      error={control.error}
      onRetry={control.retry}
      onAction={async (action) => {
        await client.act(agentId, action);
        control.retry();
      }}
    />
  );
}

function PoliciesPanel({
  endpointId,
  agentId,
  client,
}: {
  endpointId: string;
  agentId: string;
  client: AgentRestClient;
}) {
  const effective = useRest(() => client.effective(endpointId), endpointId);
  const table = useArrayTable({
    rows: effective.value?.policies ?? [],
    loading: effective.loading,
    error: effective.error,
    retry: effective.retry,
    ...NO_FILTER,
  });
  return (
    <AgentPoliciesTab
      table={table}
      tools={effective.value?.tools ?? null}
      effectiveHref={`/policies/effective?agent=${encodeURIComponent(agentId)}`}
    />
  );
}

export interface AgentDetailRouteProps {
  /** The slug from the path: the Astrolift deeplink's agent_id. */
  agentId: string;
  tab: AgentTab;
  capabilities: readonly string[];
  client?: AgentRestClient;
}

/**
 * An agent's page: the endpoint resolved by its slug (GetEndpoints with
 * `search`, matched exactly, as the deeplink route does today), then only
 * the open tab's query. `app/(app)/agents/[agentId]/{tab}` renders this.
 */
export function AgentDetailRoute({
  agentId,
  tab,
  capabilities,
  client = restClient,
}: AgentDetailRouteProps) {
  const { endpoints, loading, error, refetch } = useEndpoints({
    search: agentId,
  });
  const endpoint = endpoints.find((e) => e.agentId === agentId) ?? null;
  const state = error
    ? "error"
    : loading && !endpoint
      ? "loading"
      : endpoint
        ? "ready"
        : "notFound";
  const isAdmin = capabilities.includes("admin");
  let panel: React.ReactNode = null;
  if (endpoint) {
    const id = endpoint.id;
    panel =
      tab === "activity" ? (
        <ActivityPanel endpointId={id} />
      ) : tab === "interactions" ? (
        <InteractionsPanel endpointId={id} />
      ) : tab === "usage" ? (
        <UsagePanel endpointId={id} agentId={agentId} />
      ) : tab === "compliance" ? (
        <CompliancePanel endpointId={id} agentId={agentId} />
      ) : tab === "policies" ? (
        <PoliciesPanel endpointId={id} agentId={agentId} client={client} />
      ) : isAdmin ? (
        <ControlsPanel
          agentId={agentId}
          agentName={endpoint.name}
          client={client}
        />
      ) : (
        <AgentControlsTab
          agentName={endpoint.name}
          state="denied"
          data={null}
          onAction={async () => {}}
        />
      );
  }
  return (
    <AgentDetailScreen
      agentId={agentId}
      state={state}
      agent={endpoint ? toAgentSummary(endpoint) : null}
      error={error}
      onRetry={() => void refetch()}
      tab={tab}
      capabilities={capabilities}
    >
      {panel}
    </AgentDetailScreen>
  );
}
