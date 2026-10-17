"use client";

import { cn } from "@calliopelabs/ui";
import * as React from "react";

export interface SelectFieldOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly SelectFieldOption[];
  onChange: (value: string) => void;
  /** Keep the label for screen readers only, as in a filter bar. */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * A labelled native select, styled as the package's page-size select. Native
 * on purpose: keyboard, mobile pickers and form autofill come free.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  hideLabel,
  disabled,
  className,
}: SelectFieldProps) {
  const id = React.useId();
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <label
        htmlFor={id}
        className={cn(
          "shrink-0 text-sm text-muted-foreground",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
