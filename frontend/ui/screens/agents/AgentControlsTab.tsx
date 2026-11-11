import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Section,
  StatusBadge,
} from "@calliopelabs/ui";
import { LockIcon } from "lucide-react";
import * as React from "react";

import { Card } from "../../shared/Card";
import { DefinitionList } from "../../shared/DefinitionList";
import { SEVERITY_TONE, formatTime, toneOf, words } from "./format";

/** GET /agents/{agent_id}/control (backend/zentinelle/api/views/agent_control.py), as the tab reads it. */
export interface AgentControlData {
  agent: {
    tools?: unknown[];
    model_routes?: unknown[];
    data_access?: unknown[];
    authority?: unknown[];
    budget?: Record<string, unknown>;
    containment?: { denied_tools?: string[] };
  };
  policies: {
    id: string;
    name: string;
    type: string;
    version: number;
    enforcement: string;
  }[];
  incidents?: { id: string; status: string; severity: string; title: string }[];
  decision_traces?: {
    trace_id: string;
    action: string;
    timestamp: string | null;
  }[];
}

export type ControlAction = "suspend" | "revoke" | "emergency_stop";

export interface AgentControlsTabProps {
  agentName: string;
  /** `denied` is the 401 or 403 the endpoint answers anyone but an administrator. */
  state: "loading" | "ready" | "denied" | "error";
  data: AgentControlData | null;
  error?: { message: string } | null;
  onRetry?: () => void;
  /**
   * POST /agents/{agent_id}/control. Reject with the server's message (an
   * organization that requires approval for control actions answers 403).
   */
  onAction: (action: ControlAction) => Promise<void>;
}

const ACTIONS: Record<
  ControlAction,
  {
    label: string;
    title: (name: string) => string;
    description: string;
    destructive: boolean;
  }
> = {
  suspend: {
    label: "Suspend",
    title: (n) => `Suspend ${n}?`,
    description:
      "The agent's calls are refused until an operator activates it again. Astrolift AI cannot undo an administrator's suspension.",
    destructive: false,
  },
  revoke: {
    label: "Revoke key",
    title: (n) => `Revoke ${n}'s API key?`,
    description:
      "The agent is terminated and its key stops working now. It must be registered again, with a new key, to return.",
    destructive: true,
  },
  emergency_stop: {
    label: "Emergency stop",
    title: (n) => `Emergency stop ${n}?`,
    description:
      "Terminates the agent and revokes its key at once, and records the stop as an emergency in the audit log.",
    destructive: true,
  },
};

function show(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function Values({
  values,
  none,
}: {
  values: unknown[] | undefined;
  none: string;
}) {
  if (!values?.length)
    return <p className="text-muted-foreground text-sm">{none}</p>;
  return (
    <ul className="flex flex-wrap gap-1">
      {values.map((value, i) => (
        <li
          key={`${show(value)}-${i}`}
          className="bg-muted rounded-lg px-2 py-0.5 font-mono text-xs [overflow-wrap:anywhere]"
        >
          {show(value)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Controls (admin): the authority the agent registered (tools, model
 * routes, data access, budget), what is contained, and the stop actions.
 */
export function AgentControlsTab({
  agentName,
  state,
  data,
  error,
  onRetry,
  onAction,
}: AgentControlsTabProps) {
  const [pending, setPending] = React.useState<ControlAction | null>(null);
  if (state === "loading")
    return <LoadingState label="Loading controls" variant="page" />;
  if (state === "denied")
    return (
      <EmptyState
        icon={<LockIcon />}
        title="Controls need an administrator"
        description="Your role can see this agent's activity but not inspect or change its operating authority."
      />
    );
  if (state === "error" || !data)
    return (
      <ErrorState
        title="Could not load controls"
        error={error}
        onRetry={onRetry}
      />
    );

  const agent = data.agent;
  const budget =
    agent.budget && Object.keys(agent.budget).length ? agent.budget : null;
  const action = pending ? ACTIONS[pending] : null;
  return (
    <>
      <Section
        title="Authority"
        description="What the agent registered it may do. Policies below can narrow it."
        action={
          <>
            {(Object.keys(ACTIONS) as ControlAction[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={ACTIONS[key].destructive ? "destructive" : "outline"}
                onClick={() => setPending(key)}
              >
                {ACTIONS[key].label}
              </Button>
            ))}
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Tools">
            <Values values={agent.tools} none="None registered" />
          </Card>
          <Card title="Model routes">
            <Values values={agent.model_routes} none="None registered" />
          </Card>
          <Card title="Data access">
            <Values values={agent.data_access} none="None registered" />
          </Card>
          <Card title="Authority tags">
            <Values values={agent.authority} none="None registered" />
          </Card>
          <Card title="Contained tools">
            <Values
              values={agent.containment?.denied_tools}
              none="Nothing contained"
            />
          </Card>
          <Card title="Budget">
            {budget ? (
              <DefinitionList
                items={Object.entries(budget).map(([term, value]) => ({
                  term: words(term),
                  value: show(value),
                  mono: true,
                }))}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                No budget registered
              </p>
            )}
          </Card>
        </div>
      </Section>
      <Section title="Recent incidents">
        {data.incidents?.length ? (
          <ul className="divide-y rounded-lg border">
            {data.incidents.map((incident) => (
              <li
                key={incident.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0 text-sm [overflow-wrap:anywhere]">
                  {incident.title}
                </span>
                <span className="flex shrink-0 gap-2">
                  <StatusBadge tone={toneOf(SEVERITY_TONE, incident.severity)}>
                    {incident.severity}
                  </StatusBadge>
                  <StatusBadge tone="muted">
                    {words(incident.status)}
                  </StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No incidents for this agent.
          </p>
        )}
      </Section>
      <Section
        title="Decision traces"
        description="The last control and policy decisions recorded with a trace id."
      >
        {data.decision_traces?.length ? (
          <ul className="divide-y rounded-lg border">
            {data.decision_traces.map((trace) => (
              <li
                key={`${trace.trace_id}-${trace.timestamp}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs [overflow-wrap:anywhere]">
                  {trace.trace_id}
                </span>
                <span className="text-muted-foreground">
                  {words(trace.action)}, {formatTime(trace.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            No traced decisions yet.
          </p>
        )}
      </Section>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={action?.title(agentName) ?? ""}
        description={action?.description}
        confirmLabel={action?.label}
        destructive={action?.destructive}
        onConfirm={async () => {
          if (pending) await onAction(pending);
        }}
      />
    </>
  );
}
