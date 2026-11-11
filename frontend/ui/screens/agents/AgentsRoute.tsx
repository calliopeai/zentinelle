"use client";

import { useMutation } from "@apollo/client/react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@calliopelabs/ui";
import * as React from "react";

import { useAgentGroups } from "@/graphql/agent-groups/hooks";
import { ASSIGN_AGENT_TO_GROUP } from "@/graphql/agent-groups/mutations";
import type { AssignAgentToGroupPayload } from "@/graphql/agent-groups/types";
import { useEndpoints } from "@/graphql/agents/hooks";
import {
  ACTIVATE_AGENT_ENDPOINT,
  CREATE_AGENT_ENDPOINT,
  DELETE_AGENT_ENDPOINT,
  REGENERATE_ENDPOINT_API_KEY,
  SUSPEND_AGENT_ENDPOINT,
  UPDATE_AGENT_ENDPOINT,
} from "@/graphql/agents/mutations";
import type {
  ActivateAgentEndpointPayload,
  CreateAgentEndpointPayload,
  DeleteAgentEndpointPayload,
  EndpointData,
  SuspendAgentEndpointPayload,
  UpdateAgentEndpointPayload,
} from "@/graphql/agents/types";

import { useArrayTable } from "../../shared/array-table";
import { payloadOrThrow, useDebounced } from "../../shared/mutation";
import { OneTimeSecret } from "../../shared/OneTimeSecret";
import { AgentFormDialog, type AgentFormValues } from "./AgentFormDialog";
import { AgentsScreen } from "./AgentsScreen";
import { AssignGroupDialog } from "./AssignGroupDialog";
import { toAgentRow, type AgentRow } from "./format";

type Pending =
  | { kind: "register" }
  | { kind: "edit"; agent: AgentRow }
  | { kind: "assign"; agent: AgentRow }
  | { kind: "delete"; agent: AgentRow }
  | { kind: "regenerate"; agent: AgentRow }
  | { kind: "key"; agent: AgentRow; apiKey: string }
  | null;

/** The assign dialog with its own GetAgentGroups, sent only while the dialog is open. */
function AssignGroup({
  agent,
  onClose,
  onAssign,
}: {
  agent: AgentRow;
  onClose: () => void;
  onAssign: (groupId: string) => Promise<void>;
}) {
  const { groups, loading } = useAgentGroups(undefined);
  return (
    <AssignGroupDialog
      open
      onOpenChange={(open) => !open && onClose()}
      agentName={agent.name}
      currentGroupId={agent.group?.id}
      groups={loading ? null : groups}
      onAssign={onAssign}
    />
  );
}

export interface AgentsRouteProps {
  capabilities: readonly string[];
}

/**
 * The Agents route: GetEndpoints with the server's search and filters, and
 * every endpoint mutation, mapped onto AgentsScreen. `app/(app)/agents`
 * renders this once the stories are approved.
 */
