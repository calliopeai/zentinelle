"use client";

/**
 * Form building blocks the package does not ship yet: a labelled field with
 * a hint and an error, a native select on the Input's tokens, and the row of
 * actions under a form with its saved or failed message. Candidates for the
 * package.
 */
import { Button, cn } from "@calliopelabs/ui";
import * as React from "react";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export interface FormFieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  /** The control, given the id and the descriptions it must carry. */
  children: (control: FieldControlProps) => React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  hint,
  error,
  children,
  className,
}: FormFieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  options,
  className,
  ...props
}: Omit<React.ComponentProps<"select">, "children"> & {
  options: readonly SelectOption[];
}) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export interface FormActionsProps {
  submitLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  /** Nothing to save: the submit button holds. */
  disabled?: boolean;
  /** The last save failed; the message says why. */
  error?: string | null;
  /** The last save landed. */
  saved?: boolean;
  savedLabel?: string;
  /** Beside the button, on the left: a revision number, a note. */
  children?: React.ReactNode;
}

export function FormActions({
  submitLabel,
  pendingLabel = "Saving",
  pending = false,
  disabled = false,
  error,
  saved = false,
  savedLabel = "Saved",
  children,
}: FormActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
      <div className="mr-auto min-w-0 text-xs text-muted-foreground">
        {children}
      </div>
      <p role="status" aria-live="polite" className="text-xs">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : saved && !pending ? (
          <span className="text-muted-foreground">{savedLabel}</span>
        ) : null}
      </p>
      <Button type="submit" size="sm" disabled={pending || disabled}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}

/** Runs a save, and holds its pending, saved and failed states for FormActions. */
export function useSaveState() {
  const [pending, setPending] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = React.useCallback(async (save: () => Promise<unknown>) => {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await save();
      setSaved(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The change was not saved.",
      );
    } finally {
      setPending(false);
    }
  }, []);
  const reset = React.useCallback(() => setSaved(false), []);
  return { pending, saved, error, run, reset };
}
