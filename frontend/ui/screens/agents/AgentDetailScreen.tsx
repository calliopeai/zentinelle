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
import type * as React from "react";

import { navFor } from "../../product";
import { DefinitionList } from "../../shared/DefinitionList";
import {
  AGENT_HEALTH_TONE,
  AGENT_STATUS_TONE,
  agentHref,
  agentTypeLabel,
  formatTime,
  toneOf,
  words,
} from "./format";

/** The agent tabs, in the IA's order (§4.2). Paths are the Astrolift deeplinks. */
export const AGENT_TABS = [
  { key: "activity", label: "Activity" },
  { key: "interactions", label: "Interactions" },
  { key: "usage", label: "Usage" },
  { key: "compliance", label: "Compliance" },
  { key: "controls", label: "Controls", requires: "admin" },
  { key: "policies", label: "Policies" },
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
  const nav = navFor(capabilities);
  const crumbs = [areaSwitcher(nav, "agents", "agents")];
  const tabs: TabNavItem[] = AGENT_TABS.filter(
    (t) => !("requires" in t) || capabilities.includes(t.requires),
  ).map((t) => ({
    key: t.key,
    label: t.label,
    href: agentHref(agentId, t.key),
    active: t.key === tab,
  }));

  if (state === "notFound")
    return (
      <PageFrame crumbs={crumbs} title={agentId}>
        <EmptyState
          icon={<BotIcon />}
          title="Agent not found"
          description={`No agent with the id ${agentId} is registered in this organization. An agent deployed from Astrolift AI uses its deployment slug as its id.`}
          actionHref="/agents"
          actionLabel="All agents"
        />
      </PageFrame>
    );
  if (state === "error")
    return (
      <PageFrame crumbs={crumbs} title={agentId}>
        <ErrorState
          title="Could not load the agent"
          error={error}
          onRetry={onRetry}
        />
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
              {words(agent.status)}
            </StatusBadge>
            <StatusBadge tone={toneOf(AGENT_HEALTH_TONE, agent.health)}>
              {words(agent.health)}
            </StatusBadge>
          </span>
        ) : undefined
      }
      context={
        <span className="font-mono [overflow-wrap:anywhere]">{agentId}</span>
      }
      description={agent?.description || undefined}
      tabs={tabs}
      tabsLabel="Agent"
    >
      {agent ? (
        <DefinitionList
          columns={3}
          fallback="None"
          items={[
            { term: "Type", value: agentTypeLabel(agent.agentType) },
            { term: "Group", value: agent.groupName },
            { term: "Deployment", value: agent.deploymentName, mono: true },
            {
              term: "Last heartbeat",
              value: agent.lastHeartbeat
                ? formatTime(agent.lastHeartbeat)
                : "Never",
              mono: true,
            },
            { term: "Owner", value: agent.owner },
            {
              term: "API key",
              value: agent.apiKeyPrefix ? `${agent.apiKeyPrefix}…` : null,
              mono: true,
            },
            {
              term: "Capabilities",
              value: agent.capabilities.length
                ? agent.capabilities.join(", ")
                : null,
            },
            {
              term: "Registered",
              value: formatTime(agent.createdAt),
              mono: true,
            },
          ]}
        />
      ) : (
        <LoadingState label="Loading the agent" rows={2} />
      )}
      {children}
    </PageFrame>
  );
}
