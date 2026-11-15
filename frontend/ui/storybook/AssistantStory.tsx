/**
 * The assistant as a story mounts it: the app's adapter
 * (lib/assistant/agent.ts) over recorded `/assistant/chat` turns, the models
 * list, and the approval card's actions, as a role. Nothing leaves the page.
 */
import { CalliopeAgentProvider } from "@calliopelabs/ui/agent";
import * as React from "react";

import { createZentinelleAgent } from "@/lib/assistant/agent";

import type { Role } from "../product";
import {
  AssistantActionsContext,
  type AssistantActions,
} from "../screens/overview/components/AssistantParts";
import { AssistantModelsContext } from "../screens/overview/components/ZentinelleAgent";
import {
  assistantFetch,
  assistantModels,
  type ChatTurn,
} from "./fixtures/assistant";
import { capabilitiesOf } from "./session";

export function AssistantStory({
  turns,
  role = "operator",
  children,
}: {
  turns: readonly ChatTurn[];
  role?: Role;
  children: React.ReactNode;
}) {
  const [fetcher] = React.useState(() => assistantFetch(turns));
  const [agent] = React.useState(() => createZentinelleAgent(fetcher));
  const [model, setModel] = React.useState(assistantModels[0].value);
  const actions = React.useMemo<AssistantActions>(
    () => ({
      canMutate: capabilitiesOf(role).includes("mutate"),
      execute: async () => ({ status: "completed", result: { success: true } }),
    }),
    [role],
  );
  return (
    <CalliopeAgentProvider agent={agent} forwardedProps={{ model }}>
      <AssistantModelsContext.Provider
        value={{ models: assistantModels, loading: false, model, setModel }}
      >
        <AssistantActionsContext.Provider value={actions}>
          {children}
        </AssistantActionsContext.Provider>
      </AssistantModelsContext.Provider>
    </CalliopeAgentProvider>
  );
}
