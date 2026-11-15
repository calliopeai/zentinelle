"use client";

/**
 * Form building blocks the package does not ship yet: the row of actions
 * under a form with its saved or failed message, and the hook that runs a
 * save and holds its state. Candidates for the package.
 */
import { Button } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";
import * as React from "react";

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
  const t = useTranslations("settings.formField");
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
        failure instanceof Error ? failure.message : t("theChangeWasNotSaved"),
      );
    } finally {
      setPending(false);
    }
  }, []);
  const reset = React.useCallback(() => setSaved(false), []);
  return { pending, saved, error, run, reset };
}
