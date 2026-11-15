import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  StatusBadge,
  areaSwitcher,
  type TabNavItem,
} from "@calliopelabs/ui";
import { BotIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";

import { navFor } from "../../product";
import { DefinitionList } from "../../shared/DefinitionList";
import {
  AGENT_HEALTH_TONE,
  AGENT_STATUS_TONE,
  agentHref,
  formatTime,
  toneOf,
  useAgentLabels,
} from "./format";

/**
 * The agent tabs, in the IA's order (§4.2), named by `agents.detail.tabs`.
 * Paths are the Astrolift deeplinks.
 */
export const AGENT_TABS = [
  { key: "activity" },
  { key: "interactions" },
  { key: "usage" },
  { key: "compliance" },
  { key: "controls", requires: "admin" },
  { key: "policies" },
] as const;

export type AgentTab = (typeof AGENT_TABS)[number]["key"];

export interface AgentSummary {
  name: string;
  agentId: string;
  agentType: string;
  status: string;
  health: string;
  description: string;
  groupName: string | null;
  deploymentName: string | null;
  lastHeartbeat: string | null;
  apiKeyPrefix: string | null;
  owner: string | null;
  capabilities: readonly string[];
  createdAt: string;
}

export interface AgentDetailScreenProps {
  /** The slug in the path, shown while the agent loads or when it is missing. */
  agentId: string;
  /** GetEndpoint resolved by slug: loading, the agent, absent, or failed. */
  state: "loading" | "ready" | "notFound" | "error";
  agent: AgentSummary | null;
  error?: { message: string } | null;
  onRetry?: () => void;
  tab: AgentTab;
  capabilities: readonly string[];
  /** The open tab's panel. */
  children: React.ReactNode;
}

/**
 * One agent (ui-overhaul-ia §4.2): who it is, then one row of tabs, each a
 * page at `/agents/{agentId}/{tab}`. Controls is admin-only and hidden
 * from other roles.
 */
export function AgentDetailScreen({
  agentId,
  state,
  agent,
  error,
  onRetry,
  tab,
  capabilities,
  children,
}: AgentDetailScreenProps) {
  const t = useTranslations("agents.detail");
  const c = useTranslations("common");
  const labels = useAgentLabels();
  const nav = navFor(capabilities);
  const crumbs = [areaSwitcher(nav, "agents", "agents")];
  const tabs: TabNavItem[] = AGENT_TABS.filter(
    (item) => !("requires" in item) || capabilities.includes(item.requires),
  ).map((item) => ({
    key: item.key,
    label: t(`tabs.${item.key}`),
    href: agentHref(agentId, item.key),
    active: item.key === tab,
  }));

  if (state === "notFound")
    return (
      <PageFrame crumbs={crumbs} title={agentId}>
        <EmptyState
          icon={<BotIcon />}
          title={t("notFound.title")}
          description={t("notFound.description", { agentId })}
          actionHref="/agents"
          actionLabel={t("notFound.action")}
        />
      </PageFrame>
    );
  if (state === "error")
    return (
      <PageFrame crumbs={crumbs} title={agentId}>
        <ErrorState title={t("error")} error={error} onRetry={onRetry} />
      </PageFrame>
    );

  return (
    <PageFrame
      crumbs={crumbs}
      title={
        <span className="[overflow-wrap:anywhere]">
          {agent?.name ?? agentId}
        </span>
      }
      status={
        agent ? (
          <span className="flex gap-2">
            <StatusBadge tone={toneOf(AGENT_STATUS_TONE, agent.status)}>
              {labels.status(agent.status)}
            </StatusBadge>
            <StatusBadge tone={toneOf(AGENT_HEALTH_TONE, agent.health)}>
              {labels.health(agent.health)}
            </StatusBadge>
          </span>
        ) : undefined
      }
      context={
        <span className="font-mono [overflow-wrap:anywhere]">{agentId}</span>
      }
      description={agent?.description || undefined}
      tabs={tabs}
      tabsLabel={t("tabsLabel")}
    >
      {agent ? (
        <DefinitionList
          columns={3}
          fallback={c("none")}
          items={[
            { term: t("facts.type"), value: labels.type(agent.agentType) },
            { term: t("facts.group"), value: agent.groupName },
            {
              term: t("facts.deployment"),
              value: agent.deploymentName,
              mono: true,
            },
            {
              term: t("facts.heartbeat"),
              value: agent.lastHeartbeat
                ? formatTime(agent.lastHeartbeat)
                : c("never"),
              mono: true,
            },
            { term: t("facts.owner"), value: agent.owner },
            {
              term: t("facts.apiKey"),
              value: agent.apiKeyPrefix ? `${agent.apiKeyPrefix}…` : null,
              mono: true,
            },
            {
              term: t("facts.capabilities"),
              value: agent.capabilities.length
                ? agent.capabilities.join(", ")
                : null,
            },
            {
              term: t("facts.registered"),
              value: formatTime(agent.createdAt),
              mono: true,
            },
          ]}
        />
      ) : (
        <LoadingState label={t("loading")} rows={2} />
      )}
      {children}
    </PageFrame>
  );
}
