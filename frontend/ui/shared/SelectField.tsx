"use client";

import { Select, cn } from "@calliopelabs/ui";
import * as React from "react";

import { fromSelectValue, toSelectValue } from "./select-any";

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
 * A select with its label inline, as in a filter bar. An option whose value
 * is "" stands for "none" and is offered as such.
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
      <Select
        id={id}
        value={toSelectValue(value)}
        disabled={disabled}
        onValueChange={(next) => onChange(fromSelectValue(next))}
        options={options.map((option) => ({
          ...option,
          value: toSelectValue(option.value),
        }))}
      />
    </div>
  );
}
