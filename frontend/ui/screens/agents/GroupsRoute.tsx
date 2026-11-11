"use client";

import { useMutation } from "@apollo/client/react";
import { ConfirmDialog } from "@calliopelabs/ui";
import * as React from "react";

import { useAgentGroups } from "@/graphql/agent-groups/hooks";
import {
  CREATE_AGENT_GROUP,
  DELETE_AGENT_GROUP,
  UPDATE_AGENT_GROUP,
} from "@/graphql/agent-groups/mutations";
import type {
  AgentGroupData,
  CreateAgentGroupPayload,
  DeleteAgentGroupPayload,
  UpdateAgentGroupPayload,
} from "@/graphql/agent-groups/types";

import { useArrayTable } from "../../shared/array-table";
import { payloadOrThrow, useDebounced } from "../../shared/mutation";
import { GroupFormDialog, type GroupFormValues } from "./GroupFormDialog";
import { GroupsScreen } from "./GroupsScreen";

export interface GroupsRouteProps {
  capabilities: readonly string[];
}

type Pending =
  | { kind: "create" }
  | { kind: "edit"; group: AgentGroupData }
  | { kind: "delete"; group: AgentGroupData }
  | null;

/** The Groups route: GetAgentGroups with its search and tier, and the group mutations. */
export function GroupsRoute({ capabilities }: GroupsRouteProps) {
  const [search, setSearch] = React.useState("");
  const [tier, setTier] = React.useState("");
  const query = useDebounced(search.trim());
  const { groups, loading, error, refetch } = useAgentGroups({
    search: query || null,
    tier: tier || null,
  });
  const table = useArrayTable({
    rows: groups,
    loading,
    error,
    retry: () => void refetch(),
    search: { value: search, onChange: setSearch },
    isFiltered: Boolean(query || tier),
    clearFilters: () => {
      setSearch("");
      setTier("");
    },
  });
  const [pending, setPending] = React.useState<Pending>(null);
  const [create] = useMutation<{ createAgentGroup: CreateAgentGroupPayload }>(
    CREATE_AGENT_GROUP,
  );
  const [update] = useMutation<{ updateAgentGroup: UpdateAgentGroupPayload }>(
    UPDATE_AGENT_GROUP,
  );
  const [remove] = useMutation<{ deleteAgentGroup: DeleteAgentGroupPayload }>(
    DELETE_AGENT_GROUP,
  );

  const initial = React.useMemo<GroupFormValues | undefined>(
    () =>
      pending?.kind === "edit"
        ? {
            name: pending.group.name,
            description: pending.group.description,
            tier: pending.group.tier,
            color: pending.group.color,
          }
        : undefined,
    [pending],
  );

  async function submit(values: GroupFormValues) {
    if (pending?.kind === "edit") {
      const { data } = await update({
        variables: { id: pending.group.id, ...values },
      });
      const payload = payloadOrThrow(
        data?.updateAgentGroup,
        "The group was not saved.",
      );
      if (!payload.group) throw new Error("The group was not saved.");
    } else {
      const { data } = await create({ variables: values });
      const payload = payloadOrThrow(
        data?.createAgentGroup,
        "The group was not created.",
      );
      if (!payload.group) throw new Error("The group was not created.");
    }
    void refetch();
  }

  return (
    <>
      <GroupsScreen
        table={table}
        tier={tier}
        onTierChange={setTier}
        capabilities={capabilities}
        onCreate={() => setPending({ kind: "create" })}
        onEdit={(group) => setPending({ kind: "edit", group })}
        onDelete={(group) => setPending({ kind: "delete", group })}
      />
      <GroupFormDialog
        open={pending?.kind === "create" || pending?.kind === "edit"}
        onOpenChange={(open) => !open && setPending(null)}
        initial={initial}
        onSubmit={submit}
      />
      <ConfirmDialog
        open={pending?.kind === "delete"}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.kind === "delete" ? `Delete ${pending.group.name}?` : ""
        }
        description={
          pending?.kind === "delete" && pending.group.agentCount
            ? `Its ${pending.group.agentCount} agents leave the group and fall back to the organization's defaults.`
            : "No agents are in this group."
        }
        confirmLabel="Delete group"
        destructive
        onConfirm={async () => {
          if (pending?.kind !== "delete") return;
          const { data } = await remove({
            variables: { id: pending.group.id },
          });
          payloadOrThrow(data?.deleteAgentGroup, "The group was not deleted.");
          void refetch();
        }}
      />
    </>
  );
}
