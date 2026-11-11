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

import { Field, Select, type SelectOption } from "../../../patterns/form";

/**
 * What the dialog asks for, in the shape of the two operations behind it:
 * `GenerateComplianceReport` (GraphQL) for a framework report, and
 * `POST reports/` (REST) for a report job with a format.
 */
export type ReportRequest =
  | {
      kind: "compliance";
      frameworkId: string | null;
      startDate: string;
      endDate: string;
    }
  | {
      kind: "control_coverage" | "violation_summary" | "audit_trail";
      format: "csv" | "pdf" | "ndjson";
      dateFrom: string;
      dateTo: string;
    };

export const REPORT_KINDS: readonly SelectOption[] = [
  { value: "compliance", label: "Framework compliance" },
  { value: "control_coverage", label: "Control coverage" },
  { value: "violation_summary", label: "Violation summary" },
  { value: "audit_trail", label: "Audit trail" },
];

const FORMATS: readonly SelectOption[] = [
  { value: "csv", label: "CSV" },
  { value: "pdf", label: "PDF" },
  { value: "ndjson", label: "NDJSON" },
];

export interface GenerateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The frameworks the backend tracks, by id. */
  frameworks: readonly SelectOption[];
  /** Today, as YYYY-MM-DD: the default end of the period. */
  today: string;
  /** Resolves with an error message to keep the dialog open, or nothing on success. */
  onSubmit: (request: ReportRequest) => Promise<string | void>;
}

function daysBefore(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Generate a report: a kind, a period, then a framework or a format. */
export function GenerateReportDialog({
  open,
  onOpenChange,
  frameworks,
  today,
  onSubmit,
}: GenerateReportDialogProps) {
  const [kind, setKind] = React.useState("compliance");
  const [framework, setFramework] = React.useState("");
  const [format, setFormat] = React.useState("csv");
  const [from, setFrom] = React.useState(() => daysBefore(today, 30));
  const [to, setTo] = React.useState(today);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const periodError =
    from && to && from > to ? "The period ends before it starts." : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (periodError) return;
    setPending(true);
    setError(null);
    const request: ReportRequest =
      kind === "compliance"
        ? { kind, frameworkId: framework || null, startDate: from, endDate: to }
        : {
            kind: kind as Exclude<ReportRequest["kind"], "compliance">,
            format: format as "csv" | "pdf" | "ndjson",
            dateFrom: from,
            dateTo: to,
          };
    try {
      const failure = await onSubmit(request);
      if (failure) setError(failure);
      else onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Generate a report</DialogTitle>
            <DialogDescription>
              Reports run on the server and appear in the list when they are
              ready.
            </DialogDescription>
          </DialogHeader>
          <Field label="Report">
            <Select
              options={REPORT_KINDS}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            />
          </Field>
          {kind === "compliance" ? (
            <Field
              label="Framework"
              hint="Leave as All frameworks for one report across every framework."
            >
              <Select
                options={frameworks}
                placeholder="All frameworks"
                value={framework}
                onChange={(event) => setFramework(event.target.value)}
              />
            </Field>
          ) : (
            <Field label="Format">
              <Select
                options={FORMATS}
                value={format}
                onChange={(event) => setFormat(event.target.value)}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From" required>
              <Input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field label="To" required error={periodError}>
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
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
            <Button type="submit" disabled={pending || Boolean(periodError)}>
              {pending ? "Generating" : "Generate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
