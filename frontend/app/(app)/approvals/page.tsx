"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCapability } from "@/components/PermissionGuard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  decideApproval,
  listApprovals,
  type HeldApproval,
} from "@/lib/approvals";

function ContextField({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-all text-sm">
        {typeof value === "string" ? value : JSON.stringify(value)}
      </dd>
    </div>
  );
}

export default function ApprovalsPage() {
  const canDecide = useCapability("mutate");
  const [requests, setRequests] = useState<HeldApproval[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const active = useRef<AbortController | null>(null);
  const deciding = useRef(false);

  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const rows = await listApprovals(controller.signal);
      if (controller.signal.aborted) return;
      setRequests(rows);
      setReasons((old) =>
        Object.fromEntries(
          rows
            .filter((row) => old[row.request_id])
            .map((row) => [row.request_id, old[row.request_id]]),
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
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => {
      if (!deciding.current) {
        setLoading(true);
        void refresh();
      }
    }, 15000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active.current?.abort();
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh]);

  const decide = useCallback(
    async (row: HeldApproval, decision: "approve" | "deny") => {
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
      setBusy(row.request_id);
      setNotice("");
      try {
        await decideApproval(
          row.request_id,
          decision,
          reasons[row.request_id] || "",
        );
        setNotice(
          `Request ${row.request_id} ${decision === "approve" ? "approved. The host may retry under current policy." : "denied."}`,
        );
        await refresh();
      } catch (failure) {
        // Never retry a POST automatically: a network failure may follow a saved decision.
        setRequests([]);
        setError(
          failure instanceof Error
            ? failure.message
            : "The decision could not be confirmed. Refresh the inbox.",
        );
      } finally {
        deciding.current = false;
        setBusy(null);
      }
    },
    [canDecide, loading, error, reasons, refresh],
  );

  return (
    <main className="min-w-0 space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Approvals</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Held agent actions awaiting a human decision. Refreshes every 15
            seconds; newest requests first.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
          disabled={loading || busy !== null}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {!canDecide && (
        <p className="rounded-md border p-3 text-sm">
          You have view-only access. An operator or administrator must approve
          or deny requests.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border p-3 text-sm break-words">
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="border-destructive text-destructive rounded-md border p-3 text-sm"
        >
          {error}
        </p>
      )}
      {!error && !loading && requests.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No pending approvals</CardTitle>
            <CardDescription>
              New held requests will appear here. Decided and expired requests
              are excluded.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {requests.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {requests.length} pending{" "}
          {requests.length === 1 ? "request" : "requests"}
          {requests.length === 100 ? " (showing the newest 100)" : ""}
        </p>
      )}
      <div className="space-y-4" aria-busy={loading || busy !== null}>
        {requests.map((row) => {
          const seconds = Math.max(
            0,
            Math.ceil((Date.parse(row.expires_at) - now) / 1000),
          );
          const context = row.context;
          const disabled = loading || busy !== null || seconds === 0 || !!error;
          return (
            <Card
              key={row.request_id}
              className="min-w-0"
              aria-label={`Request ${row.request_id}`}
            >
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="min-w-0 break-all">
                    {typeof context.tool_name === "string"
                      ? context.tool_name
                      : row.action}
                  </CardTitle>
                  <Badge variant={seconds ? "secondary" : "outline"}>
                    {seconds
                      ? `${Math.floor(seconds / 60)}m ${seconds % 60}s left`
                      : "Expired"}
                  </Badge>
                </div>
                <CardDescription className="break-words">
                  {row.reason || "Policy requires a human decision."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <ContextField
                    label="Agent"
                    value={row.agent_id || "Unknown agent"}
                  />
                  <ContextField
                    label="User"
                    value={row.user_id ?? "Not provided"}
                  />
                  <ContextField label="Action" value={row.action} />
                  <ContextField label="Harness" value={context.harness} />
                  <ContextField label="Session" value={context.session_id} />
                  <ContextField label="Run" value={context.run_id} />
                  <ContextField
                    label="Requested"
                    value={new Date(row.created_at).toLocaleString()}
                  />
                  <ContextField
                    label="Expires"
                    value={new Date(row.expires_at).toLocaleString()}
                  />
                  <ContextField label="Request ID" value={row.request_id} />
                </dl>
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Action details
                  </summary>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ContextField label="Trace" value={row.trace_id} />
                    <ContextField label="Chat" value={context.chat_id} />
                    <ContextField
                      label="Tool call"
                      value={context.tool_call_id}
                    />
                    <ContextField
                      label="Plan digest"
                      value={context.context_digest}
                    />
                    <ContextField label="Agents" value={context.agents} />
                    <ContextField label="Tools" value={context.tools} />
                    <ContextField label="Paths" value={context.paths} />
                    <ContextField
                      label="Estimated tokens"
                      value={context.estimated_tokens}
                    />
                    <ContextField
                      label="Estimated cost (USD)"
                      value={context.estimated_cost_usd}
                    />
                    <ContextField
                      label="Delegation depth"
                      value={context.delegation_depth}
                    />
                    <ContextField label="Placement" value={context.placement} />
                  </dl>
                  {Object.hasOwn(context, "tool_input") ? (
                    <div className="mt-3">
                      <p className="text-sm font-medium">
                        Retained tool arguments
                      </p>
                      <pre className="bg-muted mt-2 max-h-72 overflow-auto rounded p-3 text-xs whitespace-pre-wrap break-all">
                        {JSON.stringify(context.tool_input, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-3 text-sm">
                      Tool arguments are not available in this request.
                      Metadata-only capture omits arguments; the caller may also
                      omit them. See{" "}
                      <Link href="/settings" className="underline">
                        content capture settings
                      </Link>
                      .
                    </p>
                  )}
                </details>
                {canDecide && (
                  <div className="space-y-3 border-t pt-4">
                    <Label htmlFor={`reason-${row.request_id}`}>
                      Decision reason (optional)
                    </Label>
                    <Textarea
                      id={`reason-${row.request_id}`}
                      maxLength={1000}
                      value={reasons[row.request_id] || ""}
                      onChange={(event) =>
                        setReasons((old) => ({
                          ...old,
                          [row.request_id]: event.target.value,
                        }))
                      }
                      disabled={disabled}
                      placeholder="Record why this action should proceed or be denied."
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => void decide(row, "approve")}
                        disabled={disabled}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => void decide(row, "deny")}
                        disabled={disabled}
                      >
                        Deny
                      </Button>
                      {busy === row.request_id && (
                        <span
                          role="status"
                          className="text-muted-foreground self-center text-sm"
                        >
                          Saving decision…
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
