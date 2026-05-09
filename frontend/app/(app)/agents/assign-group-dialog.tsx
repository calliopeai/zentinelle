"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { useAgentGroups } from "@/graphql/agent-groups/hooks";
import { ASSIGN_AGENT_TO_GROUP } from "@/graphql/agent-groups/mutations";
import type { AssignAgentToGroupPayload } from "@/graphql/agent-groups/types";
import type { EndpointData } from "@/graphql/agents/types";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COLOR_SWATCH: Record<string, string> = {
  brand: "#37efed",
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  slate: "#64748b",
};

type AssignGroupDialogProps = {
  agent: EndpointData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
};

function AssignGroupForm({
  agent,
  onClose,
  onAssigned,
}: {
  agent: EndpointData;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { groups, loading: loadingGroups } = useAgentGroups();
  const [groupId, setGroupId] = useState<string>(agent.agentGroup?.id ?? "");
  const [assignAgent, { loading: assigning }] = useMutation<{
    assignAgentToGroup: AssignAgentToGroupPayload;
  }>(ASSIGN_AGENT_TO_GROUP);

  const handleAssign = async () => {
    if (!groupId) return;
    try {
      const { data } = await assignAgent({
        variables: { agentId: agent.id, groupId },
      });
      if (data?.assignAgentToGroup?.success) {
        const groupName =
          groups.find((g) => g.id === groupId)?.name ?? "group";
        toast.success(`"${agent.name}" assigned to "${groupName}"`);
        onClose();
        onAssigned();
      } else {
        toast.error(
          data?.assignAgentToGroup?.errors?.[0] ?? "Failed to assign group"
        );
      }
    } catch {
      toast.error("Failed to assign group");
    }
  };

  const noGroups = !loadingGroups && groups.length === 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Assign to Group</DialogTitle>
        <DialogDescription>
          {`Move "${agent.name}" into a group to inherit shared posture defaults.`}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2 py-2">
        <Label>Group</Label>
        {noGroups ? (
          <p className="text-muted-foreground text-sm">
            No groups exist yet. Create one from the Agent Groups page.
          </p>
        ) : (
          <Select
            value={groupId}
            onValueChange={setGroupId}
            disabled={loadingGroups}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a group" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => {
                const swatch = COLOR_SWATCH[g.color] ?? "#64748b";
                return (
                  <SelectItem key={g.id} value={g.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: swatch }}
                        aria-hidden
                      />
                      <span>{g.name}</span>
                      <span className="text-muted-foreground text-xs">
                        ({g.tier})
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
        {agent.agentGroup && (
          <p className="text-muted-foreground text-xs">
            Currently in: {agent.agentGroup.name}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleAssign}
          disabled={
            !groupId ||
            assigning ||
            loadingGroups ||
            groupId === agent.agentGroup?.id
          }
        >
          {assigning && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
          Assign
        </Button>
      </DialogFooter>
    </>
  );
}

export function AssignGroupDialog({
  agent,
  open,
  onOpenChange,
  onAssigned,
}: AssignGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {agent && (
          <AssignGroupForm
            key={agent.id}
            agent={agent}
            onClose={() => onOpenChange(false)}
            onAssigned={onAssigned}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
