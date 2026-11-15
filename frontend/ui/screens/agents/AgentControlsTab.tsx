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
import { useTranslations } from "next-intl";
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

/** The stop actions, named under `agents.controls.actions`; destructive ones are red. */
const ACTIONS: Record<ControlAction, { destructive: boolean }> = {
  suspend: { destructive: false },
  revoke: { destructive: true },
  emergency_stop: { destructive: true },
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
  const t = useTranslations("agents.controls");
  const [pending, setPending] = React.useState<ControlAction | null>(null);
  if (state === "loading")
    return <LoadingState label={t("loading")} variant="page" />;
  if (state === "denied")
    return (
      <EmptyState
        icon={<LockIcon />}
        title={t("denied.title")}
        description={t("denied.description")}
      />
    );
  if (state === "error" || !data)
    return <ErrorState title={t("error")} error={error} onRetry={onRetry} />;

  const agent = data.agent;
  const budget =
    agent.budget && Object.keys(agent.budget).length ? agent.budget : null;
  const none = t("noneRegistered");
  return (
    <>
      <Section
        title={t("authority.title")}
        description={t("authority.description")}
        action={
          <>
            {(Object.keys(ACTIONS) as ControlAction[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={ACTIONS[key].destructive ? "destructive" : "outline"}
                onClick={() => setPending(key)}
              >
                {t(`actions.${key}.label`)}
              </Button>
            ))}
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card title={t("cards.tools")}>
            <Values values={agent.tools} none={none} />
          </Card>
          <Card title={t("cards.modelRoutes")}>
            <Values values={agent.model_routes} none={none} />
          </Card>
          <Card title={t("cards.dataAccess")}>
            <Values values={agent.data_access} none={none} />
          </Card>
          <Card title={t("cards.authorityTags")}>
            <Values values={agent.authority} none={none} />
          </Card>
          <Card title={t("cards.contained")}>
            <Values
              values={agent.containment?.denied_tools}
              none={t("nothingContained")}
            />
          </Card>
          <Card title={t("cards.budget")}>
            {budget ? (
              <DefinitionList
                items={Object.entries(budget).map(([term, value]) => ({
                  term: words(term),
                  value: show(value),
                  mono: true,
                }))}
              />
            ) : (
              <p className="text-muted-foreground text-sm">{t("noBudget")}</p>
            )}
          </Card>
        </div>
      </Section>
      <Section title={t("incidents.title")}>
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
            {t("incidents.empty")}
          </p>
        )}
      </Section>
      <Section title={t("traces.title")} description={t("traces.description")}>
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
                  {t("traces.row", {
                    action: words(trace.action),
                    time: formatTime(trace.timestamp),
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t("traces.empty")}</p>
        )}
      </Section>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending ? t(`actions.${pending}.title`, { name: agentName }) : ""
        }
        description={pending ? t(`actions.${pending}.description`) : undefined}
        confirmLabel={pending ? t(`actions.${pending}.label`) : undefined}
        destructive={pending ? ACTIONS[pending].destructive : undefined}
        onConfirm={async () => {
          if (pending) await onAction(pending);
        }}
      />
    </>
  );
}
