import { Button, StatusBadge, useUI } from "@calliopelabs/ui";

import type { HeldApproval } from "@/lib/approvals";

import { Card } from "../../shared/Card";
import { DefinitionList } from "../../shared/DefinitionList";
import { TextField } from "../../shared/FormField";
import { agentHref, formatTime } from "./format";

export interface ApprovalCardProps {
  request: HeldApproval;
  /** Milliseconds since the epoch, ticked by the route, so the countdown and expiry agree. */
  now: number;
  canDecide: boolean;
  /** Decisions are held while the inbox refreshes, another decision saves, or the last refresh failed. */
  locked: boolean;
  /** This request's decision is saving. */
  saving: boolean;
  reason: string;
  onReasonChange: (reason: string) => void;
  onDecide: (decision: "approve" | "deny") => void;
}

function str(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function left(seconds: number) {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s left`;
}

/**
 * One held agent action (#440): what the agent asked to do, why policy held
 * it, when it expires, and, for operators, the approve and deny decision
 * with an optional reason the audit log keeps.
 */
export function ApprovalCard({
  request,
  now,
  canDecide,
  locked,
  saving,
  reason,
  onReasonChange,
  onDecide,
}: ApprovalCardProps) {
  const { Link } = useUI();
  const context = request.context;
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(request.expires_at) - now) / 1000),
  );
  const expired = seconds === 0;
  const disabled = locked || expired;
  const title =
    typeof context.tool_name === "string" ? context.tool_name : request.action;
  return (
    <Card
      aria-label={`Request ${request.request_id}`}
      title={<span className="font-mono">{title}</span>}
      action={
        <StatusBadge tone={expired ? "muted" : seconds < 60 ? "warn" : "info"}>
          {expired ? "expired" : left(seconds)}
        </StatusBadge>
      }
    >
      <p className="text-sm [overflow-wrap:anywhere]">
        {request.reason || "Policy requires a human decision."}
      </p>
      <DefinitionList
        columns={3}
        items={[
          {
            term: "Agent",
            value: request.agent_id ? (
              <Link
                href={agentHref(request.agent_id)}
                className="underline-offset-2 hover:underline"
              >
                {request.agent_id}
              </Link>
            ) : (
              "Unknown agent"
            ),
            mono: true,
          },
          { term: "User", value: request.user_id ?? "Not provided" },
          { term: "Action", value: request.action, mono: true },
          { term: "Harness", value: str(context.harness) },
          {
            term: "Requested",
            value: formatTime(request.created_at),
            mono: true,
          },
          {
            term: "Expires",
            value: formatTime(request.expires_at),
            mono: true,
          },
        ]}
      />
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Action details
        </summary>
        <DefinitionList
          className="mt-3"
          items={[
            { term: "Request id", value: request.request_id, mono: true },
            { term: "Trace", value: request.trace_id, mono: true },
            { term: "Session", value: str(context.session_id), mono: true },
            { term: "Run", value: str(context.run_id), mono: true },
            { term: "Chat", value: str(context.chat_id), mono: true },
            { term: "Tool call", value: str(context.tool_call_id), mono: true },
            {
              term: "Plan digest",
              value: str(context.context_digest),
              mono: true,
            },
            { term: "Agents", value: str(context.agents) },
            { term: "Tools", value: str(context.tools) },
            { term: "Paths", value: str(context.paths), mono: true },
            {
              term: "Estimated tokens",
              value: str(context.estimated_tokens),
              mono: true,
            },
            {
              term: "Estimated cost (USD)",
              value: str(context.estimated_cost_usd),
              mono: true,
            },
            {
              term: "Delegation depth",
              value: str(context.delegation_depth),
              mono: true,
            },
            { term: "Placement", value: str(context.placement) },
          ]}
        />
        {Object.hasOwn(context, "tool_input") ? (
          <div className="mt-3">
            <p className="text-sm font-medium">Retained tool arguments</p>
            <pre className="bg-muted mt-2 max-h-72 overflow-auto rounded-lg p-3 font-mono text-xs break-all whitespace-pre-wrap">
              {JSON.stringify(context.tool_input, null, 2)}
            </pre>
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            The tool arguments are not in this request. Metadata-only capture
            leaves them out, and a caller may omit them. See{" "}
            <Link href="/settings" className="underline">
              content capture settings
            </Link>
            .
          </p>
        )}
      </details>
      {canDecide && (
        <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end">
          <TextField
            className="sm:flex-1"
            label="Decision reason (optional)"
            maxLength={1000}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            disabled={disabled}
            placeholder="Why this action should proceed or be denied"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => onDecide("approve")}
              disabled={disabled}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDecide("deny")}
              disabled={disabled}
            >
              Deny
            </Button>
            <span role="status" className="text-muted-foreground text-sm">
              {saving
                ? "Saving the decision"
                : expired
                  ? "Expired requests cannot be decided."
                  : ""}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
