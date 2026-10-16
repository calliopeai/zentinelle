/**
 * The Agents area's vocabulary: the backend's states mapped once onto the
 * package's five status tones, and the formatting every screen shares.
 */
import type { StatusTone } from "@calliopelabs/ui";

import type { EndpointData } from "@/graphql/agents/types";

export const AGENT_STATUS_TONE: Record<string, StatusTone> = {
  provisioning: "info",
  active: "ok",
  suspended: "warn",
  offline: "muted",
  terminated: "muted",
};

export const AGENT_HEALTH_TONE: Record<string, StatusTone> = {
  healthy: "ok",
  degraded: "warn",
  unhealthy: "error",
  unknown: "muted",
};

export const GROUP_TIER_TONE: Record<string, StatusTone> = {
  standard: "info",
  restricted: "warn",
  trusted: "ok",
};

export const SEVERITY_TONE: Record<string, StatusTone> = {
  critical: "error",
  high: "error",
  medium: "warn",
  low: "info",
  info: "muted",
};

export function toneOf(
  map: Record<string, StatusTone>,
  value: string | null | undefined,
) {
  return (value && map[value]) || "muted";
}

/** The backend's snake_case value, in words ("claude_code" is "claude code"). */
export function words(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "";
}

/** The agent types, as AgentEndpoint.AgentType names them (backend/zentinelle/models/endpoint.py). */
export const AGENT_TYPES = [
  { value: "claude_code", label: "Claude Code" },
  { value: "gemini", label: "Gemini" },
  { value: "antigravity", label: "Antigravity CLI" },
  { value: "opencode", label: "OpenCode" },
  { value: "codex", label: "Codex" },
  { value: "calliope", label: "Calliope AI" },
  { value: "langchain", label: "LangChain" },
  { value: "langgraph", label: "LangGraph" },
  { value: "crewai", label: "CrewAI" },
  { value: "llamaindex", label: "LlamaIndex" },
  { value: "ms-agent-framework", label: "Microsoft Agent Framework" },
  { value: "openai_agents", label: "OpenAI Agents SDK" },
  { value: "agno", label: "Agno" },
  { value: "google_adk", label: "Google ADK" },
  { value: "haystack", label: "Haystack" },
  { value: "letta", label: "Letta" },
  { value: "pydantic_ai", label: "Pydantic AI" },
  { value: "smolagents", label: "Smolagents" },
  { value: "bee_agent", label: "BeeAI Framework" },
  { value: "dspy", label: "DSPy" },
  { value: "mistral_agents", label: "Mistral Agents" },
  { value: "spring_ai", label: "Spring AI" },
  { value: "vercel-ai", label: "Vercel AI SDK" },
  { value: "mcp", label: "MCP Server" },
  { value: "agent_host", label: "Agent Host" },
  { value: "chat", label: "Chat Agent" },
  { value: "custom", label: "Custom" },
] as const;

export function agentTypeLabel(value: string) {
  return AGENT_TYPES.find((t) => t.value === value)?.label ?? words(value);
}

/** AgentEndpoint.Status, in the order an agent moves through them. */
export const AGENT_STATUSES = [
  { value: "provisioning", label: "Provisioning" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "offline", label: "Offline" },
  { value: "terminated", label: "Terminated" },
] as const;

export const GROUP_TIERS = [
  {
    value: "standard",
    label: "Standard",
    description: "The default enforcement profile.",
  },
  {
    value: "restricted",
    label: "Restricted",
    description: "A stricter posture: block-mode defaults.",
  },
  {
    value: "trusted",
    label: "Trusted",
    description: "A relaxed posture: audit-mode defaults.",
  },
] as const;

/**
 * A timestamp as UTC, to the minute: "2026-10-16 14:05 UTC". Absolute and
 * locale-free, so a screenshot, an audit export and a story all agree.
 */
export function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatNumber(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("en-US");
}

export function formatUsd(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Where an agent's page lives: its Astrolift deeplink slug, unchanged (bootstrap.md, "Deeplink URL convention"). */
export function agentHref(agentId: string, tab?: string) {
  const base = `/agents/${encodeURIComponent(agentId)}`;
  return tab ? `${base}/${tab}` : base;
}

/** What the Agents list shows of an endpoint. */
export interface AgentRow {
  id: string;
  agentId: string;
  name: string;
  agentType: string;
  status: string;
  health: string;
  group: { id: string; name: string } | null;
  deploymentName: string | null;
  lastHeartbeat: string | null;
  capabilities: readonly string[];
}

export function toAgentRow(endpoint: EndpointData): AgentRow {
  return {
    id: endpoint.id,
    agentId: endpoint.agentId,
    name: endpoint.name,
    agentType: endpoint.agentType,
    status: endpoint.status,
    health: endpoint.health,
    group: endpoint.agentGroup
      ? { id: endpoint.agentGroup.id, name: endpoint.agentGroup.name }
      : null,
    deploymentName: endpoint.deploymentName,
    lastHeartbeat: endpoint.lastHeartbeat,
    capabilities: endpoint.capabilities,
  };
}

/** What the agent page's header shows of an endpoint. */
export function toAgentSummary(endpoint: EndpointData) {
  const owner = endpoint.metadata?.owner_id;
  return {
    name: endpoint.name,
    agentId: endpoint.agentId,
    agentType: endpoint.agentType,
    status: endpoint.status,
    health: endpoint.health,
    description: endpoint.description,
    groupName: endpoint.agentGroup?.name ?? null,
    deploymentName: endpoint.deploymentName,
    lastHeartbeat: endpoint.lastHeartbeat,
    apiKeyPrefix: endpoint.apiKeyPrefix,
    owner: typeof owner === "string" && owner ? owner : null,
    capabilities: endpoint.capabilities,
    createdAt: endpoint.createdAt,
  };
}

/** AgentGroup.color holds a preset key (default "brand"); each key's swatch. */
export const GROUP_COLORS = [
  { value: "brand", label: "Teal", swatch: "#37efed" },
  { value: "indigo", label: "Indigo", swatch: "#6366f1" },
  { value: "emerald", label: "Emerald", swatch: "#10b981" },
  { value: "amber", label: "Amber", swatch: "#f59e0b" },
  { value: "rose", label: "Rose", swatch: "#f43f5e" },
  { value: "violet", label: "Violet", swatch: "#8b5cf6" },
  { value: "slate", label: "Slate", swatch: "#64748b" },
] as const;

/** A group's swatch: its preset's, or the value itself when an older group stored a hex. */
export function groupSwatch(color: string) {
  const preset = GROUP_COLORS.find((c) => c.value === color);
  if (preset) return preset.swatch;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : undefined;
}
