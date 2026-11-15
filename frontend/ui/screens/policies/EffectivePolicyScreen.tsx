import type * as React from "react";
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageFrame,
  Section,
  Select,
  StatusBadge,
  useUI,
} from "@calliopelabs/ui";
import { BotIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card } from "./components/Card";
import { CodeBlock } from "../../shared/CodeBlock";
import { DefinitionList } from "./components/DefinitionList";
import { areaCrumb, workspaceTabs } from "./frame";
import { ENFORCEMENT_TONE, scopeRank, usePolicyLabels } from "./labels";
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
  const t = useTranslations("policies.effectivePolicyScreen");
  const { enforcementLabel, scopeLabel, typeLabel, tabs } = usePolicyLabels();
  const { Link } = useUI();
  const picker = (
    <Field
      label={t("agent")}
      hint={t("effectivePolicyIsResolvedFor")}
      className="max-w-sm"
    >
      <Select
        className="w-full"
        disabled={agentsLoading || agents.length === 0}
        placeholder={agentsLoading ? t("loadingAgents") : t("chooseAnAgent")}
        options={agents.map((a) => ({ value: a.id, label: a.name }))}
        value={agentId}
        onValueChange={onAgentChange}
      />
    </Field>
  );

  let body: React.ReactNode;
  if (!agentsLoading && agents.length === 0) {
    body = (
      <EmptyState
        icon={<BotIcon />}
        title={t("noAgentsRegistered")}
        description={t("effectivePolicyIsComputedPer")}
        actionHref="/agents"
        actionLabel={t("goToAgents")}
      />
    );
  } else if (!agentId) {
    body = (
      <EmptyState
        title={t("chooseAnAgent")}
        description={t("pickAnAgentAboveTo")}
      />
    );
  } else if (error) {
    body = (
      <ErrorState
        title={t("couldNotResolveTheEffective")}
        error={error}
        onRetry={onRetry}
      />
    );
  } else if (loading || !effective) {
    body = (
      <LoadingState label={t("resolvingTheEffectivePolicy")} variant="page" />
    );
  } else {
    const ordered = [...effective.policies].sort(
      (a, b) =>
        scopeRank(a.scope) - scopeRank(b.scope) || b.priority - a.priority,
    );
    const r = effective.resolved;
    const other: [string, Record<string, unknown>][] = (
      [
        [t("guardrails"), r.ai_guardrails],
        [t("rateLimits"), r.rate_limits],
        [t("budget"), r.budget_limits],
        [t("resourceQuotas"), r.resource_quotas],
      ] as [string, Record<string, unknown>][]
    ).filter(([, v]) => hasKeys(v));
    body = (
      <div className="flex flex-col gap-6">
        <Section
          title={t("policiesInEffect")}
          description={t("broadestFirstANarrowerTier")}
        >
          {ordered.length === 0 ? (
            <EmptyState
              title={t("noPolicyReachesThisAgent")}
              description={t("itRunsWithThePlatform")}
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
                    {enforcementLabel(p.enforcement)}
                  </StatusBadge>
                </li>
              ))}
            </ol>
          )}
        </Section>
        <Section title={t("resolvedConfiguration")}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("tools")}>
              <DefinitionList
                items={[
                  {
                    term: t("allowed"),
                    description: <Values values={r.tool_permissions.allowed} />,
                  },
                  {
                    term: t("denied"),
                    description: <Values values={r.tool_permissions.denied} />,
                  },
                  {
                    term: t("needsApproval"),
                    description: (
                      <Values values={r.tool_permissions.requires_approval} />
                    ),
                  },
                ]}
              />
            </Card>
            <Card title={t("secrets")}>
              <DefinitionList
                items={[
                  {
                    term: t("bundles"),
                    description: (
                      <Values values={r.secret_access.allowed_bundles} />
                    ),
                  },
                  {
                    term: t("deniedProviders"),
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
            <Card title={t("systemPrompt")} className="lg:col-span-2">
              {r.system_prompt ? (
                <CodeBlock
                  label={t("systemPrompt")}
                  value={r.system_prompt}
                  maxHeight="sm"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("noSystemPromptPolicyApplies")}
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
      title={t("policies")}
      tabs={workspaceTabs("effective", tabs.workspace)}
      tabsLabel={t("policies")}
      filters={picker}
    >
      {body}
    </PageFrame>
  );
}
