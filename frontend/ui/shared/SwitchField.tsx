"use client";

/**
 * An on/off setting: a label, a line of what it does, and a switch. A
 * button with role="switch", so it needs no extra dependency. Candidate for
 * the package, which has a Checkbox but no Switch.
 */
import { cn } from "@calliopelabs/ui";
import * as React from "react";

export interface SwitchFieldProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  className,
}: SwitchFieldProps) {
  const id = React.useId();
  return (
    <div
      className={cn(
        "flex min-w-0 items-start justify-between gap-4 py-2",
        className,
      )}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-input transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-3.5 rounded-full bg-background shadow transition-transform motion-reduce:transition-none",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
