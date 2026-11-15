"use client";

/**
 * Models & usage wired to the operations the app already sends: usage from
 * `GetUsageMetrics`, the registry from `AiModels`, and the admin REST
 * surfaces (showback, route check, provider keys and models). Each
 * container maps the answer with ./usage, ./anomalies, ./models or
 * ./providers and renders the pure screen; the routes under app/ render
 * these. Writes report failures in place or as a toast.
 */
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { useAIModels } from "@/graphql/models/hooks";
import { useUsageMetrics } from "@/graphql/usage/hooks";
import { authenticatedFetch } from "@/lib/auth/fetch";

import { useDebounced } from "../../shared/use-debounced";
import { detectAnomalies, tokenBaseline } from "./anomalies";
import { AnomaliesScreen, type AnomalyFilter } from "./AnomaliesScreen";
import type { ShowbackGroup, ShowbackReport } from "./budgets";
import { BudgetsScreen } from "./BudgetsScreen";
import { CompareModelsScreen } from "./CompareModelsScreen";
import { providerOptions } from "./models";
import { ModelsScreen } from "./ModelsScreen";
import {
  toProviderRows,
  type CanaryResult,
  type ProviderModel,
  type StoredProviderKey,
} from "./providers";
import { ProvidersScreen, type ProviderFilter } from "./ProvidersScreen";
import { RouteCheckScreen } from "./RouteCheckScreen";
import { periodRange, toUsageOverview, type Period } from "./usage";
import { UsageOverviewScreen } from "./UsageOverviewScreen";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "/api/zentinelle/v1";

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const message = body.detail ?? body.error;
    throw new Error(typeof message === "string" ? message : "");
  }
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** The area's REST calls; stories pass their own. */
export interface ModelsRestClient {
  showback: (group: ShowbackGroup) => Promise<ShowbackReport>;
  canaries: () => Promise<CanaryResult[]>;
  runCanary: (route: { provider: string; model: string }) => Promise<unknown>;
  rollback: (id: string) => Promise<unknown>;
  providers: () => Promise<{
    available: string[];
    stored: StoredProviderKey[];
  }>;
  saveKey: (provider: string, apiKey: string) => Promise<unknown>;
  removeKey: (provider: string) => Promise<unknown>;
  setAssistant: (provider: string, enabled: boolean) => Promise<unknown>;
  providerModels: (provider: string) => Promise<ProviderModel[]>;
  saveProviderModels: (provider: string, ids: string[]) => Promise<unknown>;
}

export const modelsRest: ModelsRestClient = {
  showback: (group) => rest(`/budgets/showback?group_by=${group}`),
  canaries: async () =>
    (await rest<{ results?: CanaryResult[] }>("/models/route-canary"))
      .results ?? [],
  runCanary: (route) => rest("/models/route-canary", send("POST", route)),
  rollback: (id) =>
    rest(
      `/models/route-canary/${encodeURIComponent(id)}/rollback`,
      send("POST"),
    ),
  providers: async () => {
    const [available, stored] = await Promise.all([
      rest<{ providers?: { id: string }[] }>("/assistant/providers"),
      rest<{ providers?: StoredProviderKey[] }>("/settings/llm-providers"),
    ]);
    return {
      available: (available.providers ?? []).map((p) => p.id),
      stored: stored.providers ?? [],
    };
  },
  saveKey: (provider, apiKey) =>
    rest("/settings/llm-providers", send("POST", { provider, apiKey })),
  removeKey: (provider) =>
    rest(
      `/settings/llm-providers/${encodeURIComponent(provider)}`,
      send("DELETE"),
    ),
  setAssistant: (provider, enabled) =>
    rest(
      "/settings/llm-providers",
      send("PATCH", { provider, enabledForAssistant: enabled }),
    ),
  providerModels: async (provider) =>
    (
      await rest<{ models?: ProviderModel[] }>(
        `/assistant/models?provider=${encodeURIComponent(provider)}`,
      )
    ).models ?? [],
  saveProviderModels: (provider, ids) =>
    rest(
      "/assistant/models/bulk",
      send("POST", { provider, enabled_ids: ids }),
    ),
};

