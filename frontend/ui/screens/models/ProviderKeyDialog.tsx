"use client";

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

export interface ProviderKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerLabel: string;
  /** A key is stored already: this replaces it. */
  rotating: boolean;
  /** `POST /settings/llm-providers`. Resolve to close; reject to show the message. */
  onSave: (apiKey: string) => Promise<unknown> | unknown;
}

/** Add or rotate a provider key. The key is write-only: stored encrypted, shown back as its first eight characters. */
export function ProviderKeyDialog({
  open,
  onOpenChange,
  providerLabel,
  rotating,
  onSave,
}: ProviderKeyDialogProps) {
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  const verb = rotating ? "Rotate" : "Add";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (!next) {
          setValue("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError(null);
            try {
              await onSave(value.trim());
              setValue("");
              onOpenChange(false);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Could not save the key.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {verb} the {providerLabel} key
            </DialogTitle>
            <DialogDescription>
              Stored encrypted at rest. Zentinelle AI shows only its first eight
              characters afterwards.
              {rotating &&
                " The current key stops working once this one is saved."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              API key
            </label>
            <Input
              id={id}
              type="password"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="font-mono"
              required
            />
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
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !value.trim()}>
              {saving ? "Saving" : "Save key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
