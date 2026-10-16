"use client";

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

export interface LanguageOption {
  value: string;
  label: string;
}

export interface LanguageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  locales: readonly LanguageOption[];
  onLocaleChange: (locale: string) => void;
  title?: string;
  description?: string;
  applyLabel?: string;
  cancelLabel?: string;
}

/** The interface language, from the user menu. Pure: the app stores the choice (the `locale` cookie). */
export function LanguageDialog({
  open,
  onOpenChange,
  locale,
  locales,
  onLocaleChange,
  title = "Language",
  description = "Choose the language used throughout the interface.",
  applyLabel = "Apply",
  cancelLabel = "Cancel",
}: LanguageDialogProps) {
  const [choice, setChoice] = React.useState(locale);
  const name = React.useId();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setChoice(locale);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-1">
          <legend className="sr-only">{title}</legend>
          {locales.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={choice === option.value}
                onChange={() => setChoice(option.value)}
                className="accent-primary"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            onClick={() => {
              if (choice !== locale) onLocaleChange(choice);
              onOpenChange(false);
            }}
          >
            {applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
