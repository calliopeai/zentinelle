import type * as React from "react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  Section,
  StatusBadge,
  useUI,
} from "@calliopelabs/ui";
import { BotIcon } from "lucide-react";

import { Card } from "../../shared/Card";
import { CodeBlock } from "../../shared/CodeBlock";
import { DefinitionList } from "../../shared/DefinitionList";
import { Field } from "../../shared/Field";
import { Select } from "../../shared/Select";
import { areaCrumb, workspaceTabs } from "./frame";
import {
  ENFORCEMENT_LABEL,
  ENFORCEMENT_TONE,
  scopeLabel,
  scopeRank,
  typeLabel,
} from "./labels";
import type { EffectivePolicyResponse } from "./rest-types";

export interface EffectiveAgent {
  id: string;
  name: string;
}

export interface EffectivePolicyScreenProps {
  capabilities: readonly string[];
  /** The agent picker, from `GetEndpoints`. */
  agents: readonly EffectiveAgent[];
  agentsLoading: boolean;
  /** The chosen agent's id (`?endpoint=`), or "" before one is chosen. */
  agentId: string;
  onAgentChange: (id: string) => void;
  /** REST `effective-policy?endpoint=`, for the chosen agent. */
  effective: EffectivePolicyResponse | null;
  loading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
}

function Values({ values }: { values: readonly string[] }) {
  if (values.length === 0)
    return <span className="text-muted-foreground">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <code
          key={v}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs [overflow-wrap:anywhere]"
        >
          {v}
        </code>
      ))}
    </span>
  );
}

function hasKeys(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}

/** Policies > Effective: what one agent runs under after inheritance, and which policies put it there. */
export function EffectivePolicyScreen({
  capabilities,
  agents,
  agentsLoading,
  agentId,
  onAgentChange,
  effective,
  loading,
  error,
  onRetry,
}: EffectivePolicyScreenProps) {
  const { Link } = useUI();
  const picker = (
    <Field
      label="Agent"
      hint="Effective policy is resolved for one agent at a time."
      className="max-w-sm"
    >
      {(control) => (
        <Select
          {...control}
          disabled={agentsLoading || agents.length === 0}
          options={[
            {
              value: "",
              label: agentsLoading ? "Loading agents" : "Choose an agent",
            },
            ...agents.map((a) => ({ value: a.id, label: a.name })),
          ]}
          value={agentId}
          onValueChange={onAgentChange}
        />
      )}
    </Field>
  );

  let body: React.ReactNode;
  if (!agentsLoading && agents.length === 0) {
    body = (
      <EmptyState
        icon={<BotIcon />}
        title="No agents registered"
        description="Effective policy is computed per agent. Register an agent, then come back."
        actionHref="/agents"
        actionLabel="Go to Agents"
      />
    );
  } else if (!agentId) {
    body = (
      <EmptyState
        title="Choose an agent"
        description="Pick an agent above to see the policies that reach it and the configuration they resolve to."
      />
    );
  } else if (error) {
    body = (
      <ErrorState
        title="Could not resolve the effective policy"
        error={error}
        onRetry={onRetry}
      />
    );
  } else if (loading || !effective) {
    body = (
      <LoadingState label="Resolving the effective policy" variant="page" />
    );
  } else {
    const ordered = [...effective.policies].sort(
      (a, b) =>
        scopeRank(a.scope) - scopeRank(b.scope) || b.priority - a.priority,
    );
    const r = effective.resolved;
    const other: [string, Record<string, unknown>][] = (
      [
        ["Guardrails", r.ai_guardrails],
        ["Rate limits", r.rate_limits],
        ["Budget", r.budget_limits],
        ["Resource quotas", r.resource_quotas],
      ] as [string, Record<string, unknown>][]
    ).filter(([, v]) => hasKeys(v));
    body = (
      <div className="flex flex-col gap-6">
        <Section
          title="Policies in effect"
          description="Broadest first. A narrower tier, or a higher priority within a tier, wins."
        >
          {ordered.length === 0 ? (
            <EmptyState
              title="No policy reaches this agent"
              description="It runs with the platform defaults. Add an organization policy to cover every agent."
            />
          ) : (
            <ol className="divide-y divide-border rounded-lg border border-border">
              {ordered.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  <Link
                    href={`/policies/${encodeURIComponent(p.id)}`}
                    className="min-w-0 flex-1 font-medium underline-offset-2 hover:underline [overflow-wrap:anywhere]"
                  >
                    {p.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {typeLabel(p.type)}
                  </span>
                  <span className="text-muted-foreground">
                    {scopeLabel(p.scope)}
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    P{p.priority}
                  </span>
                  <StatusBadge
                    tone={ENFORCEMENT_TONE[p.enforcement] ?? "muted"}
                  >
                    {ENFORCEMENT_LABEL[p.enforcement] ?? p.enforcement}
                  </StatusBadge>
                </li>
              ))}
            </ol>
          )}
        </Section>
        <Section title="Resolved configuration">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Tools">
              <DefinitionList
                items={[
                  {
                    term: "Allowed",
                    description: <Values values={r.tool_permissions.allowed} />,
                  },
                  {
                    term: "Denied",
                    description: <Values values={r.tool_permissions.denied} />,
                  },
                  {
                    term: "Needs approval",
                    description: (
                      <Values values={r.tool_permissions.requires_approval} />
                    ),
                  },
                ]}
              />
            </Card>
            <Card title="Secrets">
              <DefinitionList
                items={[
                  {
                    term: "Bundles",
                    description: (
                      <Values values={r.secret_access.allowed_bundles} />
                    ),
                  },
                  {
                    term: "Denied providers",
                    description: (
                      <Values values={r.secret_access.denied_providers} />
                    ),
                  },
                ]}
              />
            </Card>
            {other.map(([title, value]) => (
              <Card key={title} title={title}>
                <CodeBlock label={title} value={value} maxHeight="sm" />
              </Card>
            ))}
            <Card title="System prompt" className="lg:col-span-2">
              {r.system_prompt ? (
                <CodeBlock
                  label="System prompt"
                  value={r.system_prompt}
                  maxHeight="sm"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No system prompt policy applies.
                </p>
              )}
            </Card>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <PageFrame
      crumbs={[areaCrumb(capabilities, "policies")]}
      title="Policies"
      tabs={workspaceTabs("effective")}
      tabsLabel="Policies"
      filters={picker}
    >
      {body}
    </PageFrame>
  );
}
