"use client";

import { cn } from "@calliopelabs/ui";
import * as React from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  /** Names the choice ("Period"). */
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/**
 * A choice among a few values that applies at once (a period, a grouping):
 * radio buttons drawn as one segmented control, arrow keys included. More
 * than five options, or options that need words, is a SelectField.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  const name = React.useId();
  return (
    <fieldset
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg border bg-muted/40 p-0.5",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="cursor-pointer rounded-md px-2.5 py-1 font-mono text-xs text-muted-foreground has-checked:bg-background has-checked:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
