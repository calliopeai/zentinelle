"use client";

import * as React from "react";

import {
  decideApproval,
  listApprovals,
  type HeldApproval,
} from "@/lib/approvals";

import { ApprovalsScreen } from "./ApprovalsScreen";

export interface ApprovalsClient {
  list: (signal?: AbortSignal) => Promise<HeldApproval[]>;
  decide: (
    requestId: string,
    decision: "approve" | "deny",
    reason: string,
  ) => Promise<void>;
}

const defaultClient: ApprovalsClient = {
  list: listApprovals,
  decide: decideApproval,
};

export interface ApprovalsRouteProps {
  capabilities: readonly string[];
  /** The REST calls of lib/approvals.ts; stories pass their own. */
  client?: ApprovalsClient;
  /** Milliseconds between refreshes. */
  refreshEvery?: number;
}

/**
 * The Approvals route, with #440's guarantees: newest first, a refresh
 * every 15 seconds that never interrupts a decision, decisions held while
 * the inbox is stale, reasons kept through refreshes, and no automatic
 * retry of a decision, since a network failure may follow a saved one.
 */
export function ApprovalsRoute({
  capabilities,
  client = defaultClient,
  refreshEvery = 15000,
}: ApprovalsRouteProps) {
  const canDecide = capabilities.includes("mutate");
  const [requests, setRequests] = React.useState<HeldApproval[]>([]);
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const active = React.useRef<AbortController | null>(null);
  const deciding = React.useRef(false);

  const refresh = React.useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    try {
      const rows = await client.list(controller.signal);
      if (controller.signal.aborted) return;
      setRequests(rows);
      setReasons((old) =>
        Object.fromEntries(
          rows
            .filter((r) => old[r.request_id])
            .map((r) => [r.request_id, old[r.request_id]]),
        ),
      );
      setError("");
    } catch (failure) {
      if (controller.signal.aborted) return;
      setRequests([]);
      setError(
        failure instanceof Error
          ? failure.message
          : "Approvals could not be refreshed.",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [client]);

  React.useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => {
      if (!deciding.current) void refresh();
    }, refreshEvery);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active.current?.abort();
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh, refreshEvery]);

  async function decide(row: HeldApproval, decision: "approve" | "deny") {
    if (
      !canDecide ||
      deciding.current ||
      loading ||
      error ||
      Date.parse(row.expires_at) <= Date.now()
    )
      return;
    deciding.current = true;
    active.current?.abort();
    setBusyId(row.request_id);
    setNotice("");
    try {
      await client.decide(
        row.request_id,
        decision,
        reasons[row.request_id] || "",
      );
      setNotice(
        decision === "approve"
          ? `Request ${row.request_id} approved. The host may retry under current policy.`
          : `Request ${row.request_id} denied.`,
      );
      await refresh();
    } catch (failure) {
      setRequests([]);
      setError(
        failure instanceof Error
          ? failure.message
          : "The decision could not be confirmed. Refresh the inbox.",
      );
    } finally {
      deciding.current = false;
      setBusyId(null);
    }
  }

  return (
    <ApprovalsScreen
      requests={requests}
      loading={loading}
      error={error}
      notice={notice}
      busyId={busyId}
      now={now}
      capabilities={capabilities}
      reasons={reasons}
      onReasonChange={(id, reason) =>
        setReasons((old) => ({ ...old, [id]: reason }))
      }
      onDecide={(row, decision) => void decide(row, decision)}
      onRefresh={() => void refresh()}
    />
  );
}
