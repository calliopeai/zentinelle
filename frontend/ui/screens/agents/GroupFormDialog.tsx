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

import { SelectField, TextField, TextareaField } from "../../shared/FormField";
import { useAgentLabels } from "./format";

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
  const t = useTranslations("agents.groups.form");
  const c = useTranslations("common");
  const labels = useAgentLabels();
  const [form, setForm] = React.useState<GroupFormValues>(initial ?? BLANK);
  const [nameError, setNameError] = React.useState("");
  const [failure, setFailure] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setNameError(t("nameError"));
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
        error instanceof Error && error.message ? error.message : t("failed"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogContent
      className="max-w-md sm:max-w-md"
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
            {initial ? t("editTitle", { name: initial.name }) : t("newTitle")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <TextField
          label={t("name")}
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={nameError}
          maxLength={255}
          autoComplete="off"
        />
        <TextareaField
          label={t("groupDescription")}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
        />
        <SelectField
          label={t("tier")}
          required
          value={form.tier}
          onChange={(e) => setForm({ ...form, tier: e.target.value })}
          options={labels.tierOptions}
          hint={labels.tierDescription(form.tier)}
        />
        <SelectField
          label={t("color")}
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          options={labels.colorOptions}
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
            {c("cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? c("saving")
              : initial
                ? c("saveChanges")
                : t("submitCreate")}
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