export function AgentsRoute({ capabilities }: AgentsRouteProps) {
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState({ status: "", agentType: "" });
  const query = useDebounced(search.trim());
  const { endpoints, loading, error, refetch } = useEndpoints({
    search: query || null,
    status: filters.status || null,
    agentType: filters.agentType || null,
  });
  const rows = React.useMemo(() => endpoints.map(toAgentRow), [endpoints]);
  const byId = React.useMemo(
    () => new Map(endpoints.map((e) => [e.id, e] as [string, EndpointData])),
    [endpoints],
  );
  const table = useArrayTable({
    rows,
    loading,
    error,
    retry: () => void refetch(),
    search: { value: search, onChange: setSearch },
    isFiltered: Boolean(query || filters.status || filters.agentType),
    clearFilters: () => {
      setSearch("");
      setFilters({ status: "", agentType: "" });
    },
  });
  const [pending, setPending] = React.useState<Pending>(null);
  const close = () => setPending(null);

  const [create] = useMutation<{
    createAgentEndpoint: CreateAgentEndpointPayload;
  }>(CREATE_AGENT_ENDPOINT);
  const [update] = useMutation<{
    updateAgentEndpoint: UpdateAgentEndpointPayload;
  }>(UPDATE_AGENT_ENDPOINT);
  const [suspend] = useMutation<{
    suspendAgentEndpoint: SuspendAgentEndpointPayload;
  }>(SUSPEND_AGENT_ENDPOINT);
  const [activate] = useMutation<{
    activateAgentEndpoint: ActivateAgentEndpointPayload;
  }>(ACTIVATE_AGENT_ENDPOINT);
  const [remove] = useMutation<{
    deleteAgentEndpoint: DeleteAgentEndpointPayload;
  }>(DELETE_AGENT_ENDPOINT);
  const [regenerate] = useMutation<{
    regenerateEndpointApiKey: {
      apiKey: string | null;
      success: boolean | null;
      error: string | null;
    };
  }>(REGENERATE_ENDPOINT_API_KEY);
  const [assign] = useMutation<{
    assignAgentToGroup: AssignAgentToGroupPayload;
  }>(ASSIGN_AGENT_TO_GROUP);

  const [statusError, setStatusError] = React.useState("");

  async function submitAgent(values: AgentFormValues) {
    if (pending?.kind === "edit") {
      const { data } = await update({
        variables: {
          input: {
            id: pending.agent.id,
            name: values.name,
            agentType: values.agentType,
            capabilities: values.capabilities,
            metadata: values.metadata,
          },
        },
      });
      payloadOrThrow(data?.updateAgentEndpoint, "The agent was not saved.");
      void refetch();
      return;
    }
    const { data } = await create({
      variables: {
        input: {
          name: values.name,
          agentId: values.agentId,
          agentType: values.agentType,
          capabilities: values.capabilities.length ? values.capabilities : null,
          metadata: values.metadata,
        },
      },
    });
    const payload = payloadOrThrow(
      data?.createAgentEndpoint,
      "The agent was not registered.",
    );
    void refetch();
    return { apiKey: payload.apiKey };
  }

  async function setStatus(agent: AgentRow, to: "suspend" | "activate") {
    setStatusError("");
    try {
      if (to === "suspend") {
        const { data } = await suspend({ variables: { id: agent.id } });
        payloadOrThrow(
          data?.suspendAgentEndpoint,
          `${agent.name} was not suspended.`,
        );
      } else {
        const { data } = await activate({ variables: { id: agent.id } });
        payloadOrThrow(
          data?.activateAgentEndpoint,
          `${agent.name} was not activated.`,
        );
      }
      void refetch();
    } catch (failure) {
      setStatusError(
        failure instanceof Error
          ? failure.message
          : "The status did not change.",
      );
    }
  }

  const editing =
    pending?.kind === "edit" ? byId.get(pending.agent.id) : undefined;
  const initial = React.useMemo<Partial<AgentFormValues> | undefined>(
    () =>
      editing
        ? {
            name: editing.name,
            agentId: editing.agentId,
            agentType: editing.agentType,
            capabilities: editing.capabilities,
            metadata: editing.metadata,
          }
        : undefined,
    [editing],
  );

  return (
    <>
      <AgentsScreen
        notice={
          statusError ? (
            <p role="alert" className="text-danger-fg text-sm">
              {statusError}
            </p>
          ) : undefined
        }
        table={table}
        filters={filters}
        onFiltersChange={setFilters}
        capabilities={capabilities}
        onRegister={() => setPending({ kind: "register" })}
        onEdit={(agent) => setPending({ kind: "edit", agent })}
        onAssignGroup={(agent) => setPending({ kind: "assign", agent })}
        onSuspend={(agent) => void setStatus(agent, "suspend")}
        onActivate={(agent) => void setStatus(agent, "activate")}
        onRegenerateKey={(agent) => setPending({ kind: "regenerate", agent })}
        onDelete={(agent) => setPending({ kind: "delete", agent })}
      />
      <AgentFormDialog
        open={pending?.kind === "register" || pending?.kind === "edit"}
        onOpenChange={(open) => !open && close()}
        mode={pending?.kind === "edit" ? "edit" : "register"}
        initial={initial}
        onSubmit={submitAgent}
      />
      {pending?.kind === "assign" && (
        <AssignGroup
          agent={pending.agent}
          onClose={close}
          onAssign={async (groupId) => {
            const { data } = await assign({
              variables: { agentId: pending.agent.id, groupId },
            });
            payloadOrThrow(
              data?.assignAgentToGroup,
              "The agent was not assigned.",
            );
            void refetch();
          }}
        />
      )}
      <ConfirmDialog
        open={pending?.kind === "delete"}
        onOpenChange={(open) => !open && close()}
        title={
          pending?.kind === "delete" ? `Delete ${pending.agent.name}?` : ""
        }
        description="Its API key stops working now and its history stays in the audit log. Registering it again issues a new key."
        confirmLabel="Delete agent"
        destructive
        onConfirm={async () => {
          if (pending?.kind !== "delete") return;
          const { data } = await remove({
            variables: { id: pending.agent.id },
          });
          payloadOrThrow(
            data?.deleteAgentEndpoint,
            "The agent was not deleted.",
          );
          void refetch();
        }}
      />
      <ConfirmDialog
        open={pending?.kind === "regenerate"}
        onOpenChange={(open) =>
          !open && pending?.kind === "regenerate" && close()
        }
        title={
          pending?.kind === "regenerate"
            ? `Regenerate ${pending.agent.name}'s API key?`
            : ""
        }
        description="The current key stops working now. The agent fails its calls until it has the new one."
        confirmLabel="Regenerate key"
        destructive
        onConfirm={async () => {
          if (pending?.kind !== "regenerate") return;
          const { data } = await regenerate({
            variables: { id: pending.agent.id },
          });
          const payload = payloadOrThrow(
            data?.regenerateEndpointApiKey,
            "The key was not regenerated.",
          );
          if (!payload.apiKey)
            throw new Error("The server did not return the new key.");
          setPending({
            kind: "key",
            agent: pending.agent,
            apiKey: payload.apiKey,
          });
          return false;
        }}
      />
      <Dialog
        open={pending?.kind === "key"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy the new API key</DialogTitle>
            <DialogDescription>
              It is shown once. Give it to the agent now.
            </DialogDescription>
          </DialogHeader>
          {pending?.kind === "key" && (
            <OneTimeSecret
              label={`API key for ${pending.agent.name}`}
              value={pending.apiKey}
            />
          )}
          <DialogFooter>
            <Button onClick={close}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
