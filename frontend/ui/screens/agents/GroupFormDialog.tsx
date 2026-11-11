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

import { SelectField, TextField, TextareaField } from "../../shared/FormField";
import { GROUP_COLORS, GROUP_TIERS } from "./format";

export interface GroupFormValues {
  name: string;
  description: string;
  tier: string;
  color: string;
}

export interface GroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent: a new group. */
  initial?: GroupFormValues;
  /** CreateAgentGroup or UpdateAgentGroup; reject with the server's `errors` joined to show them. */
  onSubmit: (values: GroupFormValues) => Promise<void>;
}

const BLANK: GroupFormValues = {
  name: "",
  description: "",
  tier: "standard",
  color: "brand",
};

/** Create or edit a group: its name, what it is for, its tier and its colour. */
function GroupFormDialogContent({
  onOpenChange,
  initial,
  onSubmit,
}: Omit<GroupFormDialogProps, "open">) {
  const [form, setForm] = React.useState<GroupFormValues>(initial ?? BLANK);
  const [nameError, setNameError] = React.useState("");
  const [failure, setFailure] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setNameError("A name needs at least 2 characters.");
      return;
    }
    setNameError("");
    setPending(true);
    setFailure("");
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
      });
      onOpenChange(false);
    } catch (error) {
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : "The group was not saved.",
      );
    } finally {
      setPending(false);
    }
  }

  const tier = GROUP_TIERS.find((t) => t.value === form.tier);
  return (
    <DialogContent
      className="max-w-md"
      hideCloseButton={pending}
      onEscapeKeyDown={(e) => pending && e.preventDefault()}
      onInteractOutside={(e) => pending && e.preventDefault()}
    >
      <form
        onSubmit={submit}
        noValidate
        className="flex min-w-0 flex-col gap-4"
      >
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">
            {initial ? `Edit ${initial.name}` : "New group"}
          </DialogTitle>
          <DialogDescription>
            Agents in a group take its tier&apos;s enforcement defaults.
          </DialogDescription>
        </DialogHeader>
        <TextField
          label="Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={nameError}
          maxLength={255}
          autoComplete="off"
        />
        <TextareaField
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
        />
        <SelectField
          label="Tier"
          required
          value={form.tier}
          onChange={(e) => setForm({ ...form, tier: e.target.value })}
          options={GROUP_TIERS}
          hint={tier?.description}
        />
        <SelectField
          label="Colour"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          options={GROUP_COLORS}
        />
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
          <Button type="submit" disabled={pending}>
            {pending ? "Saving" : initial ? "Save changes" : "Create group"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** The dialog; its form state starts fresh each time it opens. */
export function GroupFormDialog({ open, ...props }: GroupFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      {open && <GroupFormDialogContent {...props} />}
    </Dialog>
  );
}