/** A REST read with retry; `null` key skips it. */
function useRest<T>(load: () => Promise<T>, key: string | null) {
  const [result, setResult] = React.useState<{
    key: string;
    value?: T;
    error?: Error;
  } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    if (key === null) return;
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
  const current = key !== null && result?.key === key ? result : null;
  return {
    loading: key !== null && !current,
    value: current?.value,
    error: current?.error ?? null,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}

/** The error, worded by `fallback` when the server said nothing. */
function worded(error: Error | null, fallback: string) {
  return error && !error.message ? new Error(fallback) : error;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** `/usage`: `GetUsageMetrics` over the chosen period. */
export function UsageOverviewConnected({
  capabilities,
  now,
}: {
  capabilities: readonly string[];
  /** The end of every period; stories pin it. */
  now?: Date;
}) {
  const [period, setPeriod] = React.useState<Period>("30");
  const range = React.useMemo(
    () => periodRange(period, now ?? new Date()),
    [period, now],
  );
  const { metrics, loading, error, refetch } = useUsageMetrics(range);
  return (
    <UsageOverviewScreen
      capabilities={capabilities}
      period={period}
      onPeriodChange={setPeriod}
      overview={toUsageOverview(metrics)}
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
    />
  );
}

/** `/usage/anomalies`: `GetUsageMetrics` over the last 30 days, run through the detector. */
export function AnomaliesConnected({
  capabilities,
  now,
}: {
  capabilities: readonly string[];
  now?: Date;
}) {
  const [filter, setFilter] = React.useState<AnomalyFilter>("all");
  const range = React.useMemo(
    () => periodRange("30", now ?? new Date()),
    [now],
  );
  const { metrics, loading, error, refetch } = useUsageMetrics(range);
  return (
    <AnomaliesScreen
      capabilities={capabilities}
      anomalies={detectAnomalies(metrics, range.endDate)}
      baseline={tokenBaseline(metrics)}
      filter={filter}
      onFilterChange={setFilter}
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
    />
  );
}

/** `/usage/budgets`: REST `budgets/showback?group_by=`. */
export function BudgetsConnected({
  capabilities,
  client = modelsRest,
}: {
  capabilities: readonly string[];
  client?: ModelsRestClient;
}) {
  const t = useTranslations("models.connected");
  const [group, setGroup] = React.useState<ShowbackGroup>("endpoint");
  const report = useRest(() => client.showback(group), group);
  return (
    <BudgetsScreen
      capabilities={capabilities}
      group={group}
      onGroupChange={setGroup}
      report={report.value ?? null}
      loading={report.loading}
      error={worded(report.error, t("showbackFailed"))}
      onRetry={report.retry}
      onRefresh={report.retry}
    />
  );
}

export interface ModelsConnectedProps {
  capabilities: readonly string[];
  /** `?panel=estimate`, and the model it opened on (`?model=`). */
  estimate: { modelId?: string } | null;
  onEstimate: (estimate: { modelId?: string } | null) => void;
}

/** `/models`: `AiModels` with server search and provider, and the Estimate cost drawer. */
export function ModelsConnected({
  capabilities,
  estimate,
  onEstimate,
}: ModelsConnectedProps) {
  const [search, setSearch] = React.useState("");
  const [provider, setProvider] = React.useState("");
  const query = useDebounced(search);
  const result = useAIModels({
    availableOnly: true,
    search: query || null,
    providerSlug: provider || null,
  });
  const all = useAIModels({ availableOnly: true });
  return (
    <ModelsScreen
      capabilities={capabilities}
      models={result.models}
      loading={result.loading}
      error={result.error}
      onRetry={() => void result.refetch()}
      search={search}
      onSearchChange={setSearch}
      provider={provider}
      onProviderChange={setProvider}
      providers={providerOptions(all.models)}
      estimate={estimate}
      onEstimate={onEstimate}
      allModels={all.models}
    />
  );
}

/** `/models/compare?ids=`: `AiModels`, side by side. */
export function CompareModelsConnected({
  capabilities,
  selectedIds,
  onSelectedChange,
}: {
  capabilities: readonly string[];
  selectedIds: readonly string[];
  onSelectedChange: (ids: string[]) => void;
}) {
  const result = useAIModels({ availableOnly: true });
  return (
    <CompareModelsScreen
      capabilities={capabilities}
      models={result.models}
      selectedIds={selectedIds}
      onSelectedChange={onSelectedChange}
      loading={result.loading}
      error={result.error}
      onRetry={() => void result.refetch()}
    />
  );
}

/** `/models/routes` (admin): REST `models/route-canary`, a run, and a rollback. */
export function RouteCheckConnected({
  capabilities,
  client = modelsRest,
}: {
  capabilities: readonly string[];
  client?: ModelsRestClient;
}) {
  const t = useTranslations("models.connected");
  const admin = capabilities.includes("admin");
  const results = useRest(() => client.canaries(), admin ? "canaries" : null);
  const [running, setRunning] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  return (
    <RouteCheckScreen
      capabilities={capabilities}
      results={results.value ?? []}
      loading={results.loading}
      error={worded(results.error, t("canariesFailed"))}
      onRetry={results.retry}
      running={running}
      runError={runError}
      onRun={async (route) => {
        setRunning(true);
        setRunError(null);
        try {
          await client.runCanary(route);
          results.retry();
        } catch (e) {
          setRunError(message(e, t("runFailed")));
        } finally {
          setRunning(false);
        }
      }}
      onRollback={async (id) => {
        try {
          await client.rollback(id);
          results.retry();
        } catch (e) {
          toast.error(message(e, t("rollbackFailed")));
        }
      }}
    />
  );
}

/** `/models/providers` (admin): provider keys, the assistant's providers, and each provider's models. */
export function ProvidersConnected({
  capabilities,
  client = modelsRest,
}: {
  capabilities: readonly string[];
  client?: ModelsRestClient;
}) {
  const t = useTranslations("models.connected");
  const admin = capabilities.includes("admin");
  const read = useRest(() => client.providers(), admin ? "providers" : null);
  const [filter, setFilter] = React.useState<ProviderFilter>("all");
  const [dialog, setDialog] = React.useState<string | null>(null);
  const models = useRest(
    () => client.providerModels(dialog!),
    dialog ? `models:${dialog}` : null,
  );
  const rows = read.value
    ? toProviderRows(read.value.available, read.value.stored)
    : [];
  return (
    <ProvidersScreen
      capabilities={capabilities}
      providers={rows}
      loading={read.loading}
      error={worded(read.error, t("providersFailed"))}
      onRetry={read.retry}
      filter={filter}
      onFilterChange={setFilter}
      onSaveKey={async (provider, apiKey) => {
        try {
          await client.saveKey(provider, apiKey);
        } catch (e) {
          throw new Error(message(e, t("keyNotSaved")));
        }
        read.retry();
      }}
      onRemoveKey={async (provider) => {
        try {
          await client.removeKey(provider);
        } catch (e) {
          throw new Error(message(e, t("keyNotRemoved")));
        }
        read.retry();
      }}
      onToggleAssistant={async (provider, enabled) => {
        try {
          await client.setAssistant(provider, enabled);
          read.retry();
        } catch (e) {
          toast.error(message(e, t("assistantNotChanged")));
        }
      }}
      modelsDialog={
        dialog
          ? {
              provider: dialog,
              models: models.value ?? null,
              error: worded(models.error, t("modelsFailed")),
            }
          : null
      }
      onModelsDialogChange={setDialog}
      onSaveModels={async (provider, ids) => {
        try {
          await client.saveProviderModels(provider, ids);
        } catch (e) {
          throw new Error(message(e, t("modelsNotSaved")));
        }
      }}
    />
  );
}
