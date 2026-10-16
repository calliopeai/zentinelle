import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@calliopelabs/ui";
import * as React from "react";

import { SelectField } from "../../shared/FormField";

export interface AssignGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
  /** The agent's current group, preselected. */
  currentGroupId?: string | null;
  /** From GetAgentGroups. Null while it loads. */
  groups: readonly { id: string; name: string }[] | null;
  /** AssignAgentToGroup; reject with the server's message to show it. */
  onAssign: (groupId: string) => Promise<void>;
}

/** Put an agent in a group, so the group's posture defaults apply to it. */
function AssignGroupDialogContent({
  onOpenChange,
  agentName,
  currentGroupId,
  groups,
  onAssign,
}: Omit<AssignGroupDialogProps, "open">) {
  const [groupId, setGroupId] = React.useState(currentGroupId ?? "");
  const [failure, setFailure] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!groupId) return;
    setPending(true);
    setFailure("");
    try {
      await onAssign(groupId);
      onOpenChange(false);
    } catch (error) {
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : "The agent was not assigned.",
      );
    } finally {
      setPending(false);
    }
  }

  const loading = groups === null;
  const none = groups !== null && groups.length === 0;
  return (
    <DialogContent
      className="max-w-md"
      hideCloseButton={pending}
      onEscapeKeyDown={(e) => pending && e.preventDefault()}
      onInteractOutside={(e) => pending && e.preventDefault()}
    >
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">
            Assign {agentName} to a group
          </DialogTitle>
          <DialogDescription>
            The group&apos;s tier sets the agent&apos;s default enforcement
            posture.
          </DialogDescription>
        </DialogHeader>
        {none ? (
          <p className="text-muted-foreground text-sm">
            There are no groups yet. Create one under Agents, Groups.
          </p>
        ) : (
          <SelectField
            label="Group"
            required
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            options={(groups ?? []).map((g) => ({
              value: g.id,
              label: g.name,
            }))}
            placeholder={loading ? "Loading groups" : "Choose a group"}
            disabled={loading || pending}
          />
        )}
        {failure && (
          <p
            role="alert"
            className="text-danger-fg text-sm [overflow-wrap:anywhere]"
          >
            {failure}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending || !groupId || groupId === currentGroupId}
          >
            {pending ? "Assigning" : "Assign"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** The dialog; its form state starts fresh each time it opens. */
export function AssignGroupDialog({ open, ...props }: AssignGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      {open && <AssignGroupDialogContent {...props} />}
    </Dialog>
  );
}
