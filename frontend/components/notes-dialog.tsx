"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type NotesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  /** When false the operator may confirm with an empty box. */
  required?: boolean;
  confirmLabel?: string;
  onConfirm: (notes: string) => Promise<void> | void;
};

/**
 * A modal for the short piece of prose an action wants before it runs — an
 * incident's resolution summary, the lessons learned when one is closed.
 *
 * It exists because those were collected with `window.prompt`, which cannot be
 * styled, cannot be validated before it closes, cannot be driven by a test, and
 * is rendered by the browser rather than by the product — in a GRC console
 * whose whole subject is the record being kept properly.
 *
 * The text is held here rather than by each caller: every one of them wants the
 * same three things (a labelled box, a cancel that writes nothing, and a
 * confirm that is disabled until the box has content when content is required),
 * and the box is cleared on open so a cancelled note never turns up prefilled
 * in the next incident.
 */
export function NotesDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  required = true,
  confirmLabel = "Confirm",
  onConfirm,
}: NotesDialogProps) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Cleared on open, not on close: closing while a request is in flight would
  // otherwise blank the box under the operator, and a dialog that reopens
  // holding the last incident's summary is worse than one that reopens empty.
  useEffect(() => {
    if (open) {
      setNotes("");
      setSubmitting(false);
    }
  }, [open]);

  const canConfirm = !submitting && (!required || notes.trim().length > 0);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm(notes.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="notes-dialog-text">{label}</Label>
          <Textarea
            id="notes-dialog-text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={placeholder}
            rows={5}
            autoFocus
            disabled={submitting}
          />
          {!required ? (
            <p className="text-muted-foreground text-xs">Optional.</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            {submitting ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
