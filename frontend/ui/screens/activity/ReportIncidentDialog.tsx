import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@calliopelabs/ui";
import * as React from "react";

import type { CreateIncidentInput } from "@/graphql/risks/types";

import { INCIDENT_SEVERITIES, INCIDENT_TYPES } from "./tones";

export interface ReportIncidentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sends `CreateIncident`. A rejection keeps the dialog open and shows its message. */
  onSubmit: (input: CreateIncidentInput) => Promise<unknown> | void;
}

const FIELD = "flex flex-col gap-1 text-sm";
const SELECT =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Report an incident by hand, with the fields `CreateIncidentInput` takes that a person knows at the start. */
export function ReportIncidentDialog({
  open,
  onOpenChange,
  onSubmit,
}: ReportIncidentDialogProps) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [severity, setSeverity] = React.useState("medium");
  const [incidentType, setIncidentType] = React.useState("other");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

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
      setError("A title and a description are required.");
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
      setError(e instanceof Error ? e.message : "The incident was not saved.");
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
            <DialogTitle>Report an incident</DialogTitle>
            <DialogDescription>
              Opens an incident and notifies the people on call. Link it to an
              agent or a risk from the incident page.
            </DialogDescription>
          </DialogHeader>
          <div className={FIELD}>
            <label htmlFor={`${id}-title`}>Title</label>
            <Input
              id={`${id}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={error !== null && !title.trim()}
              required
            />
          </div>
          <div className={FIELD}>
            <label htmlFor={`${id}-description`}>What happened</label>
            <textarea
              id={`${id}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              aria-invalid={error !== null && !description.trim()}
              required
              className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={FIELD}>
              <label htmlFor={`${id}-severity`}>Severity</label>
              <select
                id={`${id}-severity`}
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className={SELECT}
              >
                {INCIDENT_SEVERITIES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={FIELD}>
              <label htmlFor={`${id}-type`}>Type</label>
              <select
                id={`${id}-type`}
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                className={SELECT}
              >
                {INCIDENT_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
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
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Reporting…" : "Report incident"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
