"use client";

/**
 * Settings wired to the operations the app already sends: the organization
 * (`GetMyOrganization`), API keys, retention and legal holds (GraphQL), and
 * the admin REST surfaces (runtime settings with their staged changes, the
 * Astrolift integration). Every Settings route is admin-only: without the
 * admin capability a container answers with SettingsForbiddenScreen, never
 * an empty page. The routes under app/ render these.
 */
import { useMutation, useQuery } from "@apollo/client/react";
import { useTranslations } from "next-intl";
import * as React from "react";

import {
  useApiKeys,
  useCreatePlatformApiKey,
  useDeleteApiKey,
  useRevokeApiKey,
} from "@/graphql/api-keys/hooks";
import {
  useCreateLegalHold,
  useDeleteLegalHold,
  useLegalHoldOptions,
  useLegalHolds,
  useReleaseLegalHold,
} from "@/graphql/legal-holds/hooks";
import { GET_LEGAL_HOLDS } from "@/graphql/legal-holds/queries";
import {
  CREATE_RETENTION_POLICY,
  DELETE_RETENTION_POLICY,
  TOGGLE_RETENTION_POLICY_ENABLED,
  UPDATE_RETENTION_POLICY,
} from "@/graphql/retention/mutations";
import { GET_RETENTION_DATA } from "@/graphql/retention/queries";
import {
  useMyOrganization,
  useUpdateOrganizationSettings,
} from "@/graphql/settings/hooks";
import { authenticatedFetch } from "@/lib/auth/fetch";

import { payloadOrThrow } from "../../shared/mutation";
import { useDebounced } from "../../shared/use-debounced";
import { ApiKeysScreen } from "./ApiKeysScreen";
import { AssistantScreen } from "./AssistantScreen";
import { GeneralScreen, type GeneralTab } from "./GeneralScreen";
import { IntegrationsScreen } from "./IntegrationsScreen";
import type {
  AstroliftCluster,
  AstroliftInstall,
  CreatedApiKey,
  EnrollmentCode,
  Loadable,
  RetentionPolicy,
  RuntimeActions,
  RuntimeSnapshot,
} from "./model";
import {
  RetentionScreen,
  type HoldFilters,
  type RetentionTab,
} from "./RetentionScreen";
import { SettingsForbiddenScreen } from "./SettingsForbiddenScreen";

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

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

/** The area's REST calls; stories pass their own. */
export interface SettingsRestClient {
  runtime: () => Promise<RuntimeSnapshot>;
  stage: (settings: Record<string, unknown>) => Promise<unknown>;
  transition: (id: string, status: string) => Promise<unknown>;
  rollback: (revision: number, expected: number) => Promise<unknown>;
  installs: () => Promise<AstroliftInstall[]>;
  enrollmentCode: () => Promise<EnrollmentCode>;
  disconnect: (id: string) => Promise<unknown>;
  revokeCluster: (id: string) => Promise<unknown>;
}

