"use client";

import { useMutation } from "@apollo/client/react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { useIncidents } from "@/graphql/risks/hooks";
import {
  ACKNOWLEDGE_INCIDENT,
  CLOSE_INCIDENT,
  RESOLVE_INCIDENT,
} from "@/graphql/risks/mutations";
import { GET_INCIDENTS } from "@/graphql/risks/queries";
import { authenticatedFetch } from "@/lib/auth/fetch";

import { payloadOrThrow } from "../../shared/mutation";
import { IncidentDetailScreen, type IncidentTab } from "./IncidentDetailScreen";
import type { IncidentComment } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "/api/zentinelle/v1";

/** REST `incidents/{id}/comments/`, injectable so stories answer it. */
export interface IncidentCommentsClient {
  list: (incidentId: string) => Promise<IncidentComment[]>;
  post: (incidentId: string, body: string) => Promise<IncidentComment>;
}

async function failure(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { error?: string; detail?: string };
    return new Error(body.error || body.detail || "");
  } catch {
    return new Error("");
  }
}

export const commentsClient: IncidentCommentsClient = {
  async list(incidentId) {
    const response = await authenticatedFetch(
      `${API_URL}/incidents/${encodeURIComponent(incidentId)}/comments/`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw await failure(response);
    const body = (await response.json()) as { results?: IncidentComment[] };
    return [...(body.results ?? [])].sort(
      (a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""),
    );
  },
  async post(incidentId, body) {
    const response = await authenticatedFetch(
      `${API_URL}/incidents/${encodeURIComponent(incidentId)}/comments/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ content: body, body }),
      },
    );
    if (!response.ok) throw await failure(response);
    return (await response.json()) as IncidentComment;
  },
};

type Payload = { success: boolean | null; errors: string[] | null };

export interface IncidentDetailConnectedProps {
  incidentId: string;
  tab: IncidentTab;
  canMutate: boolean;
  client?: IncidentCommentsClient;
}

/**
 * One incident: found in `GetIncidents` by id (the schema has no single
 * incident query), its REST comments, and the acknowledge, resolve and
 * close mutations. `app/(app)/incidents/[id]` and its `evidence` and
 * `comments` tabs render this.
 */
export function IncidentDetailConnected({
  incidentId,
  tab,
  canMutate,
  client = commentsClient,
}: IncidentDetailConnectedProps) {
  const t = useTranslations("activity.incidents");
  const { incidents, loading, error, refetch } = useIncidents();
  const incident = incidents.find((i) => i.id === incidentId) ?? null;

  const [comments, setComments] = React.useState<{
    rows: IncidentComment[];
    loading: boolean;
    error: Error | null;
  }>({ rows: [], loading: true, error: null });
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    client.list(incidentId).then(
      (rows) => live && setComments({ rows, loading: false, error: null }),
      (e: unknown) =>
        live &&
        setComments({
          rows: [],
          loading: false,
          error:
            e instanceof Error && e.message
              ? e
              : new Error(t("errors.comments")),
        }),
    );
    return () => {
      live = false;
    };
  }, [client, incidentId, attempt, t]);

  const options = { refetchQueries: [GET_INCIDENTS] };
  const [acknowledge] = useMutation<{ acknowledgeIncident: Payload }>(
    ACKNOWLEDGE_INCIDENT,
    options,
  );
  const [resolve] = useMutation<{ resolveIncident: Payload }>(
    RESOLVE_INCIDENT,
    options,
  );
  const [close] = useMutation<{ closeIncident: Payload }>(
    CLOSE_INCIDENT,
    options,
  );

  return (
    <IncidentDetailScreen
      tab={tab}
      incident={incident}
      loading={loading && !incident}
      error={error ?? null}
      onRetry={() => void refetch()}
      comments={{
        ...comments,
        onRetry: () => {
          setComments((c) => ({ ...c, loading: true, error: null }));
          setAttempt((n) => n + 1);
        },
      }}
      evidenceHref={`${API_URL}/incidents/${encodeURIComponent(incidentId)}/evidence/`}
      canMutate={canMutate}
      onAcknowledge={async () => {
        try {
          const { data } = await acknowledge({ variables: { id: incidentId } });
          payloadOrThrow(data?.acknowledgeIncident, t("errors.acknowledge"));
        } catch (e) {
          toast.error(
            e instanceof Error && e.message
              ? e.message
              : t("errors.acknowledge"),
          );
        }
      }}
      onResolve={async (resolution) => {
        const { data } = await resolve({
          variables: { id: incidentId, resolution },
        });
        payloadOrThrow(data?.resolveIncident, t("errors.resolve"));
      }}
      onClose={async () => {
        const { data } = await close({ variables: { id: incidentId } });
        payloadOrThrow(data?.closeIncident, t("errors.close"));
      }}
      onComment={async (body) => {
        try {
          const created = await client.post(incidentId, body);
          setComments((c) => ({ ...c, rows: [...c.rows, created] }));
        } catch (e) {
          throw e instanceof Error && e.message
            ? e
            : new Error(t("errors.comment"));
        }
      }}
    />
  );
}
