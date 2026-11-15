import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  Textarea,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";
import * as React from "react";

import type { CreateIncidentInput } from "@/graphql/risks/types";

import { useActivityLabels } from "./tones";

export interface ReportIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sends `CreateIncident`. A rejection keeps the dialog open and shows its message. */
  onSubmit: (input: CreateIncidentInput) => Promise<unknown> | void;
}

/** Report an incident by hand, with the fields `CreateIncidentInput` takes that a person knows at the start. */
export function ReportIncidentDialog({
  open,
  onOpenChange,
  onSubmit,
}: ReportIncidentDialogProps) {
  const t = useTranslations("activity.incidents");
  const c = useTranslations("common");
  const labels = useActivityLabels();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [severity, setSeverity] = React.useState("medium");
  const [incidentType, setIncidentType] = React.useState("other");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setSeverity("medium");
    setIncidentType("other");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError(t("reportDialog.required"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        severity,
        incidentType,
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : t("errors.report"),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("reportDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("reportDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <Field label={t("reportDialog.titleField")}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={error !== null && !title.trim()}
              required
            />
          </Field>
          <Field label={t("reportDialog.what")}>
            <Textarea
              className="min-h-20"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              aria-invalid={error !== null && !description.trim()}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("reportDialog.severity")}>
              <Select
                className="w-full"
                value={severity}
                onValueChange={setSeverity}
                options={labels.incidentSeverities}
              />
            </Field>
            <Field label={t("reportDialog.type")}>
              <Select
                className="w-full"
                value={incidentType}
                onValueChange={setIncidentType}
                options={labels.incidentTypes}
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger-fg">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {c("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("reportDialog.pending") : t("reportDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
