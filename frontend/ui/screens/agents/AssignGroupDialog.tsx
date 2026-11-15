import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("agents.assign");
  const c = useTranslations("common");
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
        error instanceof Error && error.message ? error.message : t("failed"),
      );
    } finally {
      setPending(false);
    }
  }

  const loading = groups === null;
  const none = groups !== null && groups.length === 0;
  return (
    <DialogContent
      className="max-w-md sm:max-w-md"
      hideCloseButton={pending}
      onEscapeKeyDown={(e) => pending && e.preventDefault()}
      onInteractOutside={(e) => pending && e.preventDefault()}
    >
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">
            {t("title", { name: agentName })}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {none ? (
          <p className="text-muted-foreground text-sm">{t("noGroups")}</p>
        ) : (
          <SelectField
            label={t("group")}
            required
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            options={(groups ?? []).map((g) => ({
              value: g.id,
              label: g.name,
            }))}
            placeholder={loading ? t("loading") : t("placeholder")}
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
            {c("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={pending || !groupId || groupId === currentGroupId}
          >
            {pending ? t("pending") : t("submit")}
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
