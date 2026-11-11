"use client";

import { cn } from "@calliopelabs/ui";

export interface SwitchProps {
  /** The accessible name ("Available in the assistant for Anthropic"). */
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Show the label beside the switch; screen readers only by default. */
  showLabel?: boolean;
  className?: string;
}

/** An on/off setting that applies at once. A choice saved with a form is a checkbox. */
export function Switch({
  label,
  checked,
  onCheckedChange,
  disabled,
  showLabel,
  className,
}: SwitchProps) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={showLabel ? undefined : label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          checked ? "border-primary bg-primary" : "bg-muted",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-3.5 rounded-full transition-transform",
            checked
              ? "translate-x-4 bg-primary-foreground"
              : "translate-x-0.5 bg-muted-foreground",
          )}
        />
      </button>
      {showLabel && <span>{label}</span>}
    </label>
  );
}