export const settingsRest: SettingsRestClient = {
  runtime: async () => {
    const body = await rest<Partial<RuntimeSnapshot>>("/settings/runtime");
    return {
      settings: body.settings ?? ({} as RuntimeSnapshot["settings"]),
      revision: body.revision ?? 0,
      revisions: body.revisions ?? [],
      pending: body.pending ?? [],
      effective: body.effective ?? {},
    };
  },
  stage: (settings) => rest("/settings/runtime/changes", post({ settings })),
  transition: (id, status) =>
    rest(
      `/settings/runtime/changes/${encodeURIComponent(id)}/transition`,
      post({ status }),
    ),
  rollback: (revision, expected) =>
    rest(
      "/settings/runtime/rollback",
      post({ revision, expected_revision: expected }),
    ),
  installs: async () =>
    (await rest<{ installs?: AstroliftInstall[] }>("/settings/astrolift"))
      .installs ?? [],
  enrollmentCode: () => rest("/settings/astrolift/enrollment-codes", post({})),
  disconnect: (id) =>
    rest(`/settings/astrolift/installs/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  revokeCluster: (id) =>
    rest(`/settings/astrolift/clusters/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

/** A REST read with retry; `null` key skips it. */
function useRest<T>(load: () => Promise<T>, key: string | null): Loadable<T> {
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
    data: current?.value ?? null,
    loading: key !== null && !current,
    error: current?.error ?? null,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}

/** Rethrows with `fallback` when the failure says nothing itself. */
async function or<T>(act: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await act();
  } catch (e) {
    throw new Error(e instanceof Error && e.message ? e.message : fallback);
  }
}

/** Settings is admin-only (ui-overhaul-ia §4.3): other roles get a clean 403. */
function AdminOnly({
  capabilities,
  title,
  children,
}: {
  capabilities: readonly string[];
  /** The function's name under `shell.nav.functions`. */
  title: string;
  children: React.ReactNode;
}) {
  const name = useTranslations("shell.nav.functions");
  if (!capabilities.includes("admin"))
    return <SettingsForbiddenScreen title={name(title)} />;
  return <>{children}</>;
}

/** The runtime snapshot and its staged-change actions, shared by General > Runtime and Assistant. */
function useRuntime(client: SettingsRestClient, enabled: boolean) {
  const t = useTranslations("settings.connected");
  const runtime = useRest(() => client.runtime(), enabled ? "runtime" : null);
  const actions: RuntimeActions = {
    onStage: async (settings) => {
      await or(() => client.stage(settings), t("notStaged"));
      runtime.retry?.();
    },
    onTransition: async (change, status) => {
      await or(() => client.transition(change.id, status), t("notMoved"));
      runtime.retry?.();
    },
    onRollback: async (revision, expected) => {
      await or(() => client.rollback(revision, expected), t("notRolledBack"));
      runtime.retry?.();
    },
  };
  return { runtime, actions };
}

export interface GeneralConnectedProps {
  capabilities: readonly string[];
  tab: GeneralTab;
  client?: SettingsRestClient;
}

/** `/settings`: `GetMyOrganization` and `UpdateOrganizationSettings`; Runtime on REST `settings/runtime`. */
export function GeneralConnected({
  capabilities,
  tab,
  client = settingsRest,
}: GeneralConnectedProps) {
  const t = useTranslations("settings.connected");
  const admin = capabilities.includes("admin");
  const { organization, loading, error, refetch } = useMyOrganization();
  const [update] = useUpdateOrganizationSettings();
  const { runtime, actions } = useRuntime(client, admin && tab === "runtime");
  return (
    <AdminOnly capabilities={capabilities} title="general">
      <GeneralScreen
        tab={tab}
        organization={{
          data: organization ?? null,
          loading,
          error: error ?? null,
          retry: () => void refetch(),
        }}
        onSaveOrganization={async (settings) => {
          const { data } = await update({ variables: { settings } });
          payloadOrThrow(
            (data as { updateOrganizationSettings?: { success?: boolean } })
              ?.updateOrganizationSettings,
            t("organizationNotSaved"),
          );
        }}
        runtime={runtime}
        runtimeActions={actions}
      />
    </AdminOnly>
  );
}

/** `/settings/assistant`: the assistant's keys of `settings/runtime`, staged like every runtime change. */
export function SettingsAssistantConnected({
  capabilities,
  client = settingsRest,
}: {
  capabilities: readonly string[];
  client?: SettingsRestClient;
}) {
  const { runtime, actions } = useRuntime(
    client,
    capabilities.includes("admin"),
  );
  return (
    <AdminOnly capabilities={capabilities} title="assistant">
      <AssistantScreen runtime={runtime} actions={actions} />
    </AdminOnly>
  );
}

type KeyPayload = { ok?: boolean | null; error?: string | null };

/** `/settings/api-keys`: `ApiKeys` with server search, and create, revoke and delete. */
export function ApiKeysConnected({
  capabilities,
}: {
  capabilities: readonly string[];
}) {
  const t = useTranslations("settings.connected");
  const [search, setSearch] = React.useState("");
  const query = useDebounced(search);
  const { keys, loading, error, refetch } = useApiKeys({
    search: query || undefined,
  });
  const [create] = useCreatePlatformApiKey();
  const [revoke] = useRevokeApiKey();
  const [remove] = useDeleteApiKey();
  const [created, setCreated] = React.useState<CreatedApiKey | null>(null);
  const check = (payload: KeyPayload | undefined, fallback: string) =>
    payloadOrThrow(
      payload ? { success: payload.ok, error: payload.error } : null,
      fallback,
    );
  return (
    <AdminOnly capabilities={capabilities} title="api-keys">
      <ApiKeysScreen
        keys={{
          data: keys,
          loading,
          error: error ?? null,
          retry: () => void refetch(),
        }}
        search={search}
        onSearchChange={setSearch}
        onCreate={async ({ name, scopes }) => {
          const { data } = await create({ variables: { name, scopes } });
          const payload = (
            data as {
              createPlatformApiKey?: KeyPayload & {
                apiKey?: string | null;
                keyPrefix?: string | null;
              };
            }
          )?.createPlatformApiKey;
          check(payload, t("keyNotCreated"));
          if (!payload?.apiKey) throw new Error(t("keyNotCreated"));
          setCreated({
            apiKey: payload.apiKey,
            keyPrefix: payload.keyPrefix ?? "",
            name,
          });
        }}
        onRevoke={async (key) => {
          const { data } = await revoke({ variables: { id: key.id } });
          check(
            (data as { revokeApiKey?: KeyPayload })?.revokeApiKey,
            t("keyNotRevoked"),
          );
        }}
        onDelete={async (key) => {
          const { data } = await remove({ variables: { id: key.id } });
          check(
            (data as { deleteApiKey?: KeyPayload })?.deleteApiKey,
            t("keyNotDeleted"),
          );
        }}
        created={created}
        onDismissCreated={() => setCreated(null)}
      />
    </AdminOnly>
  );
}

/** `/settings/astrolift`: REST `settings/astrolift`, enrollment codes, and disconnecting installs and clusters. */
export function IntegrationsConnected({
  capabilities,
  client = settingsRest,
  zentinelleUrl,
}: {
  capabilities: readonly string[];
  client?: SettingsRestClient;
  /** This console's address, which Astrolift enrolls against; the page's origin by default. */
  zentinelleUrl?: string;
}) {
  const t = useTranslations("settings.connected");
  const installs = useRest(
    () => client.installs(),
    capabilities.includes("admin") ? "installs" : null,
  );
  const [code, setCode] = React.useState<EnrollmentCode | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => {
    const timer = window.setTimeout(() => setOrigin(window.location.origin), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <AdminOnly capabilities={capabilities} title="integrations">
      <IntegrationsScreen
        installs={installs}
        zentinelleUrl={zentinelleUrl ?? origin}
        generating={generating}
        onGenerateCode={async () => {
          setGenerating(true);
          try {
            setCode(await or(() => client.enrollmentCode(), t("codeFailed")));
          } finally {
            setGenerating(false);
          }
        }}
        code={code}
        onCloseCode={() => setCode(null)}
        onDisconnect={async (install: AstroliftInstall) => {
          await or(() => client.disconnect(install.id), t("notDisconnected"));
          installs.retry?.();
        }}
        onRevokeCluster={async (cluster: AstroliftCluster) => {
          await or(() => client.revokeCluster(cluster.id), t("notRevoked"));
          installs.retry?.();
        }}
      />
    </AdminOnly>
  );
}

type Payload = {
  success?: boolean | null;
  errors?: readonly string[] | null;
};

/** `/settings/retention` and `/legal-holds`: `RetentionData`, `LegalHolds`, `LegalHoldOptions`, and their mutations. */
export function RetentionConnected({
  capabilities,
  tab,
}: {
  capabilities: readonly string[];
  tab: RetentionTab;
}) {
  const t = useTranslations("settings.connected");
  const admin = capabilities.includes("admin");
  const retention = useQuery<{
    retentionPolicies: RetentionPolicy[];
    legalHolds: { isActive: boolean | null }[];
  }>(GET_RETENTION_DATA, { skip: !admin });
  const [filters, setFilters] = React.useState<HoldFilters>({
    holdType: "",
    status: "",
  });
  const holds = useLegalHolds({
    holdType: filters.holdType || null,
    status: filters.status || null,
  });
  const options = useLegalHoldOptions();
  const refetch = { refetchQueries: [GET_RETENTION_DATA, GET_LEGAL_HOLDS] };
  const [createPolicy] = useMutation<{ createRetentionPolicy: Payload }>(
    CREATE_RETENTION_POLICY,
    refetch,
  );
  const [updatePolicy] = useMutation<{ updateRetentionPolicy: Payload }>(
    UPDATE_RETENTION_POLICY,
    refetch,
  );
  const [togglePolicy] = useMutation<{
    toggleRetentionPolicyEnabled: Payload;
  }>(TOGGLE_RETENTION_POLICY_ENABLED, refetch);
  const [deletePolicy] = useMutation<{ deleteRetentionPolicy: Payload }>(
    DELETE_RETENTION_POLICY,
    refetch,
  );
  const [createHold] = useCreateLegalHold();
  const [releaseHold] = useReleaseLegalHold();
  const [deleteHold] = useDeleteLegalHold();
  const asOptions = (
    list:
      readonly { value?: string | null; label?: string | null }[] | undefined,
  ) =>
    (list ?? [])
      .filter((o) => o.value)
      .map((o) => ({ value: o.value!, label: o.label ?? o.value! }));
  const opts = options;
  return (
    <AdminOnly capabilities={capabilities} title="retention">
      <RetentionScreen
        tab={tab}
        policies={{
          data: retention.data?.retentionPolicies ?? null,
          loading: retention.loading,
          error: retention.error ?? null,
          retry: () => void retention.refetch(),
        }}
        activeHolds={
          retention.data?.legalHolds.filter((h) => h.isActive).length
        }
        policyActions={{
          onSave: async (input, policy) => {
            if (policy) {
              const { data } = await updatePolicy({
                variables: { input: { id: policy.id, ...input } },
              });
              payloadOrThrow(data?.updateRetentionPolicy, t("policyNotSaved"));
            } else {
              const { data } = await createPolicy({ variables: { input } });
              payloadOrThrow(data?.createRetentionPolicy, t("policyNotSaved"));
            }
          },
          onToggle: async (policy, enabled) => {
            const { data } = await togglePolicy({
              variables: { id: policy.id, enabled },
            });
            payloadOrThrow(
              data?.toggleRetentionPolicyEnabled,
              t("policyNotChanged"),
            );
          },
          onDelete: async (policy) => {
            const { data } = await deletePolicy({
              variables: { id: policy.id },
            });
            payloadOrThrow(data?.deleteRetentionPolicy, t("policyNotDeleted"));
          },
        }}
        holds={{
          data: holds.holds ?? null,
          loading: holds.loading,
          error: holds.error ?? null,
          retry: () => void holds.refetch(),
        }}
        holdTypes={asOptions(opts?.holdTypes)}
        holdStatuses={asOptions(opts?.statuses)}
        filters={filters}
        onFiltersChange={setFilters}
        holdActions={{
          onCreate: async (input) => {
            const { data } = await createHold({
              variables: {
                input: {
                  ...input,
                  entityTypes: input.appliesToAll ? null : input.entityTypes,
                  effectiveDate: input.effectiveDate || null,
                  expirationDate: input.expirationDate || null,
                  custodianEmail: input.custodianEmail || null,
                  referenceNumber: input.referenceNumber || null,
                },
              },
              refetchQueries: [GET_RETENTION_DATA, GET_LEGAL_HOLDS],
            });
            payloadOrThrow(
              (data as { createLegalHold?: Payload })?.createLegalHold,
              t("holdNotCreated"),
            );
          },
          onRelease: async (hold) => {
            const { data } = await releaseHold({
              variables: { id: hold.id },
              refetchQueries: [GET_RETENTION_DATA, GET_LEGAL_HOLDS],
            });
            payloadOrThrow(
              (data as { releaseLegalHold?: Payload })?.releaseLegalHold,
              t("holdNotReleased"),
            );
          },
          onDelete: async (hold) => {
            const { data } = await deleteHold({
              variables: { id: hold.id },
              refetchQueries: [GET_RETENTION_DATA, GET_LEGAL_HOLDS],
            });
            payloadOrThrow(
              (data as { deleteLegalHold?: Payload })?.deleteLegalHold,
              t("holdNotDeleted"),
            );
          },
        }}
      />
    </AdminOnly>
  );
}
