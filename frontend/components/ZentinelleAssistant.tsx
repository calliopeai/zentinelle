"use client";

import { CalliopeAgentProvider } from "@calliopelabs/ui/agent";
import { usePathname } from "next/navigation";
import * as React from "react";

import { useCapability } from "@/components/PermissionGuard";
import { useAvailableModels } from "@/hooks/use-chat";
import { createZentinelleAgent } from "@/lib/assistant/agent";
import { authenticatedFetch } from "@/lib/auth/fetch";
import {
  AssistantActionsContext,
  type AssistantActions,
} from "@/ui/screens/overview/components/AssistantParts";
import {
  AssistantModelsContext,
  ZentinelleAgent,
} from "@/ui/screens/overview/components/ZentinelleAgent";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/** Runs an approved action as the person: the session's own request, with the action's approval token. */
async function executeAction({
  name,
  args,
  token,
}: Parameters<AssistantActions["execute"]>[0]): ReturnType<
  AssistantActions["execute"]
> {
  const res = await authenticatedFetch(`${API_URL}/assistant/execute-tool`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, args, approval_token: token }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    return {
      status: "failed",
      error: body?.error || `Action failed (${res.status})`,
    };
  }
  const data = (await res.json()) as { result?: { error?: unknown } };
  return {
    status: data.result?.error ? "failed" : "completed",
    result: data.result,
  };
}

/**
 * Zentinelle AI for the console: one conversation for the bubble and the
 * `/assistant` page, over `/assistant/chat` (lib/assistant/agent.ts). The
 * models load when the provider mounts; the chosen one and the page go with
 * every run. Approvals run as the person and only for those who may mutate.
 */
export function ZentinelleAssistantProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [agent] = React.useState(() =>
    createZentinelleAgent(authenticatedFetch),
  );
  const { models, loading } = useAvailableModels({ requireTools: true });
  const [model, setModel] = React.useState(DEFAULT_MODEL);
  const page = usePathname() ?? "/";
  const canMutate = useCapability("mutate");
  const actions = React.useMemo<AssistantActions>(
    () => ({ canMutate, execute: executeAction }),
    [canMutate],
  );
  const picked = React.useMemo(
    () => ({ models, loading, model, setModel }),
    [models, loading, model],
  );
  return (
    <CalliopeAgentProvider agent={agent} forwardedProps={{ model, page }}>
      <AssistantModelsContext.Provider value={picked}>
        <AssistantActionsContext.Provider value={actions}>
          {children}
        </AssistantActionsContext.Provider>
      </AssistantModelsContext.Provider>
    </CalliopeAgentProvider>
  );
}

/** The floating bubble on every console page. */
export function AssistantBubble() {
  return <ZentinelleAgent mode="bubble" />;
}
